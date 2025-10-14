/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { estimateGiftValue } from "@/utils/giftValue";

export default function LiveStats({
  username,
  viewerCount,
  totalViews,
  gifts,
  comments,
  progress,
  allGifts,
}: any) {
  const estimatedRevenue = useMemo(() => {
    if (!Array.isArray(allGifts) || !allGifts.length) return 0;

    const total = allGifts.reduce((sum: number, g: any) => {
      return sum + estimateGiftValue(g.gift, g.count || 1);
    }, 0);

    return total;
  }, [allGifts]);

  return (
    <>
      <div className="mt-8 w-4/5 sm:max-w-md mx-auto bg-white/10 rounded-full h-3 overflow-hidden border border-white/10">
        <motion.div
          className="h-full bg-gradient-to-r from-pink-500 to-blue-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ ease: "easeOut", duration: 0.2 }}
        />
      </div>

      <motion.div
        className="mt-8 bg-white/10 border border-white/10 px-6 py-4 rounded-2xl backdrop-blur-md text-center max-w-3xl shadow-lg"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-lg sm:text-xl font-semibold mb-2">@{username || "—"}</h2>
        <div className="flex justify-center gap-6 text-sm sm:text-base text-gray-300 flex-wrap">
          <div>
            👁️ Viewers: <span className="font-semibold text-pink-400">{viewerCount ?? "—"}</span>
          </div>
          <div>
            📈 Total Views: <span className="font-semibold text-blue-400">{totalViews ?? "—"}</span>
          </div>
          <div>
            🎁 Gifts: <span className="font-semibold text-white">{gifts}</span>
          </div>
          <div>
            💬 Comments: <span className="font-semibold text-white">{comments}</span>
          </div>
        </div>

        {/* Tambahan estimasi pendapatan */}
        {/* <div className="mt-4 text-lg font-semibold text-green-400">
          💰 Estimasi Pendapatan:{" "}
          <span className="text-white">
            Rp {estimatedRevenue.toLocaleString("id-ID")}
          </span>
        </div> */}
      </motion.div>
    </>
  );
}
