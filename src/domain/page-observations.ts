import { parseHTML } from "linkedom";
import {
  PRIZE_DESCRIPTION_LIMIT,
  type ObservedImage,
} from "./observations";

export {
  PRIZE_DESCRIPTION_LIMIT,
  PRIZE_DESCRIPTION_NOT_CAPTURED,
  PRIZE_DESCRIPTION_REMAINDER,
} from "./observations";
export type { ObservedImage } from "./observations";

export interface PrizeDescriptionCapture {
  text: string | null;
  truncated: boolean;
  kind: "prize";
  limit: typeof PRIZE_DESCRIPTION_LIMIT;
}

const IMAGE_EXT = /\.(?:jpe?g|png|webp|gif|avif)(?:$|[?#])/i;
/** Path, query, class, or id. `prize-banner.jpg` does not match. `banner` is not a token. */
const PATH_TOKEN =
  /(?:^|[\/_.-])(?:logo|logos|icon|icons|sprite|favicon|pixel|tracking|tracker|spacer|badge|advert|ads|doubleclick|googlesyndication|analytics|beacon)(?=$|[\/_.?&#-])/i;
/** Hostname label only, so `ads.example.com` is an ad host and `example.com` is not. */
const HOST_LABEL = /^(?:ads|advert|doubleclick|googlesyndication|analytics|beacon|tracking|tracker|pixel|badge)$/i;
const ALT_TOKEN =
  /(?:^|[^\p{L}\p{N}])(?:logo|logos|icon|icons|sprite|favicon|pixel|tracking|tracker|spacer)(?=$|[^\p{L}\p{N}])/iu;

function decodeAttr(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveHttps(raw: string, base: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /^(?:javascript|data|blob|vbscript):/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function urlRejected(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.split(".").some((label) => HOST_LABEL.test(label))) return true;
    return PATH_TOKEN.test(`${parsed.pathname}${parsed.search}`);
  } catch {
    return PATH_TOKEN.test(url);
  }
}

/** Unicode patterns throw TypeError on an unpaired surrogate. A broken alt must not fail the page. */
function safeTest(pattern: RegExp, value: string): boolean {
  try {
    return pattern.test(value);
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

function rejected(url: string, hint: string, alt: string | null, caption: string | null): boolean {
  return urlRejected(url) || safeTest(PATH_TOKEN, hint) || safeTest(ALT_TOKEN, `${alt ?? ""} ${caption ?? ""}`);
}

function tooSmall(width: string | null, height: string | null): boolean {
  const w = width ? Number(width) : NaN;
  const h = height ? Number(height) : NaN;
  if (Number.isFinite(w) && w > 0 && w < 48) return true;
  if (Number.isFinite(h) && h > 0 && h < 48) return true;
  return false;
}

function bestSrc(img: Element, pageUrl: string): string | null {
  let bestUrl: string | null = null;
  let bestWidth = -1;
  for (const part of (img.getAttribute("srcset") ?? "").split(",")) {
    const bits = part.trim().split(/\s+/);
    const url = bits[0] ? resolveHttps(bits[0], pageUrl) : null;
    if (!url) continue;
    const desc = bits[1] ?? "";
    const width = desc.endsWith("w") ? Number(desc.slice(0, -1)) : desc.endsWith("x") ? Number(desc.slice(0, -1)) * 1000 : 0;
    if (width >= bestWidth) {
      bestWidth = width;
      bestUrl = url;
    }
  }
  return bestUrl ?? resolveHttps(img.getAttribute("src") ?? "", pageUrl);
}

function headingKind(text: string): "prize" | "skip" | "other" {
  const value = text.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
  if (/\bproduct specifications\b/.test(value) || /^(includes|features)\b/.test(value)) return "other";
  if (
    /\b(official rules|rules|eligibility|how to enter|how to claim|how prize ends|entry instructions|entry period|entry form|available entry|deadline|end date|closing|privacy|sign up|signup|newsletter|how the prize is awarded|award date|contest information|sponsor information|contact|winner|selection|drawing|award|sponsor|entry)\b/.test(
      value,
    )
  ) {
    return "skip";
  }
  if (/\b(prize|prizes|product|about this prize|description|what you'll win|what you win|you could win)\b/.test(value)) {
    return "prize";
  }
  return "other";
}

function blockText(node: Element): string {
  return (node.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function headingRank(tag: string): number {
  const rank = Number(tag.replace(/^H/i, ""));
  return Number.isFinite(rank) ? rank : 7;
}

/** Text that belongs to this heading until the next heading of the same or higher rank. Skip-labeled subheadings and their bodies are omitted. */
function sectionParts(heading: Element): string[] {
  const startRank = headingRank(heading.tagName);
  const parts: string[] = [];
  let skipRank = 0;

  function walk(node: Element): "stop" | "continue" {
    if (/^H[1-6]$/i.test(node.tagName)) {
      const rank = headingRank(node.tagName);
      if (node !== heading && rank <= startRank) return "stop";
      const kind = headingKind(node.textContent ?? "");
      if (kind === "skip") {
        skipRank = rank;
        return "continue";
      }
      if (skipRank && rank <= skipRank) skipRank = 0;
      if (skipRank) return "continue";
      if (node !== heading) {
        const label = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        if (label) parts.push(label);
      }
      return "continue";
    }
    const nested = [...node.children].some((child) => /^H[1-6]$/i.test(child.tagName) || child.querySelector("h1,h2,h3,h4,h5,h6"));
    if (nested) {
      for (const child of [...node.children]) {
        if (walk(child) === "stop") return "stop";
      }
      return "continue";
    }
    if (skipRank) return "continue";
    const text = blockText(node);
    if (text) parts.push(text);
    return "continue";
  }

  let node = heading.nextElementSibling;
  while (node) {
    if (/^H[1-6]$/i.test(node.tagName) && headingRank(node.tagName) <= startRank) break;
    if (walk(node) === "stop") break;
    node = node.nextElementSibling;
  }
  return parts;
}

export function extractPrizeDescription(html: string): PrizeDescriptionCapture {
  const { document } = parseHTML(html);
  const parts: string[] = [];
  for (const heading of [...document.querySelectorAll("h1, h2, h3, h4")]) {
    if (headingKind(heading.textContent ?? "") !== "prize") continue;
    if (heading.parentElement?.closest("h1, h2, h3, h4")) continue;
    const parentHeading = heading.parentElement?.closest("h1, h2, h3, h4");
    if (parentHeading && headingKind(parentHeading.textContent ?? "") === "prize") continue;
    parts.push(...sectionParts(heading));
  }
  const joined = parts.join("\n\n").trim();
  if (!joined) {
    return { text: null, truncated: false, kind: "prize", limit: PRIZE_DESCRIPTION_LIMIT };
  }
  const truncated = joined.length > PRIZE_DESCRIPTION_LIMIT;
  return {
    text: truncated ? joined.slice(0, PRIZE_DESCRIPTION_LIMIT) : joined,
    truncated,
    kind: "prize",
    limit: PRIZE_DESCRIPTION_LIMIT,
  };
}

function ownPrizeHeading(node: Element): boolean {
  return [...node.children].some((child) => /^H[1-4]$/i.test(child.tagName) && headingKind(child.textContent ?? "") === "prize");
}

/** Explicit prize/product gallery, or a carousel only when that wrapper itself sits in the prize section. A page-level `main.carousel` is not one. */
function explicitGalleryAncestor(node: Element, inPrize: (el: Element) => boolean): Element | null {
  let current: Element | null = node;
  while (current) {
    const cls = `${current.getAttribute("class") ?? ""} ${current.getAttribute("id") ?? ""}`.toLowerCase();
    const data = (current.getAttribute("data-gallery") ?? "").toLowerCase();
    if (/\b(prize-gallery|product-images|product-gallery)\b/.test(cls) || data === "prize" || data === "product") return current;
    const generic = /\b(carousel|swiper)\b/.test(cls) || (current.hasAttribute("data-gallery") && data !== "prize" && data !== "product");
    const named = /\b(prize|giveaway|prize-gallery|product-gallery)\b/.test(cls);
    const landmark = current.tagName === "MAIN" || current.tagName === "ARTICLE";
    if (generic && (named || (!landmark && (inPrize(current) || ownPrizeHeading(current))))) return current;
    current = current.parentElement;
  }
  return null;
}

export function extractObservedGallery(html: string, pageUrl: string): { images: ObservedImage[]; kind: "gallery" | "summary" | null } {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const images: ObservedImage[] = [];
  let explicit = false;

  function push(url: string | null, alt: string | null, caption: string | null, hint: string, fromGallery: boolean) {
    if (!url || seen.has(url) || rejected(url, hint, alt, caption)) return;
    seen.add(url);
    if (fromGallery) explicit = true;
    images.push({
      url,
      alt: alt ? decodeAttr(alt) : null,
      caption: caption ? decodeAttr(caption) : null,
      evidenceUrl: pageUrl,
    });
  }

  for (const meta of [...document.querySelectorAll("meta")]) {
    const key = (meta.getAttribute("property") || meta.getAttribute("name") || "").toLowerCase();
    if (key !== "og:image") continue;
    push(resolveHttps(meta.getAttribute("content") ?? "", pageUrl), null, null, meta.getAttribute("content") ?? "", false);
  }

  const prizeHeadings = [...document.querySelectorAll("h1, h2, h3, h4")].filter((heading) => headingKind(heading.textContent ?? "") === "prize");

  function insidePrizeSection(node: Element): boolean {
    for (const heading of prizeHeadings) {
      const startRank = headingRank(heading.tagName);
      let cursor: Element | null = heading.nextElementSibling;
      while (cursor) {
        if (/^H[1-6]$/i.test(cursor.tagName) && headingRank(cursor.tagName) <= startRank) break;
        if (cursor === node || cursor.contains(node)) return true;
        cursor = cursor.nextElementSibling;
      }
    }
    return false;
  }

  for (const node of [...document.querySelectorAll("img, a[href]")]) {
    if (node.closest("nav, footer, header")) continue;
    if (node.tagName === "IMG") {
      const explicitGallery = Boolean(explicitGalleryAncestor(node, insidePrizeSection));
      const prizeFigure = Boolean(node.closest("figure") && insidePrizeSection(node));
      const prizeImage = insidePrizeSection(node) && /\b(prize|product|vehicle|camera)\b/i.test(node.getAttribute("alt") ?? "");
      if (!explicitGallery && !prizeFigure && !prizeImage) continue;
      if (!explicitGallery && tooSmall(node.getAttribute("width"), node.getAttribute("height"))) continue;
      const figure = node.closest("figure");
      const caption = figure?.querySelector("figcaption")?.textContent ?? null;
      const hint = `${node.getAttribute("class") ?? ""} ${node.getAttribute("id") ?? ""} ${node.getAttribute("src") ?? ""}`;
      push(bestSrc(node, pageUrl), node.getAttribute("alt"), caption, hint, explicitGallery);
      continue;
    }
    if (!explicitGalleryAncestor(node, insidePrizeSection) || node.querySelector("img")) continue;
    const href = node.getAttribute("href") ?? "";
    if (!IMAGE_EXT.test(href)) continue;
    const hint = `${node.getAttribute("class") ?? ""} ${href}`;
    push(resolveHttps(href, pageUrl), node.getAttribute("aria-label") || node.textContent, null, hint, true);
  }

  return { images: images.slice(0, 24), kind: images.length === 0 ? null : explicit ? "gallery" : "summary" };
}
