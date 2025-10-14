/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Navbar from "@/app/components/Navbar";
import Toast from "@/app/components/Toast";
import LiveStats from "@/app/components/LiveStats";
import CommentsPanel from "@/app/components/CommentsPanel";
import GiftsPanel from "@/app/components/GiftsPanel";
import UserCard from "@/app/components/UserCard";
import { useTikTokTracker } from "@/app/hooks/useTikTokTracker";

export default function HomePage() {
  const tracker = useTikTokTracker();
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [mode, setMode] = useState<"track" | "check">("track");
  const [username, setUsername] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [watchingInfo, setWatchingInfo] = useState<any>(null);
  const [loadingCheck, setLoadingCheck] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleTrack = async () => {
    if (!username) return showToast("Masukkan username TikTok dulu!", "error");
    setIsTracking(true);
    setProgress(50);

    try {
      const res = await fetch("http://localhost:8000/set_username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const json = await res.json();
      if (!json.isLive) {
        setIsTracking(false);
        setProgress(0);
        return showToast(`⚠️ User @${username} sedang offline.`, "error");
      }
      tracker.connect(username);
      setProgress(100);
      showToast(`🎯 Tracking @${username} dimulai!`, "success");
    } catch (err) {
      console.error(err);
      showToast("⚠️ Gagal menghubungkan server.", "error");
      setIsTracking(false);
    }
  };

  const handleCheckUser = async () => {
    if (!username) return showToast("Masukkan username TikTok dulu!", "error");
    setLoadingCheck(true);
    setWatchingInfo(null);

    try {
      const res = await fetch(`http://localhost:8000/check_user_watching/${username}`);
      const liveData = await res.json();
      if (liveData.isLive) {
        setWatchingInfo({
          message: liveData.message,
          liveUrl: liveData.liveUrl,
          user: {
            username,
            nickname: username.toUpperCase(),
            avatar: `https://unavatar.io/tiktok/${username}`,
            followers: Math.floor(Math.random() * 10000),
            following: Math.floor(Math.random() * 1000),
            heartCount: Math.floor(Math.random() * 50000),
            lastActive: "Just now",
            isOnlineRecently: true,
            bio: "Creator on TikTok 💫",
            profileUrl: `https://www.tiktok.com/@${username}`,
          },
        });
      } else {
        setWatchingInfo({
          message: `User @${username} sedang offline.`,
          user: null,
        });
      }
    } catch (err) {
      console.error(err);
      showToast("⚠️ Gagal mengambil data user TikTok", "error");
    } finally {
      setLoadingCheck(false);
    }
  };

  return (
    <div className="flex flex-col items-center pb-16 text-white">
      {toast && <Toast message={toast.message} type={toast.type} />}

      <Navbar mode={mode} status={tracker.connectionStatus} viewerCount={tracker.viewerCount} />

      <motion.div
        className="mt-24 text-center px-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-3xl font-bold mb-2">TikTok Live Tools</h1>
        <p className="text-gray-300 mb-6 text-sm sm:text-base">
          Pilih mode dan masukkan username TikTok.
        </p>

        {/* Mode Selector */}
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "track" | "check")}
          className="bg-white/10 border border-white/20 rounded-md px-3 py-2 mb-4 text-sm focus:border-pink-500 outline-none"
        >
          <option value="track">🎥 Track User Live</option>
          <option value="check">👀 Check User Watching</option>
        </select>

        {/* Input Username */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 bg-white/10 p-4 rounded-2xl border border-white/10 max-w-md mx-auto">
          <input
            type="text"
            placeholder="Masukkan username..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full sm:w-auto bg-transparent border border-white/20 rounded-md px-4 py-2 text-sm focus:border-pink-500 outline-none"
          />

          {mode === "track" ? (
            !isTracking ? (
              <button
                onClick={handleTrack}
                className="w-full sm:w-auto bg-gray-900 hover:bg-gray-800 text-white px-6 py-2 rounded-md text-sm"
              >
                🔍 Track Live
              </button>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await fetch("http://localhost:8000/stop_tracking", { method: "POST" });
                    setIsTracking(false);
                    tracker.disconnect?.();
                    showToast("🛑 Tracking stopped", "error");
                  } catch (err) {
                    console.error(err);
                    showToast("⚠️ Gagal menghentikan tracking", "error");
                  }
                }}
                className="w-full sm:w-auto bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-md text-sm"
              >
                🛑 Stop
              </button>
            )
          ) : (
            <button
              onClick={handleCheckUser}
              disabled={loadingCheck}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-md text-sm"
            >
              {loadingCheck ? "⏳ Checking..." : "🌐 Check"}
            </button>
          )}
        </div>
      </motion.div>

      {/* === MODE: TRACK === */}
      {mode === "track" && isTracking && (
        <>
          <LiveStats
            username={username}
            viewerCount={tracker.viewerCount}
            totalViews={tracker.totalViews}
            gifts={tracker.gifts.length}
            comments={tracker.comments.length}
            progress={progress}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-10 px-4 w-full max-w-5xl mx-auto">
            <CommentsPanel
              comments={tracker.comments}
              onClear={() => showToast("Komentar dibersihkan", "success")}
            />
            <GiftsPanel gifts={tracker.gifts} />
          </div>
        </>
      )}

      {/* === MODE: CHECK === */}
      {mode === "check" && watchingInfo && (
        <motion.div
          className="mt-10 bg-white/10 border border-white/10 px-6 py-6 rounded-2xl backdrop-blur-md text-center max-w-md shadow-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-lg mb-4 text-blue-400">{watchingInfo.message}</p>
          {watchingInfo.user && <UserCard user={watchingInfo.user} />}
        </motion.div>
      )}

      <footer className="mt-14 mb-6 text-center text-xs text-gray-400">
        Connected directly to TikTokLive backend via WebSocket. <br />
        © 2025 LiveStream Tracker. All rights reserved.
      </footer>
    </div>
  );
}
