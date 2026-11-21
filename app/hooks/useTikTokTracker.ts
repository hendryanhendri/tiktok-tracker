/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { WS_URL } from "@/app/lib/config";
import { useEffect, useRef, useState } from "react";

const MAX_COMMENTS = 600; // batasi daftar komentar di memori browser; total tetap dihitung terpisah
const MAX_GIFTS = 5000;

export function useTikTokTracker() {
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [comments, setComments] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [totalViews, setTotalViews] = useState(0);
  const [giftTotal, setGiftTotal] = useState(0);
  const [commentTotal, setCommentTotal] = useState(0); // total diterima sejak track dimulai (tidak terpotong)

  const socketRef = useRef<WebSocket | null>(null);
  const idRef = useRef(0);
  const stamp = (data: any) => ({ ...data, id: ++idRef.current, ts: Date.now() });


  const connect = (uname: string) => {
    if (socketRef.current) socketRef.current.close();

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setConnectionStatus("connected");
    };

    ws.onclose = () => {
      console.log("⚠️ WebSocket disconnected");
      setConnectionStatus("offline");
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      setConnectionStatus("error");
    };

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      switch (data.type) {
        case "status":
          setConnectionStatus(data.status || "offline");
          break;
        case "comment":
          setComments((p) => [...p, stamp(data)].slice(-MAX_COMMENTS));
          setCommentTotal((n) => n + 1);
          break;
        case "gift":
          setGifts((p) => [...p, stamp(data)].slice(-MAX_GIFTS));
          break;
        case "viewer":
          if (data.viewerCount != null) setViewerCount(data.viewerCount);
          if (data.totalViews) setTotalViews(data.totalViews);
          break;
      }
    };
  };

  const disconnect = () => {
    if (socketRef.current) {
      console.log("🔌 Closing WebSocket connection...");
      socketRef.current.close();
      socketRef.current = null;
    }
    setConnectionStatus("offline");
    setComments([]);
    setGifts([]);
    setViewerCount(null);
    setTotalViews(0);
    setGiftTotal(0);
    setCommentTotal(0);
  };

  // Putuskan koneksi tetapi biarkan komentar/gift/statistik tetap terlihat (dipakai saat live berakhir).
  const stop = (finalStatus = "ended") => {
    const ws = socketRef.current;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      socketRef.current = null;
    }
    setConnectionStatus(finalStatus);
  };

  const clearComments = () => setComments([]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    connectionStatus,
    comments,
    gifts,
    viewerCount,
    totalViews,
    giftTotal,
    commentTotal,
    connect,
    disconnect,
    stop,
    clearComments,
  };
}
