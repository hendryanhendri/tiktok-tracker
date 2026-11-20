import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Memungkinkan build verifikasi ke folder lain (NEXT_DIST_DIR) tanpa menimpa .next milik dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Alamat lama dialihkan ke dokumentasi.
  async redirects() {
    return [
      { source: "/gift-estimator", destination: "/doc", permanent: false },
      { source: "/panduan", destination: "/doc", permanent: false },
    ];
  },
};

export default nextConfig;
