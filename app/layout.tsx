import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import HomeApp from "./components/HomeApp";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TikTok Live Player",
  description: "Tonton video dan dengarkan audio live TikTok dengan pilihan kualitas.",
  authors: [{ name: "FullStackNotes" }],
  creator: "FullStackNotes",
};

export const viewport: Viewport = {
  themeColor: "#0f0b24",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex min-h-screen flex-col`}
      >
        <Navbar />
        <main className="flex-1 pt-20">
          <HomeApp />
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
