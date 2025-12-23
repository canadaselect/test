/* /poster/poster.js
 * 海报生成器：1080×1440 + 右下角二维码
 * - 优先解析产品页中的：<script type="application/json" id="product-poster-data">{...}</script>
 * - 降级解析：og:title / og:image / h1 / meta description
 */

const CANVAS_W = 1080;
const CANVAS_H = 1440;

// 你可以把这里换成你的品牌色/标题前缀等
const BRAND = {
  headerTag: "CANADIAN NATURALS",
  slogan: "扫码查看详情",
  cornerRadius: 28,
  padding: 64,
  qrSize: 210,
  qrMargin: 56
};

// 若后续你加 Cloudflare Worker 代理，这里可以改成 true，走 /api/fetch?url=...
const USE_WORKER_PROXY = false;
const WORKER_FETCH_ENDPOINT = "/api/fetch?url="; // 你未来可以做成 Worker

// ---------- DOM ----------
const elUrl = document.getElementById("urlInput");
const elStatus = document.getElementById("status");
const elCanvas = document.getElementById("posterCanvas");
const elMeta = document.getElementById("metaInfo");

const elBtnGenerate = document.getElementById("btnGenerate");
const elBtnDownload = document.getElementById("btnDownload");
const elBtnClear = document.getElementById("btnClear");

const elTitleOverride = document.getElementById("titleOverride");
const elHighlightsOverride = document.getElementById("highlightsOverride");
const elUsageOverride = document.getElementById("usageOverride");

const ctx = elCanvas.getContext("2d", { alpha: false });

let lastBlobUrl = null;

// ---------- Utils ----------
function setStatus(msg) {
  elStatus.textContent = msg || "";
}

function safeUrl(u) {
  try { return new URL(u).toString(); } catch { return ""; }
}

function normalizeLines(text) {
  return (text || "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function truncate(str, max = 120) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// wrap text helper
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines, font, color) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";

  const words = text.split("");
  let line = "";
  let lines = [];
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    const w = ctx.measureText(testLine).width;
    if (w > maxWidth && line) {
      lines.push(line);
      line = words[i];
      if (maxLines && lines.length >= maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (!maxLines || lines.length < maxLines) lines.push(line);

  // clamp lines
  if (maxLines && lines.length > maxLines) lines = lines.slice(0, maxLines);

  // ellipsis if overflow
  if (maxLines && lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 0) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last + "…";
  }

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  ctx.restore();

  return { lines, height: lines.length * lineHeight };
}

// rounded rect
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// image cover
function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

async function loadFontReady() {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
}

// ---------- Fetch & Parse ----------
async function fetchHtml(url) {
  const target = USE_WORKER_PROXY
    ? `${WORKER_FETCH_ENDPOINT}${encodeURIComponent(url)}`
    : url;

  const res = await fetch(target, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    redirect: "follow",
    headers: { "Accept": "text/html,*/*;q=0.8" }
  });

  if (!res.ok) {
    throw new Error(`抓取失败：HTTP ${res.status}`);
  }
  return await res.text();
}

function parseProductData(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // 1) Try JSON script id=product-poster-data
  const jsonEl = doc.querySelector('#product-poster-data');
  if (jsonEl && jsonEl.textContent) {
    try {
      const data = JSON.parse(jsonEl.textContent.trim());
      return normalizeProductData(data, pageUrl);
    } catch {
      // continue fallback
    }
  }

  // 2) Fallback: og:title / og:image
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim();
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim();
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim();

  // 3) Fallback: h1
  const h1 = doc.querySelector("h1")?.textContent?.trim();

  // 4) Try find first large image in main content
  let img = ogImage;
  if (!img) {
    const firstImg = doc.querySelector("main img, article img, .content img, img");
    img = firstImg?.getAttribute("src") || "";
  }

  // attempt absolute URL for image
  img = absolutizeUrl(img, pageUrl);

  const name = ogTitle || h1 || "未命名产品";

  // highlights/usage fallback: use meta description split
  const highlights = metaDesc ? smartSplit(metaDesc, 4) : [];
  const usage = []; // unknown from fallback

  return normalizeProductData({ name, image: img, highlights, usage }, pageUrl);
}

