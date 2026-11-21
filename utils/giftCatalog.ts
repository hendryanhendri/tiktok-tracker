/**
 * Katalog gift bawaan (id gift TikTok -> nama, harga koin, gambar).
 *
 * Event gift dari TikTok sering datang TANPA nama/gambar/harga, dan daftar gift resminya butuh paket Euler Business (berbayar).
 * Jadi gift yang sudah dikenal dicatat di sini. Gift yang belum ada tampil sebagai "Gift #<id>"; tambahkan barisnya di bawah
 * (id muncul di panel Gift) agar namanya, gambarnya, dan nilai koinnya tampil. Server juga mengingat sendiri gift yang
 * eventnya membawa detail lengkap (disimpan di .gift-cache.json).
 */
export type KnownGift = { name: string; coins?: number; icon?: string; streak?: boolean };

export const GIFT_CATALOG: Record<number, KnownGift> = {
  5655: {
    name: "Rose",
    coins: 1,
    streak: true,
    icon: "https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648eaf88d7189~tplv-obj.png",
  },
};
