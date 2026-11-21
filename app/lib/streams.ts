import type { Quality } from "@/app/components/LivePlayer";

const URL_RE = /https?:\/\/[^"'\s\\<>]+?\.(?:m3u8|flv)(?:\?[^"'\s\\<>]*)?/gi;

/** Bersihkan escape yang lazim di JSON halaman TikTok (/, \/, &, &amp;). */
const clean = (s: string) =>
  s
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

export function extractUrls(text: string): string[] {
  return [...new Set(clean(text).match(URL_RE) ?? [])];
}

export type Meta = { key?: string; res?: string; br?: number; hevc?: boolean };
const pathOf = (u: string) => u.split("?")[0];

/** Sisi pendek dari "720x1280" / "1280x720" -> 720. */
const shortSide = (res?: string) => {
  const m = /(\d+)\s*[x×*]\s*(\d+)/i.exec(res ?? "");
  return m ? Math.min(+m[1], +m[2]) : 0;
};

/**
 * Tingkat kualitas TikTok (kunci dari data TikTok) -> nama seperti di menu TikTok. Nama ini nominal: streamer yang siaran 432p
 * tetap punya tingkat "720p", "540p", "360p" (bedanya di bitrate), jadi jangan digabung hanya karena resolusinya sama.
 */
const TIER: Record<string, { rank: number; label: string }> = {
  origin: { rank: 1081, label: "Original" },
  uhd: { rank: 1080, label: "1080p" },
  hd: { rank: 720, label: "720p" },
  sd: { rank: 540, label: "540p" },
  ld: { rank: 360, label: "360p" },
};

/** Cadangan bila tak ada metadata: tebak dari pola nama file (mis. _ld5cr, _sd5cr, _hd, _uhd, tanpa akhiran = asli). */
function guess(url: string): { rank: number; label: string } | null {
  const file = pathOf(url).split("/").pop() ?? "";
  const m = /_(ld|sd|hd|uhd)\d*[a-z]*\.(?:m3u8|flv)$/i.exec(file);
  if (m) {
    const k = m[1].toLowerCase();
    return TIER[k];
  }
  if (/_or\d/i.test(file) || /^stream-\d+\.(?:m3u8|flv)$/i.test(file)) return TIER.origin;
  return null;
}

const isHls = (u: string) => /\.m3u8/i.test(u);

/**
 * Ubah daftar URL jadi pilihan kualitas urut rendah -> tinggi.
 * Label utama = resolusi asli dari data TikTok (mis. "720p"); cadangan = tebakan dari nama file.
 */
export function buildQualities(urls: string[], meta: Record<string, Meta> = {}): Quality[] {
  type Item = { rank: number; label: string; height?: number; all: string[] };
  const byLabel = new Map<string, Item>();
  let unknown = 0;

  for (const url of urls) {
    const md = meta[pathOf(url)];
    const h = shortSide(md?.res);
    const g = guess(url);
    const tier = md?.key ? TIER[md.key.toLowerCase()] : undefined; // utamakan nama tingkat TikTok
    const base = tier
      ? { rank: tier.rank, label: tier.label, height: h || undefined }
      : h
        ? { rank: h, label: `${h}p`, height: h }
        : g
          ? { rank: g.rank, label: g.label }
          : { rank: 1500 + ++unknown, label: `Kualitas ${unknown}` };
    const prev = byLabel.get(base.label);
    if (prev) prev.all.push(url);
    else byLabel.set(base.label, { ...base, all: [url] });
  }

  return [...byLabel.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((it) => {
      // Urutan percobaan: HLS dulu, lalu FLV, lalu lainnya (varian cadangan bila codec/URL bermasalah).
      const hv = (u: string) => (meta[pathOf(u)]?.hevc ? 1 : 0);
      const ordered = [...it.all].sort((a, b) => hv(a) - hv(b) || Number(isHls(b)) - Number(isHls(a)));
      return { id: it.label, label: it.label, url: ordered[0], alts: ordered.slice(1), height: it.height };
    });
}

/** Validasi + normalisasi payload dari bookmarklet (dipakai untuk hash dan postMessage). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePayload(data: any): { urls: string[]; username?: string; meta: Record<string, Meta>; version: number } | null {
  if (!data || typeof data !== "object") return null;
  const urls: string[] = Array.isArray(data.u) ? data.u.filter((x: unknown): x is string => typeof x === "string" && /^https?:\/\//i.test(x)) : [];
  const username = /@([\w.]+)/.exec(String(data.n ?? ""))?.[1];
  const meta: Record<string, Meta> = {};
  if (Array.isArray(data.m)) {
    for (const row of data.m) {
      if (Array.isArray(row) && typeof row[0] === "string") meta[pathOf(row[0])] = { key: row[1], res: row[2], br: Number(row[3]) || 0, hevc: row[4] === 1 };
    }
  }
  return urls.length ? { urls, username, meta, version: Number(data.v) || 1 } : null;
}

/** Baca payload bookmarklet dari alamat: #s=<base64 JSON>. */
export function decodeHash(hash: string): { urls: string[]; username?: string; meta: Record<string, Meta>; version: number } | null {
  const m = /[#&]s=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const b64 = decodeURIComponent(m[1]);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return parsePayload(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

/**
 * Kumpulkan URL stream + metadata resolusi dari objek JSON apa pun (mis. respons API room TikTok).
 * URL: dicari di seluruh string (tahan terhadap JSON bersarang & escape). Metadata: blok { main: { hls, flv, sdk_params } }.
 */
export function collectStreams(root: unknown): { urls: string[]; meta: Record<string, Meta> } {
  const urls = new Set<string>();
  const meta: Record<string, Meta> = {};

  const walk = (v: unknown, key: string, depth: number, hevc = false) => {
    if (v == null || depth > 16) return;
    if (typeof v === "string") {
      for (const u of extractUrls(v)) urls.add(u);
      if (v.charAt(0) === "{" && v.includes("sdk_params")) {
        try {
          walk(JSON.parse(v), key, depth + 1, hevc);
        } catch {
          /* bukan JSON */
        }
      }
      return;
    }
    if (typeof v !== "object") return;
    const o = v as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (o.main && typeof o.main === "object" && (o.main.hls || o.main.flv)) {
      let p: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      try {
        p = JSON.parse(o.main.sdk_params || "{}");
      } catch {
        /* abaikan */
      }
      for (const f of ["hls", "flv"]) {
        if (o.main[f]) {
          const u = clean(String(o.main[f]));
          urls.add(u);
          meta[pathOf(u)] = { key, res: p.resolution, br: Number(p.vbitrate) || 0, hevc };
        }
      }
      return;
    }
    for (const k of Object.keys(o)) walk(o[k], k, depth + 1, hevc || /hevc/i.test(k));
  };

  walk(root, "", 0);
  return { urls: [...urls], meta };
}

/**
 * Kode bookmarklet, ditulis sebagai teks mentah (bukan fungsi + toString) agar tidak diubah kompiler.
 * Dijalankan di halaman live TikTok (di browser Anda sendiri): mengumpulkan URL .m3u8/.flv dari
 * request jaringan + isi halaman, lalu membuka aplikasi ini dengan hasilnya di hash (#s=...).
 */
const BOOKMARKLET = String.raw`(async function (origin) {
  const found = {};
  const apiFound = {};
  let cur = found;
  const re = /https?:\/\/[^"'\s\\<>]+?\.(?:m3u8|flv)(?:\?[^"'\s\\<>]*)?/gi;
  const clean = (s) => String(s).replace(/\\u002F/gi, "/").replace(/\\u0026/gi, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  const sid = (u) => (/stream-(\d+)/.exec(u) || [])[1];
  const add = (s) => {
    if (!s) return;
    const m = clean(s).match(re);
    if (m) m.forEach((u) => { cur[u] = true; });
  };
  const metas = [];
  const scan = (v, key, d, hv) => {
    if (v == null || d > 16) return;
    if (typeof v === "string") {
      if (v.charAt(0) === "{" && v.indexOf("sdk_params") > -1) { try { scan(JSON.parse(v), key, d + 1, hv); } catch (e) {} }
      return;
    }
    if (typeof v !== "object") return;
    if (v.main && typeof v.main === "object" && (v.main.hls || v.main.flv)) {
      let p = {};
      try { p = JSON.parse(v.main.sdk_params || "{}"); } catch (e) {}
      ["hls", "flv"].forEach((f) => {
        if (v.main[f]) {
          const u = clean(v.main[f]);
          cur[u] = true;
          metas.push([u, key || "", p.resolution || "", p.vbitrate || 0, hv ? 1 : 0]);
        }
      });
      return;
    }
    for (const k in v) scan(v[k], k, d + 1, hv || /hevc/i.test(k));
  };
  // Riwayat jaringan tab ini bisa memuat stream streamer LAIN yang ditonton sebelumnya: catat waktunya.
  const perfIds = [];
  try {
    performance.getEntriesByType("resource").forEach((e) => {
      add(e.name);
      if (/\.(m3u8|flv)/i.test(e.name) && sid(e.name)) perfIds.push([sid(e.name), e.startTime]);
    });
  } catch (e) {}
  try {
    document.querySelectorAll("script").forEach((s) => {
      const t = (s.textContent || "").trim();
      add(t);
      if (t.charAt(0) === "{" && t.indexOf("sdk_params") > -1) { try { scan(JSON.parse(t), "", 0, false); } catch (e) {} }
    });
    add(document.documentElement.innerHTML);
  } catch (e) {}
  // Minta data room dari DALAM halaman TikTok (cookie login ikut): sumber paling tepercaya untuk live yang sedang dibuka.
  const user = (/\/@([\w.]+)/.exec(location.pathname) || [])[1];
  if (user) {
    cur = apiFound;
    try {
      const r = await fetch("/api-live/user/room/?aid=1988&app_language=en-US&app_name=tiktok_web&device_platform=web_pc&sourceType=54&uniqueId=" + encodeURIComponent(user), { credentials: "include" });
      const j = await r.json();
      const room = (j && j.data && j.data.liveRoom) || {};
      add(JSON.stringify(room));
      scan(room, "", 0, false);
    } catch (e) {}
    cur = found;
  }
  // Pilih HANYA stream milik live yang sedang dibuka: id dari API; kalau API kosong, id dari request jaringan terbaru.
  const apiIds = {};
  Object.keys(apiFound).forEach((u) => { const i = sid(u); if (i) apiIds[i] = true; apiFound[u] && (found[u] = true); });
  let keep = Object.keys(apiIds);
  if (!keep.length && perfIds.length) {
    perfIds.sort((a, b) => b[1] - a[1]);
    keep = [perfIds[0][0]];
  }
  const ok = (u) => { const i = sid(u); return !keep.length || !i || keep.indexOf(i) > -1; };
  const urls = Object.keys(found).filter(ok);
  const ms = metas.filter((x) => ok(x[0]));
  if (!urls.length) {
    alert("Tidak ada URL video ditemukan.\n\nPastikan live sedang DIPUTAR di tab ini (bukan hanya terbuka), tunggu beberapa detik, lalu klik lagi.");
    return;
  }
  const payload = { v: 3, u: urls, n: location.pathname, m: ms };
  // 1) Tab ini dibuka oleh aplikasi: kirim langsung ke tab aplikasi (tanpa membuka tab baru).
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "tt-streams", payload }, origin);
      try { window.opener.focus(); } catch (e) {}
      const t = document.createElement("div");
      t.textContent = "✓ Video terkirim ke aplikasi";
      t.style.cssText = "position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:10px 16px;border-radius:10px;font:600 14px system-ui;box-shadow:0 4px 20px rgba(0,0,0,.4)";
      document.body.appendChild(t);
      // Tutup tab TikTok otomatis (bisa karena tab ini dibuka oleh aplikasi).
      setTimeout(() => { t.remove(); try { window.close(); } catch (e) {} }, 700);
      return;
    }
  } catch (e) {}
  // 2) Cadangan: buka aplikasi di tab baru dengan data di alamatnya.
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const link = origin + "/#s=" + encodeURIComponent(b64);
  const w = window.open(link, "_blank");
  if (!w) prompt("Popup diblokir browser. Salin alamat ini lalu buka di tab baru:", link);
  else setTimeout(() => { try { window.close(); } catch (e) {} }, 500); // hanya berhasil bila tab ini dibuka lewat skrip; selain itu diabaikan browser
})`;

export const bookmarkletHref = (origin: string) =>
  "javascript:" + encodeURIComponent(BOOKMARKLET + "(" + JSON.stringify(origin) + ")");
