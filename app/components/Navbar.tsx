"use client";
import { FaPlay } from "react-icons/fa";

export default function Navbar({
  mode,
  status,
  viewerCount,
}: {
  mode: string;
  status: string;
  viewerCount?: number | null;
}) {
  const statusColor =
    status === "connected"
      ? "bg-green-500"
      : status === "ended"
      ? "bg-gray-500"
      : status === "disconnected"
      ? "bg-yellow-500"
      : status === "connecting"
      ? "bg-blue-400"
      : "bg-gray-400";

  return (
    <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-white/5 border-b border-white/10 px-4 py-3 flex justify-between items-center">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
          <FaPlay className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base sm:text-lg font-semibold">LiveStream Tracker</h1>
          {mode === "track" && (
            <div className="flex items-center text-xs text-gray-300">
              <span className={`w-2 h-2 rounded-full mr-1 ${statusColor}`} />
              {status.toUpperCase()}
              {viewerCount && (
                <span className="ml-2 text-pink-300">👁️ {viewerCount}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
