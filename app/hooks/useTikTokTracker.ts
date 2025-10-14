/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useRef, useState } from "react";

export function useTikTokTracker() {
  const [connectionStatus, setConnectionStatus] = useState("offline");
  const [comments, setComments] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [totalViews, setTotalViews] = useState(0);
  const [giftTotal, setGiftTotal] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);

  // ✅ CONNECT — buka koneksi WebSocket
  const connect = (uname: string) => {
    if (socketRef.current) socketRef.current.close();

    const ws = new WebSocket("ws://localhost:8001");
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
          setComments((p) => [...p, data]);
          break;
        case "gift":
          setGifts((p) => [...p, data]);
          break;
        case "viewer":
          setViewerCount(data.viewerCount);
          setTotalViews(data.totalViews);
          break;
      }
    };
  };

  // ✅ DISCONNECT — tutup koneksi WebSocket
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
  };

  // ✅ Cleanup otomatis saat komponen di-unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);

  // ✅ Return semua fungsi & state
  return {
    connectionStatus,
    comments,
    gifts,
    viewerCount,
    totalViews,
    giftTotal,
    connect,
    disconnect, // ✅ ini yang ditambahkan
  };
}
