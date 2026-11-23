const SKIP_HOST = /(?:^|\.)(?:facebook|instagram|pinterest|youtube|tiktok|twitter|x|linkedin|reddit)\.com$/i;
const SKIP_PATH = /\/(?:about|privacy|terms|contact|login|signin|sign-up|signup|account|newsletter|search|category|categories|tag|tags|cart|checkout|subscribe|page\/\d+)(?:\/|$)/i;

/** Contest links from a directory or brand hub. The hub URL itself is not included. */
export function extractContestLinks(html: string, pageUrl: string, limit: number): string[] {
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return [];
  }
  const pageHost = page.hostname.replace(/^www\./, "").toLowerCase();
  const pagePath = page.pathname.replace(/\/+$/, "") || "/";
  const urls: string[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || /^(?:javascript|mailto|tel):/i.test(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password) continue;
    url.hash = "";
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (host === pageHost && path === pagePath) continue;
    if (SKIP_HOST.test(host) || SKIP_PATH.test(path)) continue;
    if (/\.(?:jpe?g|png|gif|webp|svg|css|js|pdf|zip)$/i.test(path)) continue;
    const value = url.toString();
    if (!urls.includes(value)) urls.push(value);
    if (urls.length >= limit) break;
  }
  return urls;
}
