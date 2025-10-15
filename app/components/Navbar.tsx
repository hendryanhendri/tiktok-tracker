"use client";
import { useState } from "react";
import { FaPlay, FaChartBar, FaGift, FaCog, FaCommentDots, FaBell, FaUser } from "react-icons/fa";

export default function Navbar({
  mode,
  status,
  viewerCount,
}: {
  mode: string;
  status: string;
  viewerCount?: number | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

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

  const menus = [
    { name: "Dashboard", icon: <FaChartBar />, href: "/dashboard" },
    { name: "Live", icon: <FaPlay />, href: "/" },
    { name: "Comments", icon: <FaCommentDots />, href: "/comments" },
    { name: "Gifts", icon: <FaGift />, href: "/gift-estimator" },
    { name: "Notifications", icon: <FaBell />, href: "/notifications" },
    { name: "Settings", icon: <FaCog />, href: "/settings" },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-white/5 border-b border-white/10 px-4 py-3 flex justify-between items-center">
      {/* === LEFT SIDE === */}
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

      {/* === RIGHT SIDE MENU === */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center bg-white/10 px-3 py-2 rounded-lg hover:bg-white/20 transition"
        >
          <FaUser className="text-white mr-2" />
          <span className="text-sm text-gray-200">Menu</span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-gray-900/90 backdrop-blur-md border border-white/10 rounded-xl shadow-lg overflow-hidden">
            {menus.map((menu) => (
              <a
                key={menu.name}
                href={menu.href}
                className="flex items-center gap-2 px-4 py-2 text-gray-200 hover:bg-white/10 transition"
              >
                {menu.icon}
                <span>{menu.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
