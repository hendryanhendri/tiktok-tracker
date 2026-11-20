"use client";
import { motion } from "framer-motion";
import { FaCircleCheck, FaCircleExclamation } from "react-icons/fa6";

export default function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  const ok = type === "success";
  return (
    <motion.div
      role={ok ? "status" : "alert"}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={`fixed bottom-4 left-4 right-4 z-[9999] flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm ${
        ok
          ? "border-emerald-400/40 bg-emerald-950/80 text-emerald-100"
          : "border-rose-400/40 bg-rose-950/80 text-rose-100"
      }`}
    >
      {ok ? (
        <FaCircleCheck aria-hidden className="h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <FaCircleExclamation aria-hidden className="h-4 w-4 shrink-0 text-rose-400" />
      )}
      <span>{message}</span>
    </motion.div>
  );
}
