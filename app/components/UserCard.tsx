/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

/* eslint-disable @next/next/no-img-element */
export default function UserCard({ user }: { user: any }) {
  if (!user) {
    return (
      <div className="mt-8 bg-white/10 border border-white/10 rounded-xl p-5 text-center text-gray-400">
        ⚠️ Belum ada data pengguna.
      </div>
    );
  }

  return (
    <div className="mt-8 bg-white/10 border border-white/10 rounded-xl p-5 backdrop-blur-md text-sm space-y-3 max-w-md mx-auto shadow-lg">
      {/* Header User */}
      <div className="flex items-center space-x-4">
        <img
          src={user.avatar || "/default-avatar.png"}
          alt="avatar"
          className="w-16 h-16 rounded-full border border-white/20 object-cover"
        />
        <div>
          <p className="text-lg font-semibold text-pink-300">@{user.username}</p>
          <p className="text-gray-300 text-sm">{user.nickname || "No nickname"}</p>
        </div>
      </div>

      {/* Bio */}
      {user.bio && (
        <p className="mt-3 text-gray-400 text-sm leading-relaxed border-t border-white/10 pt-3">
          {user.bio}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-gray-300 text-sm border-t border-white/10 pt-3">
        <p>👥 Followers: <span className="font-semibold text-white">{user.followers ?? "—"}</span></p>
        <p>🔁 Following: <span className="font-semibold text-white">{user.following ?? "—"}</span></p>
        <p>❤️ Likes: <span className="font-semibold text-white">{user.heartCount ?? "—"}</span></p>
        <p>🕓 Last Active: <span className="text-blue-400">{user.lastActive || "Unknown"}</span></p>
        <p>🟢 Status: <span className={user.isOnlineRecently ? "text-green-400" : "text-gray-400"}>
          {user.isOnlineRecently ? "Online recently" : "Offline"}
        </span></p>
      </div>

      {/* CTA or Link */}
      {user.profileUrl && (
        <a
          href={user.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-3 text-center bg-pink-600 hover:bg-pink-500 text-white py-2 rounded-md text-sm transition"
        >
          🔗 Lihat Profil TikTok
        </a>
      )}
    </div>
  );
}