function smartSplit(text, maxItems = 4) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  // Split by punctuation
  const parts = cleaned
    .split(/[。.!?；;，,]/g)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.slice(0, maxItems);
}

function absolutizeUrl(maybeUrl, base) {
  if (!maybeUrl) return "";
  try {
    // already absolute
    if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
    // protocol-relative
    if (/^\/\//.test(maybeUrl)) return new URL("https:" + maybeUrl).toString();
    // relative
    return new URL(maybeUrl, base).toString();
  } catch {
    return maybeUrl;
  }
}

function normalizeProductData(data, pageUrl) {
  const name = (data.name || data.title || "").trim() || "未命名产品";
  let image = (data.image || data.imageUrl || "").trim();
  image = absolutizeUrl(image, pageUrl);

  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const usage = Array.isArray(data.usage) ? data.usage : [];

  return {
    name,
    image,
    highlights: highlights.map(s => String(s).trim()).filter(Boolean),
    usage: usage.map(s => String(s).trim()).filter(Boolean),
    url: pageUrl
  };
}

// ---------- QR ----------
async function makeQrCanvas(text, size) {
  // Prefer qrcodejs (global QRCode). It renders into DOM; we convert to canvas.
  if (typeof QRCode === "undefined") {
    throw new Error("二维码库未加载：QRCode 未定义。请检查 qrcode.min.js 引用。");
  }

  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-99999px";
  holder.style.top = "-99999px";
  document.body.appendChild(holder);

  // qrcodejs renders <img> or <canvas> depending on browser
  const qr = new QRCode(holder, {
    text,
    width: size,
    height: size,
    correctLevel: QRCode.CorrectLevel.M
  });

  // wait a tick for render
  await new Promise(r => setTimeout(r, 50));

  let canvas = holder.querySelector("canvas");
  if (!canvas) {
    // sometimes it renders img; draw img onto canvas
    const img = holder.querySelector("img");
    if (!img) {
      document.body.removeChild(holder);
      throw new Error("二维码渲染失败：未找到 canvas/img");
    }
    await new Promise((resolve, reject) => {
      if (img.complete) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("二维码图片加载失败"));
    });
    canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext("2d");
    c.drawImage(img, 0, 0, size, size);
  }

  // clone the canvas to detach from DOM
  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  out.getContext("2d").drawImage(canvas, 0, 0);

  document.body.removeChild(holder);
  return out;
}

// ---------- Main Render ----------
async function renderPoster(data) {
  await loadFontReady();

  // Background
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Card container
  const pad = BRAND.padding;
  const cardX = pad;
  const cardY = pad;
  const cardW = CANVAS_W - pad * 2;
  const cardH = CANVAS_H - pad * 2;

  // Shadow
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cardX, cardY, cardW, cardH, BRAND.cornerRadius);
  ctx.fill();
  ctx.restore();

  // Inner layout
  const innerPad = 44;
  const x = cardX + innerPad;
  let y = cardY + innerPad;
  const w = cardW - innerPad * 2;

  // Header tag
  ctx.save();
  ctx.font = `700 22px "Noto Sans SC"`;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillText(BRAND.headerTag, x, y);
  ctx.restore();
  y += 40;

  // Main image area
  const imgH = 620;
  const imgY = y;
  const imgX = x;
  const imgW = w;
  y += imgH + 36;

  // Load image
  let img = null;
  if (data.image) {
    img = await loadImage(data.image);
    // Clip rounded
    ctx.save();
    roundRect(ctx, imgX, imgY, imgW, imgH, 22);
    ctx.clip();
    drawImageCover(ctx, img, imgX, imgY, imgW, imgH);
    ctx.restore();

    // subtle overlay
    ctx.save()
