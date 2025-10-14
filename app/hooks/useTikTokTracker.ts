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

  const connect = (uname: string) => {
    const ws = new WebSocket("ws://localhost:8001");
    socketRef.current = ws;
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.type === "comment") setComments((p) => [...p, data]);
      if (data.type === "gift") setGifts((p) => [...p, data]);
      if (data.type === "viewer") {
        setViewerCount(data.viewerCount);
        setTotalViews(data.totalViews);
      }
    };
  };

  return {
    connectionStatus,
    comments,
    gifts,
    viewerCount,
    totalViews,
    giftTotal,
    connect,
  };
}
