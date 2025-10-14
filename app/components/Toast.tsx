"use client";
import { motion } from "framer-motion";

export default function Toast({
  message,
  type,
}: {
  message: string;
  type: "success" | "error";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ duration: 0.3 }}
      className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm text-white z-[9999] ${
        type === "success" ? "bg-green-500" : "bg-red-500"
      }`}
    >
      {message}
    </motion.div>
  );
}
