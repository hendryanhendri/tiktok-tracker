"use client";
import { useEffect, useRef } from "react";
import flvjs from "flv.js";

export default function LivePlayer({ flvUrl }: { flvUrl: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && flvjs.isSupported() && videoRef.current) {
      const flvPlayer = flvjs.createPlayer({ type: "flv", url: flvUrl });
      flvPlayer.attachMediaElement(videoRef.current);
      flvPlayer.load();
      flvPlayer.play();

      return () => flvPlayer.destroy();
    }
  }, [flvUrl]);

  return (
    <div className="flex justify-center mt-8">
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        className="w-full max-w-xl rounded-2xl border border-white/10 shadow-lg bg-black"
      />
    </div>
  );
}
