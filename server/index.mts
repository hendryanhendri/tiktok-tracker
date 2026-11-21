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
import { readFileSync, writeFileSync } from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { TikTokLiveConnection, WebcastEvent, ControlEvent, RouteConfig } from "tiktok-live-connector";
import { buildQualities, collectStreams } from "../app/lib/streams";
import { COIN_RATE_IDR } from "../utils/giftValue";
import { GIFT_CATALOG, type KnownGift } from "../utils/giftCatalog";

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
// Asal (origin) halaman yang boleh memanggil API ini: localhost, 127.0.0.1, dan nama lokal fsn.live.test (dengan/tanpa port 3000).
// ALLOWED_ORIGIN (opsional, pisahkan dengan koma) menambah asal lain, mis. "http://nama-lain.test".
const APP_HOSTS = ["localhost", "127.0.0.1", "fsn.live.test"];
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const originAllowed = (origin?: string): boolean => {
  if (!origin) return false;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && APP_HOSTS.includes(u.hostname) && (u.port === "" || u.port === "3000");
  } catch {
    return false;
  }
};
const SIGN_API_KEY = process.env.TIKTOK_SIGN_API_KEY || undefined;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ---------- WebSocket ke browser ---------- */
// Halaman web dari situs lain tidak boleh menyambung ke WebSocket ini; klien tanpa Origin (bukan browser) tetap boleh.
const wss = new WebSocketServer({ port: WS_PORT, host: HOST, verifyClient: ({ origin }) => !origin || originAllowed(origin) });
let currentStatus = "offline";
const broadcast = (payload: unknown) => {
  const msg = JSON.stringify(payload);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
};
const setStatus = (status: string) => {
  currentStatus = status;
  broadcast({ type: "status", status });
};
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "status", status: currentStatus }));
  if (currentGoals.length) ws.send(JSON.stringify({ type: "goal", goals: currentGoals }));
});

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
/** URL gambar dari berbagai bentuk data TikTok: {urlList}/{url_list}/{urls}, {giftPictureUrl}, {url: [..]|".."}, atau string. */
const imgUrl = (x: any): string | undefined => {
  if (!x) return undefined;
  if (typeof x === "string") return x;
  const direct = firstUrl(x);
  if (direct) return direct;
  if (typeof x.giftPictureUrl === "string" && x.giftPictureUrl) return x.giftPictureUrl;
  if (typeof x.url === "string" && x.url) return x.url;
  if (Array.isArray(x.url)) return x.url.find((u: unknown) => typeof u === "string");
  return undefined;
};
/* ---------- Contoh event challenge/target/battle (untuk membangun tampilannya) ---------- */
// Event ini hanya muncul di live yang sedang punya target gift (goal), battle, atau polling. Bentuk datanya tidak terdokumentasi,
// jadi 2 contoh pertama tiap jenis disimpan ke .event-samples.json (lokal, tidak masuk git; avatar/lencana dibuang).
const SAMPLE_FILE = ".event-samples.json";
const SAMPLE_EVENTS = ["goalUpdate", "linkMicBattle", "linkMicArmies", "linkMicBattleTask", "linkMicBattleItemCard", "pollMessage", "rankUpdate", "hourlyRank", "giftBroadcast", "giftPrompt", "giftPanelUpdate", "roomPin"];
const samples: Record<string, any[]> = (() => {
  try {
    return JSON.parse(readFileSync(SAMPLE_FILE, "utf8"));
  } catch {
    return {};
  }
})();
const slim = (v: any, depth = 0): any => {
  if (v == null || depth > 7) return v == null ? v : "…";
  if (typeof v === "bigint") return String(v);
  if (typeof v === "string") return v.length > 160 ? `${v.slice(0, 160)}…` : v;
  if (Array.isArray(v)) return v.slice(0, 5).map((x) => slim(x, depth + 1));
  if (typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !/deprecated|avatar|badge|border|medal|fansClub|followInfo|realTime|secUid|bio|createTime|modifyTime|signature|payGrade|shareQrcode|userAttr|stats|topFans|upcoming/i.test(k))
        .map(([k, x]) => [k, slim(x, depth + 1)]),
    );
  return v;
};
function captureSample(name: string, d: any) {
  const list = (samples[name] ??= []);
  if (list.length >= 2) return;
  list.push({ at: new Date().toISOString(), data: slim(d) });
  try {
    writeFileSync(SAMPLE_FILE, JSON.stringify(samples, null, 1).slice(0, 400_000));
    console.log(`[event-sample] "${name}" disimpan di ${SAMPLE_FILE} (${list.length}/2)`);
  } catch {
    /* abaikan */
  }
}

/* ---------- Target / challenge gift (goal) ---------- */
// TikTok mengirim kondisi target gift lewat event "giftPanelUpdate": goalData.goalProgress = { <idGift>: { currentProgress, target, expiredTimestampInMs } }.
// Target yang batas waktunya sudah lewat (masih ikut terkirim) dibuang. Nilai waktu dari TikTok bisa detik atau milidetik.
type Goal = { giftId: number; current: number; target: number; expiresAt: number | null; name?: string; icon?: string };
let currentGoals: Goal[] = [];
function extractGoals(d: any): Goal[] {
  const progress = d?.goalData?.goalProgress ?? {};
  const now = Date.now();
  const out: Goal[] = [];
  for (const [id, g] of Object.entries<any>(progress)) {
    const target = Number(g?.target) || 0;
    const current = Number(g?.currentProgress) || 0;
    let exp = Number(g?.expiredTimestampInMs) || 0;
    if (exp && exp < 1e11) exp *= 1000; // detik -> milidetik
    if (!target || (exp && exp <= now)) continue;
    const info = GIFT_CATALOG[Number(id)] ?? learned.get(Number(id));
    out.push({ giftId: Number(id), current, target, expiresAt: exp || null, name: info?.name, icon: info?.icon });
  }
  return out;
}
function setGoals(goals: Goal[]) {
  if (JSON.stringify(goals) === JSON.stringify(currentGoals)) return;
  currentGoals = goals;
  broadcast({ type: "goal", goals });
}

