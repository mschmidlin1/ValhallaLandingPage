// Fetches the live Trendline app URL from the TrendLine repo README.
// README format: "Current link: https://..."

const TRENDLINE_README_URL =
  "https://raw.githubusercontent.com/mschmidlin1/TrendLine/main/README.md";

const FETCH_TIMEOUT_MS = 8000;
const CACHE_KEY = "valhalla-trendline-url";
const CACHE_TTL_MS = 5 * 60 * 1000;

const CURRENT_LINK_RE = /^\s*Current\s+link:\s*(https?:\/\/\S+)/im;

export function parseTrendlineUrlFromReadme(text) {
  const match = text.match(CURRENT_LINK_RE);
  if (!match) return null;

  const raw = match[1].replace(/[)\]>.,;]+$/, "");
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { url, ts } = JSON.parse(raw);
    if (!url || Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function writeCache(url) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ url, ts: Date.now() }));
  } catch {
    // sessionStorage may be unavailable
  }
}

export async function fetchTrendlineUrl() {
  const cached = readCache();
  if (cached) return cached;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(TRENDLINE_README_URL, { signal: controller.signal });
    if (!res.ok) return null;

    const text = await res.text();
    const url = parseTrendlineUrlFromReadme(text);
    if (url) writeCache(url);
    return url;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
