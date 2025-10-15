"use client";
import Hls from "hls.js";
import { useEffect, useRef } from "react";

export default function LivePlayer({ hlsUrl }: { hlsUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!hlsUrl || !videoRef.current) return;

    if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = hlsUrl;
    } else if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.ERROR, function (event, data) {
        console.error("HLS error:", data);
      });
      return () => hls.destroy();
    } else {
      console.error("HLS not supported in this browser.");
    }
  }, [hlsUrl]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      className="rounded-2xl w-full max-w-xl border border-white/10 shadow-lg bg-black mt-8"
    />
  );
}