/* ---------- Info gift ---------- */
// Event gift sering tanpa nama/gambar/harga. Sumber, urut prioritas: detail di event -> katalog bawaan (utils/giftCatalog.ts)
// -> gift yang pernah eventnya lengkap (diingat di memori + .gift-cache.json).
const CACHE_FILE = ".gift-cache.json";
const learned = new Map<number, KnownGift>();
try {
  for (const [id, g] of Object.entries(JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Record<string, KnownGift>)) learned.set(Number(id), g);
} catch {
  /* belum ada cache */
}
function giftInfo(d: any): { name?: string; icon?: string; unitCoins: number; streak: boolean } {
  const id = Number(d.giftId);
  const gd = d.giftDetails ?? {};
  const g = d.gift ?? {}; // detail lengkap gift (nama, ikon, harga) ada di d.gift pada pesan TikTok terbaru
  const x = d.extendedGiftInfo ?? {};
  const fromEvent: KnownGift = {
    name: g.name || gd.giftName || d.giftName || x.name || undefined,
    icon: imgUrl(g.icon) ?? imgUrl(g.image) ?? imgUrl(gd.giftImage) ?? imgUrl(gd.image) ?? imgUrl(gd.icon) ?? imgUrl(x.image) ?? imgUrl(x.icon) ?? imgUrl(d.giftPictureUrl),
    coins: Number(g.diamondCount ?? gd.diamondCount ?? d.diamondCount ?? x.diamond_count ?? x.diamondCount) || undefined,
    streak: g.type === 1 || gd.giftType === 1 ? true : undefined,
  } as KnownGift;
  const known = GIFT_CATALOG[id] ?? learned.get(id);
  // Ingat gift yang eventnya membawa detail lengkap, agar event berikutnya tanpa detail tetap bernama dan bergambar.
  if (id && fromEvent.name && !GIFT_CATALOG[id] && JSON.stringify(learned.get(id)) !== JSON.stringify(fromEvent)) {
    learned.set(id, { ...learned.get(id), ...fromEvent });
    try {
      writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(learned), null, 1));
    } catch {
      /* abaikan */
    }
  }
  return {
    name: fromEvent.name ?? known?.name,
    icon: fromEvent.icon ?? known?.icon,
    unitCoins: fromEvent.coins ?? known?.coins ?? 0,
    streak: g.type === 1 || gd.giftType === 1 || !!known?.streak,
  };
}
/** Level penonton/gifter: dari payGrade.level; cadangan, dari nama file badge level (mis. "grade_badge_icon_lite_lv25_v1.png"). 0 = tidak diketahui. */
const userLevel = (u: any): number => {
  const pg = Number(u?.payGrade?.level) || 0;
  if (pg > 0) return pg;
  try {
    const m = /grade_badge[^"\s]*?_lv(\d{1,3})/i.exec(JSON.stringify([u?.badgeImageList, u?.badgeList]));
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
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
      broadcast({
        type: "comment",
        user: userName(d.user),
        text: d.comment ?? d.content ?? "",
        avatar: userAvatar(d.user),
        level: userLevel(d.user), // level penonton TikTok (0 = tidak diketahui)
      });
    });

    connection.on(WebcastEvent.GIFT, (d: any) => {
      const info = giftInfo(d);
      // Gift streak (type 1): hitung hanya saat streak selesai agar tidak dobel.
      if (info.streak && !d.repeatEnd) return;
      const name: string = info.name || `Gift #${d.giftId}`;
      const count: number = d.repeatCount || 1;
      const t = session.gifts.get(name) ?? { name, count: 0, totalCoin: 0 };
      t.count += count;
      t.totalCoin += info.unitCoins * count;
      session.gifts.set(name, t);
      if (isActive()) {
        broadcast({
          type: "gift",
          user: userName(d.user),
          gift: name,
          giftId: Number(d.giftId) || undefined,
          count,
          coins: info.unitCoins * count, // nilai koin total (jumlah x harga)
          icon: info.icon,
          avatar: userAvatar(d.user),
          level: userLevel(d.user), // level gifter TikTok (0 = tidak diketahui)
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
    for (const ev of SAMPLE_EVENTS) connection.on(ev as any, (d: any) => captureSample(ev, d));
    connection.on("giftPanelUpdate" as any, (d: any) => {
      if (isActive()) setGoals(extractGoals(d));
    });
    connection.on(WebcastEvent.STREAM_END, () => {
      if (isActive()) {
        setStatus("ended");
        setGoals([]);
      }
    });
    connection.on(ControlEvent.DISCONNECTED, () => {
      if (!isActive() || currentStatus === "ended") return;
      setStatus("disconnected");
      // Putus tanpa pesan "live berakhir"? Cek ke TikTok; kalau memang sudah tidak live, tandai berakhir.
      setTimeout(async () => {
        try {
          if (isActive() && currentStatus !== "ended" && !(await getRoom(username)).isLive) setStatus("ended");
        } catch {
          /* gagal cek: biarkan status "terputus" */
        }
      }, 3000);
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
    const origin = req.headers.origin;
    if (originAllowed(origin)) res.setHeader("Access-Control-Allow-Origin", origin as string);
    res.setHeader("Vary", "Origin");
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
        setGoals([]); // target dari streamer sebelumnya tidak boleh terbawa
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
        setGoals([]);
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
