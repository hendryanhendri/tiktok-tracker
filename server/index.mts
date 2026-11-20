/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Backend TikTok Live. Jalankan: npm run server
 *
 *  HTTP :8000  POST /set_username {username}   -> status live + daftar kualitas video, lalu mulai komentar/gift
 *              POST /stop_tracking
 *              GET  /estimate_gifts/:username
 *              GET  /proxy?u=<url>             -> proxy video (CORS/hotlink)
 *  WS   :8001  event: status, comment, gift, viewer
 *
 * - Video: dari API data room TikTok (tanpa Euler / tanpa tanda tangan).
 * - Komentar & gift: koneksi WebSocket TikTok, butuh penandatangan (Euler). Kunci opsional di .env:
 *   TIKTOK_SIGN_API_KEY=...   (tanpa kunci memakai kuota gratis yang terbatas)
 * - Hanya mendengarkan 127.0.0.1 (tanpa autentikasi, jangan dibuka ke jaringan).
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent, RouteConfig } from "tiktok-live-connector";
import { buildQualities, collectStreams } from "../app/lib/streams";
import { COIN_RATE_IDR } from "../utils/giftValue";

/* ---------- .env sederhana (tanpa dependensi) ---------- */
try {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {
  /* .env opsional */
}

const HOST = process.env.HOST ?? "127.0.0.1";
const HTTP_PORT = Number(process.env.API_PORT ?? 8000);
const WS_PORT = Number(process.env.WS_PORT ?? 8001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "http://localhost:3000";
const SIGN_API_KEY = process.env.TIKTOK_SIGN_API_KEY || undefined;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ---------- WebSocket ke browser ---------- */
const wss = new WebSocketServer({ port: WS_PORT, host: HOST });
let currentStatus = "offline";
const broadcast = (payload: unknown) => {
  const msg = JSON.stringify(payload);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
};
const setStatus = (status: string) => {
  currentStatus = status;
  broadcast({ type: "status", status });
};
wss.on("connection", (ws) => ws.send(JSON.stringify({ type: "status", status: currentStatus })));

/* ---------- Sesi komentar/gift ---------- */
type Tally = { name: string; count: number; totalCoin: number };
type Session = { username: string; connection: TikTokLiveConnection; gifts: Map<string, Tally> };
const sessions = new Map<string, Session>();
let activeUser: string | null = null;

const norm = (u: string) => u.trim().replace(/^@/, "").toLowerCase();
const firstUrl = (x: any): string | undefined => {
  const list: string[] = x?.urls ?? x?.urlList ?? x?.url_list ?? (Array.isArray(x) ? x : []);
  return list.find((u) => typeof u === "string" && !/\.heic(\?|$)/i.test(u)) ?? list[0];
};
const userName = (u: any): string => u?.uniqueId ?? u?.nickname ?? "unknown";
const userAvatar = (u: any) =>
  firstUrl(u?.profilePicture) ?? firstUrl(u?.avatarThumb) ?? firstUrl(u?.avatarMedium) ?? firstUrl(u?.avatarLarge);

const newConnection = (username: string) => new TikTokLiveConnection(username, { signApiKey: SIGN_API_KEY });

async function startSession(username: string): Promise<Session> {
  const existing = sessions.get(username);
  if (existing?.connection.isConnected || existing?.connection.isConnecting) return existing;

  const session: Session = existing ?? { username, connection: newConnection(username), gifts: new Map() };
  sessions.set(username, session);
  const isActive = () => activeUser === username;

  let lastErr: any;
  // TikTok kadang menolak profil perangkat acak (DEVICE_BLOCKED): ulangi dengan koneksi/profil baru.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const connection = newConnection(username);
    session.connection = connection;

    connection.on(WebcastEvent.CHAT, (d: any) => {
      if (!isActive()) return;
      broadcast({ type: "comment", user: userName(d.user), text: d.comment ?? d.content ?? "", avatar: userAvatar(d.user) });
    });

    connection.on(WebcastEvent.GIFT, (d: any) => {
      // Gift streak (type 1): hitung hanya saat streak selesai agar tidak dobel.
      if (d.giftDetails?.giftType === 1 && !d.repeatEnd) return;
      const name: string = d.giftDetails?.giftName ?? `Gift #${d.giftId}`;
      const count: number = d.repeatCount || 1;
      const t = session.gifts.get(name) ?? { name, count: 0, totalCoin: 0 };
      t.count += count;
      t.totalCoin += (d.giftDetails?.diamondCount ?? 0) * count;
      session.gifts.set(name, t);
      if (isActive()) {
        const gd = d.giftDetails ?? {};
        broadcast({
          type: "gift",
          user: userName(d.user),
          gift: name,
          count,
          coins: (Number(gd.diamondCount) || 0) * count, // nilai koin total (jumlah x harga)
          icon: firstUrl(gd.giftImage) ?? firstUrl(gd.image) ?? firstUrl(gd.icon) ?? (typeof gd.giftPictureUrl === "string" ? gd.giftPictureUrl : undefined),
          avatar: userAvatar(d.user),
        });
      }
    });

    connection.on(WebcastEvent.ROOM_USER, (d: any) => {
      if (!isActive()) return;
      const num = (x: any) => (x === undefined || x === null || x === "" || Number.isNaN(Number(x)) ? null : Number(x));
      const viewerCount = num(d.viewerCount) ?? num(d.total) ?? num(d.popularity);
      // Event tanpa angka penonton jangan menimpa nilai terakhir di UI dengan null.
      if (viewerCount !== null || num(d.totalUser) !== null) {
        broadcast({ type: "viewer", viewerCount, totalViews: num(d.totalUser) ?? 0 });
      }
    });
    connection.on(WebcastEvent.STREAM_END, () => isActive() && setStatus("ended"));
    connection.on(ControlEvent.DISCONNECTED, () => {
      if (isActive() && currentStatus !== "ended") setStatus("disconnected");
    });
    connection.on(ControlEvent.ERROR, (e: any) => console.error(`[${username}] error:`, e?.message ?? e));

    try {
      await connection.connect();
      return session;
    } catch (e: any) {
      lastErr = e;
      try {
        await connection.disconnect();
      } catch {
        /* belum tersambung */
      }
      if (!/DEVICE_BLOCKED/i.test(String(e?.message ?? e))) break;
      console.warn(`[${username}] DEVICE_BLOCKED, mencoba ulang dengan profil baru (${attempt}/3)`);
    }
  }
  throw lastErr;
}

async function stopSession(username: string) {
  try {
    await sessions.get(username)?.connection.disconnect();
  } catch {
    /* sudah terputus */
  }
}

/* ---------- Info room + URL video (API data room, tanpa Euler) ---------- */
async function getRoom(username: string) {
  const conn = newConnection(username);
  const r: any = await RouteConfig.fetchRoomInfoFromApiLive({ webClient: conn.webClient, uniqueId: username });
  const room = r?.data?.liveRoom ?? {};
  const isLive = room.status === 2; // 2 = sedang live, 4 = berakhir
  if (!isLive) return { isLive: false as const };

  const { urls, meta } = collectStreams(room);
  const qualities = buildQualities(urls, meta);
  console.log(`[room] @${username} live, ${qualities.length} kualitas: ${qualities.map((q) => q.label).join(", ") || "-"}`);
  return {
    isLive: true as const,
    roomId: String(r?.data?.user?.roomId ?? ""),
    title: room.title ?? null,
    coverUrl: firstUrl(room.coverUrl) ?? (typeof room.coverUrl === "string" ? room.coverUrl : null),
    qualities,
    hlsUrl: qualities.at(-1)?.url ?? null,
  };
}

/* ---------- Proxy video ---------- */
function isSafeTarget(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname;
    return !(h === "localhost" || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(":"));
  } catch {
    return false;
  }
}
const proxied = (abs: string) => `/proxy?u=${encodeURIComponent(abs)}`;
function rewritePlaylist(text: string, base: string) {
  const abs = (ref: string) => new URL(ref, base).toString();
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${proxied(abs(uri))}"`);
      return proxied(abs(t));
    })
    .join("\n");
}
async function handleProxy(target: string, res: http.ServerResponse) {
  if (!isSafeTarget(target)) return void res.writeHead(400).end("URL tidak valid");
  const label = (() => {
    try {
      const u = new URL(target);
      return `${u.host}/…/${u.pathname.split("/").pop()}`;
    } catch {
      return "?";
    }
  })();
  const upstream = await fetch(target, { headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/" } });
  console.log(`[proxy] ${upstream.status} ${upstream.headers.get("content-type") ?? "-"} ${label}`);
  if (!upstream.ok || !upstream.body) return void res.writeHead(upstream.status || 502).end("Upstream error");

  const type = upstream.headers.get("content-type") ?? "";
  if (/mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(target)) {
    res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" });
    return void res.end(rewritePlaylist(await upstream.text(), target));
  }
  res.writeHead(200, { "Content-Type": type || "application/octet-stream", "Cache-Control": "no-store" });
  const reader = upstream.body.getReader();
  let bytes = 0;
  res.on("close", () => {
    console.log(`[proxy] selesai ${label}: ${(bytes / 1024).toFixed(0)} KB terkirim`);
    void reader.cancel().catch(() => {});
  });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (!res.write(value)) await new Promise((r) => res.once("drain", r));
  }
  res.end();
}

/* ---------- HTTP ---------- */
const send = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
async function readJson(req: http.IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
const errText = (e: any) => {
  const m = String(e?.message ?? e);
  if (/rate.?limit/i.test(m)) return "Batas penandatangan (Euler) tercapai. Tunggu sebentar lalu coba lagi.";
  if (e?.constructor?.name === "UserOfflineError") return "User sedang tidak live.";
  return m.split(SIGN_API_KEY ?? "\0").join("***");
};

http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return void res.writeHead(204).end();

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const [, route, param] = url.pathname.split("/");
    const username = param ? norm(decodeURIComponent(param)) : "";

    try {
      if (req.method === "POST" && route === "set_username") {
        const name = norm(String((await readJson(req)).username ?? ""));
        if (!/^[\w.]{1,40}$/.test(name)) return send(res, 400, { error: "Username tidak valid." });

        const room = await getRoom(name);
        if (!room.isLive) return send(res, 200, { isLive: false });

        if (activeUser && activeUser !== name) await stopSession(activeUser);
        activeUser = name;
        setStatus("connecting");
        // Video tidak boleh gagal hanya karena komentar/gift (Euler) bermasalah.
        let chat: { ok: boolean; error?: string } = { ok: true };
        try {
          await startSession(name);
          setStatus("connected");
        } catch (e) {
          chat = { ok: false, error: errText(e) };
          setStatus("disconnected");
          console.warn(`[chat] @${name}:`, chat.error);
        }

        // API data room tidak selalu memuat URL stream. Coba juga roomInfo dari koneksi yang tersambung.
        let qualities = room.qualities;
        let videoNote: string | null = null;
        const info: any = sessions.get(name)?.connection.roomInfo;
        if (!qualities.length && info) {
          const found = collectStreams(info);
          qualities = buildQualities(found.urls, found.meta);
        }
        if (!qualities.length) {
          const code = info?.status_code;
          console.warn(`[room] @${name}: tidak ada URL video (roomInfo.status_code=${code ?? "-"})`);
          videoNote =
            code === 4003110
              ? "TikTok menolak memberi URL video untuk live ini (kode 4003110), kemungkinan live dibatasi (usia/login) atau khusus audio. Komentar dan gift tetap berjalan."
              : "TikTok tidak memberi URL video untuk live ini. Komentar dan gift tetap berjalan.";
        }
        return send(res, 200, { ...room, qualities, hlsUrl: qualities.at(-1)?.url ?? null, chat, videoNote });
      }

      if (req.method === "POST" && route === "stop_tracking") {
        if (activeUser) await stopSession(activeUser);
        activeUser = null;
        setStatus("offline");
        return send(res, 200, { ok: true });
      }

      if (req.method === "GET" && route === "estimate_gifts" && username) {
        const s = sessions.get(username);
        if (!s) return send(res, 404, { error: "Belum ada data gift. Mulai Track user ini dulu saat sedang live." });
        const gifts = [...s.gifts.values()]
          .sort((a, b) => b.totalCoin - a.totalCoin)
          .map((g) => ({ ...g, totalRupiah: g.totalCoin * COIN_RATE_IDR }));
        return send(res, 200, {
          username,
          isLive: !!s.connection.isConnected,
          gifts,
          totalRupiah: gifts.reduce((a, g) => a + g.totalRupiah, 0),
        });
      }

      if (req.method === "GET" && route === "proxy") return await handleProxy(url.searchParams.get("u") ?? "", res);

      send(res, 404, { error: "Not found" });
    } catch (e: any) {
      console.error(`[${req.method} ${url.pathname}]`, errText(e));
      if (res.headersSent) return void res.end();
      send(res, 500, { error: errText(e) });
    }
  })
  .listen(HTTP_PORT, HOST, () => {
    console.log(`API : http://${HOST}:${HTTP_PORT}`);
    console.log(`WS  : ws://${HOST}:${WS_PORT}`);
    console.log(SIGN_API_KEY ? "Euler: memakai API key dari .env" : "Euler: tanpa API key (kuota gratis terbatas)");
  });

process.on("SIGINT", async () => {
  await Promise.all([...sessions.keys()].map(stopSession));
  process.exit(0);
});
