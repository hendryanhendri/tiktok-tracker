/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { motion, AnimatePresence } from "framer-motion";

export default function CommentsPanel({ comments, onClear }: any) {
  const reversedComments = [...comments].reverse();

  const handleExportCSV = () => {
    if (!comments.length) return alert("Tidak ada komentar untuk di-export!");

    const headers = ["No", "Username", "Comment", "Avatar URL"];

    const rows = comments.map((c: any, i: number) => [
      i + 1,
      c.user || "",
      `"${(c.text || "").replace(/"/g, '""')}"`,
      c.avatar || "",
    ]);

    const csvContent =
      headers.join(",") +
      "\n" +
      rows.map((r: any[]) => r.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `tiktok_comments_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white/10 border border-white/10 rounded-2xl p-5 backdrop-blur-md shadow-md">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-lg">💬 Comments</h3>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-md"
          >
            ⬇️ Export CSV
          </button>
          <button
            onClick={onClear}
            className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded-md"
          >
            🧹 Clear
          </button>
        </div>
      </div>

      {/* === LIST KOMENTAR === */}
      <div className="h-56 overflow-y-auto space-y-2 text-sm scrollbar-thin flex flex-col-reverse">
        <AnimatePresence>
          {reversedComments.length ? (
            reversedComments.map((c: any, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="border-b border-white/10 pb-2 flex items-start space-x-3 text-gray-300"
              >
                {/* Klik avatar → buka profil TikTok */}
                <a
                  href={`https://www.tiktok.com/@${c.user}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src={c.avatar || "/default-avatar.png"}
                    alt="avatar"
                    className="w-8 h-8 rounded-full border border-white/10 object-cover cursor-pointer hover:scale-110 transition-transform"
                  />
                </a>

                <div className="flex-1">
                  <a
                    href={`https://www.tiktok.com/@${c.user}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-pink-400 font-semibold hover:underline"
                  >
                    @{c.user}
                  </a>
                  <p className="text-gray-200 text-sm">{c.text}</p>
                </div>
              </motion.div>
            ))
          ) : (
            <p className="text-gray-400 text-center">No comments yet...</p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
