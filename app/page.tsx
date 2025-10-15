/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import Navbar from "@/app/components/Navbar";
import Toast from "@/app/components/Toast";
import LiveStats from "@/app/components/LiveStats";
import CommentsPanel from "@/app/components/CommentsPanel";
import GiftsPanel from "@/app/components/GiftsPanel";
import UserCard from "@/app/components/UserCard";
import { useTikTokTracker } from "@/app/hooks/useTikTokTracker";
import dynamic from "next/dynamic";

const LivePlayer = dynamic(() => import("@/app/components/LivePlayer"), { ssr: false });

export default function HomePage() {
  const tracker = useTikTokTracker();

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [mode, setMode] = useState<"track" | "check" | "find">("track");
  const [username, setUsername] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [watchingInfo, setWatchingInfo] = useState<any>(null);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [target, setTarget] = useState("");

  // Mode find
  const [scanList, setScanList] = useState<{ iteration: number; usernames: string[] }>({ iteration: 0, usernames: [] });
  const [foundUser, setFoundUser] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Disconnected");

  // WebSocket handler
  useEffect(() => {
    const socket = new WebSocket("ws://localhost:8001");
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "status") setStatus(data.status);
      if (data.type === "scan_progress") setScanList({ iteration: data.iteration, usernames: data.usernames });
      if (data.type === "target_found") {
        setFoundUser(data);
        showToast(`🎯 Target @${data.username} ditemukan!`, "success");
        setIsScanning(false);
      }
    };
    socket.onclose = () => setStatus("Disconnected");
    return () => socket.close();
  }, []);

  // Toast util
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  /* ============================================================
     MODE 1 — TRACK USER LIVE
     ============================================================ */
  const handleTrack = async () => {
    if (!username.trim()) return showToast("Masukkan username TikTok dulu!", "error");
    setIsTracking(true);
    setProgress(40);

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

      setWatchingInfo({
        roomId: json.roomId,
        coverUrl: json.coverUrl,
        hlsUrl: json.hlsUrl,
        flvUrl: json.flvUrl,
      });
    } catch (err) {
      console.error(err);
      showToast("⚠️ Gagal menghubungkan server.", "error");
      setIsTracking(false);
    }
  };

  const handleStopTracking = async () => {
    try {
      await fetch("http://localhost:8000/stop_tracking", { method: "POST" });
      setIsTracking(false);
      tracker.disconnect?.();
      setWatchingInfo(null);
      showToast("🛑 Tracking stopped", "error");
    } catch (err) {
      console.error(err);
      showToast("⚠️ Gagal menghentikan tracking", "error");
    }
  };

  /* ============================================================
     MODE 2 — CHECK USER WATCHING
     ============================================================ */
  const handleCheckUser = async () => {
    if (!target.trim()) return showToast("Masukkan target username dulu!", "error");
    setLoadingCheck(true);
    setWatchingInfo({
      message: "🔍 Memeriksa status user...",
      user: null,
    });

    try {
      const res = await fetch(`http://localhost:8000/check_user_watching/${target.trim()}`);
      const data = await res.json();

      setWatchingInfo(data);
      if (data.isLive) showToast(`🎥 @${target} sedang LIVE!`, "success");
      else showToast(`⚪ @${target} tidak sedang live.`, "error");
    } catch (err) {
      console.error(err);
      showToast("⚠️ Gagal mengecek user.", "error");
    } finally {
      setLoadingCheck(false);
    }
  };

  /* ============================================================
     MODE 3 — FIND USER IN LIVE EXPLORE
     ============================================================ */
  const handleFindLive = async () => {
    if (!target.trim()) return showToast("Masukkan username dulu!", "error");
    setLoadingCheck(true);
    setIsScanning(true);
    setFoundUser(null);
    setScanList({ iteration: 0, usernames: [] });

    showToast("🔎 Memulai pemindaian Live Explore...", "success");

    try {
      await fetch(`http://localhost:8000/find_live_until_found/${target.trim()}`);
    } catch (err) {
      console.error(err);
      showToast("⚠️ Gagal memulai pencarian user di Live Explore.", "error");
      setIsScanning(false);
    } finally {
      setLoadingCheck(false);
    }
  };

  const handleStopScan = () => {
    setIsScanning(false);
    showToast("🛑 Pemindaian dihentikan.", "error");
  };

  /* ============================================================
     UI RENDERING
     ============================================================ */
  return (
    <div className="flex flex-col items-center pb-16 text-white">
      {toast && <Toast message={toast.message} type={toast.type} />}
      <Navbar mode={mode} status={status} viewerCount={tracker.viewerCount} />

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
          onChange={(e) => setMode(e.target.value as "track" | "check" | "find")}
          className="bg-white/10 border border-white/20 rounded-md px-3 py-2 mb-4 text-sm focus:border-pink-500 outline-none"
        >
          <option value="track">🎥 Track User Live</option>
          <option value="check">👀 Check User Watching</option>
          <option value="find">🌍 Find User in Live Explore</option>
        </select>

        {/* Input username + button */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-3 bg-white/10 p-4 rounded-2xl border border-white/10 max-w-md mx-auto">
          <input
            type="text"
            placeholder="Masukkan username..."
            value={mode === "track" ? username : target}
            onChange={(e) => {
              if (mode === "track") setUsername(e.target.value);
              else setTarget(e.target.value);
            }}
            className="w-full sm:w-auto bg-transparent border border-white/20 rounded-md px-4 py-2 text-sm focus:border-pink-500 outline-none"
          />

          {mode === "track" ? (
            !isTracking ? (
              <button onClick={handleTrack} className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2 rounded-md text-sm">
                🔍 Track Live
              </button>
            ) : (
              <button onClick={handleStopTracking} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-md text-sm">
                🛑 Stop
              </button>
            )
          ) : mode === "check" ? (
            <button
              onClick={handleCheckUser}
              disabled={loadingCheck}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-md text-sm"
            >
              {loadingCheck ? "⏳ Checking..." : "🌐 Check"}
            </button>
          ) : !isScanning ? (
            <button
              onClick={handleFindLive}
              disabled={loadingCheck}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-md text-sm"
            >
              {loadingCheck ? "🔎 Searching..." : "🌍 Find Live"}
            </button>
          ) : (
            <button onClick={handleStopScan} className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-md text-sm">
              🛑 Stop Scanning
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

          {/* Player */}
          {watchingInfo?.hlsUrl && <LivePlayer hlsUrl={watchingInfo.hlsUrl} />}

          {/* Comments & Gifts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-10 px-4 w-full max-w-5xl mx-auto">
            <CommentsPanel comments={tracker.comments} onClear={() => showToast("Komentar dibersihkan", "success")} />
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

      {/* === MODE: FIND === */}
      {mode === "find" && isScanning && (
        <motion.div
          className="mt-8 bg-white/10 border border-white/20 rounded-2xl p-5 w-full max-w-2xl text-center shadow-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {/* Header scanning */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
            <h3 className="text-pink-400 font-semibold">Memindai Live TikTok... Iterasi ke-{scanList.iteration}</h3>
          </div>

          {/* Daftar hasil scanning */}
          <div className="max-h-[400px] overflow-y-auto text-left divide-y divide-white/10 scrollbar-thin scrollbar-thumb-pink-500/30 scrollbar-track-transparent">
            {scanList.usernames.length > 0 ? (
              scanList.usernames.map((username, i) => (
                <a
                  key={i}
                  href={`https://www.tiktok.com/@${username}/live`}
                  target="_blank"
                  className="flex items-center gap-4 py-3 px-2 hover:bg-white/5 rounded-xl transition-all duration-200 group"
                >
                  <img
                    src={`https://unavatar.io/tiktok/${username}`}
                    alt={username}
                    className="w-10 h-10 rounded-full object-cover border border-white/20 group-hover:border-pink-400 transition-all"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium group-hover:text-pink-400 transition-colors">@{username}</span>
                    <span className="text-xs text-gray-400">Klik untuk buka live</span>
                  </div>
                </a>
              ))
            ) : (
              <p className="italic text-gray-500 text-center py-6">Menunggu hasil scan...</p>
            )}
          </div>
        </motion.div>
      )}

      {mode === "find" && foundUser && (
        <motion.div
          className="mt-6 bg-green-600/20 border border-green-400/50 rounded-xl p-4 max-w-md text-center"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <h3 className="text-lg font-semibold text-green-300 mb-2">
            🎯 Ditemukan: @{foundUser.username}
          </h3>
          <img src={foundUser.cover} alt="" className="w-40 h-40 rounded-xl mx-auto object-cover mb-2" />
          <a href={foundUser.liveUrl} target="_blank" className="text-blue-400 underline">
            🔗 Buka Live TikTok
          </a>
        </motion.div>
      )}
    </div>
  );
}
