import { isDirectoryListing } from "@/config/directories";
import { watchedSourceFor } from "@/config/watched-sources";
import { daysUntil, parseDueDate, statedEndIso } from "./dates";
import type { Contest } from "./types";

/** Shown when Verified cannot name a sponsor that matches this host or a known vendor. */
export const SPONSOR_NOT_CONFIRMED = "Sponsor not confirmed";

/** Shown when the rules page and the entry page state different facts. */
export const RULES_DISAGREE_NOTE = "Rules and entry page disagree (possible reused rules)";

/** A prize at or above this amount, on a domain that is not the sponsor, stays in Needs checking. */
export const LARGE_PRIZE_USD = 5_000;

/** Re-fetch the sponsor page when the last check is older than this many days. */
export const RECHECK_AFTER_DAYS = 7;

/** Re-fetch when the stated end date is this many days away or sooner, and still open. */
export const ENDING_SOON_DAYS = 3;

/**
 * Hosts whose campaign pages are an entry, not the sponsor's own site.
 * A named sponsor on one of these still counts.
 */
export const PROMOTION_VENDOR_HOSTS = [
  "gleam.io",
  "viralsweep.com",
  "kingsumo.com",
  "sweepwidget.com",
  "rafflepress.com",
  "woobox.com",
  "shortstack.com",
  "easypromos.com",
  "easypromosapp.com",
  "rafflecopter.com",
  "wishpond.com",
] as const;

/**
 * Directory sites. Their pages are not contest sources: a search hit on one of
 * these is dropped, and an Enter link that lands on one is not Verified.
 */
export const EXCLUDED_DIRECTORY_HOSTS = [
  "sweepstakesradar.com",
  "sweepsheet.com",
  "sweepfeed.com",
  "sweeptakers.com",
  "contestgirl.com",
  "sweepsadvantage.com",
  "online-sweepstakes.com",
  "ultracontest.com",
  "sweepstakesfanatics.com",
] as const;

const SHORTENER_HOSTS = [
  "bit.ly",
  "bitly.com",
  "tinyurl.com",
  "tiny.cc",
  "t.co",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
  "rb.gy",
  "lnkd.in",
  "smarturl.it",
  "s.id",
];

const AFFILIATE_HOSTS = [
  "shareasale.com",
  "anrdoezrs.net",
  "dpbolvw.net",
  "jdoqocy.com",
  "tkqlhce.com",
  "pjtra.com",
  "pntra.com",
  "pntrs.com",
  "avantlink.com",
  "awin1.com",
  "impactradius.com",
  "sjv.io",
  "prf.hn",
  "skimresources.com",
  "redirectingat.com",
];

const AFFILIATE_PARAMS = ["affiliate", "aff", "aff_id", "hop", "irclickid", "clickid"];

const TRACKING_PARAM = /^(?:utm_[a-z0-9_]+|fbclid|gclid|gbraid|wbraid|mc_cid|mc_eid|msclkid|yclid|twclid|igshid|_hsenc|_hsmi|mkt_tok)$/i;

const TOKEN_STOP = new Set([
  "sponsor",
  "sponsored",
  "inc",
  "llc",
  "ltd",
  "corp",
  "corporation",
  "company",
  "limited",
  "the",
  "and",
  "dba",
  "co",
]);

const NOUN_STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "win",
  "enter",
  "prize",
  "grand",
  "approx",
  "approximate",
  "retail",
  "value",
  "arv",
  "of",
  "or",
  "and",
  "your",
  "com",
]);

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function isKnownPromotionHost(url: string): boolean {
  const host = hostOf(url);
  return PROMOTION_VENDOR_HOSTS.some((domain) => hostMatches(host, domain));
}

export function isExcludedDirectorySource(url: string): boolean {
  const host = hostOf(url);
  return EXCLUDED_DIRECTORY_HOSTS.some((domain) => hostMatches(host, domain));
}

function decodeLight(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;|&#8220;/g, "“")
    .replace(/&rdquo;|&#8221;/g, "”")
    .replace(/&#0?39;|&apos;/g, "'");
}

function cleanSponsor(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[“”"]/g, "")
    .replace(/\s+(?:and any of|and its|in partnership with|are not eligible|is not eligible).*$/i, "")
    .replace(/[,;:\s]+$/g, "")
    .trim();
}

/** Sponsor names copied from the page text. An empty list means the page did not name one. */
export function namedSponsors(text: string): string[] {
  const source = decodeLight(text);
  const found: string[] = [];
  const patterns = [
    /\b(?:sponsored by|the sponsor is|providing your information to)\s+([^.\n]{2,90})/gi,
    /\bsponsor:\s*([^.\n]{2,90})/gi,
    /\bthe sponsor of the\b[^.]{0,140}?\bis\s+([^.]{2,100})/gi,
    /([A-Z0-9][A-Za-z0-9&.,'’ -]{1,70}?)\s*\([“"]?\s*sponsor\s*[”"]?\)/gi,
    /\b([A-Z0-9][A-Za-z0-9&.,'’ -]{1,60}?)\s+(?:d\s*\/\s*b\s*\/\s*a|d\.b\.a\.|doing business as)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = cleanSponsor(match[1] ?? "");
      if (name.length < 2) continue;
      if (/^(?:the\s+)?sponsor$/i.test(name)) continue;
      const lead = source.slice(Math.max(0, (match.index ?? 0) - 12), match.index ?? 0);
      if (/\bnot\s*$/i.test(lead) || /do not sponsor|does not sponsor|not sponsor, endorse/i.test(match[0])) continue;
      if (!found.some((item) => item.toLowerCase() === name.toLowerCase())) found.push(name);
    }
  }
  return found;
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !TOKEN_STOP.has(token));
}

function tokensOverlap(sponsor: string, hay: string): boolean {
  const compact = hay.toLowerCase().replace(/[^a-z0-9]/g, "");
  return tokens(sponsor).some((token) => compact.includes(token));
}

/** True when a sponsor token appears in the entry host, or the host label appears in the sponsor name. */
export function sponsorMatchesHost(sponsor: string, url: string): boolean {
  const host = hostOf(url);
  if (!host || !sponsor.trim()) return false;
  const labels = host
    .split(".")
    .slice(0, -1)
    .flatMap((part) => part.split("-"))
    .filter((part) => part.length >= 4);
  if (tokensOverlap(sponsor, labels.join(""))) return true;
  const compact = sponsor.toLowerCase().replace(/[^a-z0-9]/g, "");
  return labels.some((label) => compact.includes(label) || label.includes(compact));
}

/** The owner-curated source list already names this sponsor for the host. Not an outside registry. */
export function sponsorMatchesWatchedSource(sponsor: string, url: string): boolean {
  const source = watchedSourceFor(url);
  if (!source) return false;
  return tokensOverlap(sponsor, source.name);
}

function registrableDomain(url: string): string {
  const host = hostOf(url);
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return host;
  return parts.slice(-2).join(".");
}

/** A street or post-office address. An email address and a ZIP field are not one. */
export function sponsorAddressPresent(text: string): boolean {
  const source = decodeLight(text);
  if (/\b(?:p\.?\s*o\.?\s*box)\s+\d+/i.test(source)) return true;
  if (/\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|parkway|pkwy|highway|hwy|terrace|ter)\b/i.test(source)) return true;
  return /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(source);
}

function windowMentionsHost(window: string, host: string): boolean {
  const domain = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(domain, "i").test(window)) return true;
  const label = host.split(".").slice(0, -1).join("");
  if (label.length < 4) return false;
  return window.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(label);
}

/**
 * The rules themselves connect the named sponsor to this entry host.
 * A parent company, a d/b/a, or “enter at this website” is a tie. A prize
 * that merely mentions another brand is not.
 */
export function rulesTieSponsorToHost(text: string, url: string): boolean {
  const source = decodeLight(text);
  const host = hostOf(url);
  if (!host || namedSponsors(source).length === 0) return false;
  const relation = /\b(?:d\s*\/\s*b\s*\/\s*a|d\.b\.a\.|doing business as|a division of|division of|subsidiary of|parent company of|affiliate of|operated by|operator of|owner of)\b/gi;
  for (const match of source.matchAll(relation)) {
    const at = match.index ?? 0;
    const window = source.slice(Math.max(0, at - 80), Math.min(source.length, at + match[0].length + 80));
    if (windowMentionsHost(window, host)) return true;
  }
  const domain = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`\b(?:visit|enter(?:\s+at)?|website|websites)\b[\s\S]{0,500}?(?:https?:\/\/)?(?:www\.)?${domain}\b`, "i").test(source);
}

/** Rules published on the entry site that name a sponsor and a postal address. */
export function sameSiteSponsorWithAddress(text: string, entryUrl: string, rulesUrl?: string | null): boolean {
  const rulesOnEntrySite = !rulesUrl || registrableDomain(rulesUrl) === registrableDomain(entryUrl);
  if (!rulesOnEntrySite) return false;
  if (namedSponsors(text).length === 0) return false;
  return sponsorAddressPresent(text);
}

function largestStatedUsd(text: string, stated: number | null): number | null {
  let max = stated ?? 0;
  for (const match of text.matchAll(/\$\s*(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d{2})?/g)) {
    const amount = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > max) max = amount;
  }
  if (max <= 0) return stated;
  return max;
}

export function sponsorIdentityNote(input: { text: string; url: string; rulesUrl?: string | null; prizeUsd?: number | null }): string | null {
  const sponsors = namedSponsors(input.text);
  const vendor = isKnownPromotionHost(input.url);
  const namedMatch = sponsors.some((name) => sponsorMatchesHost(name, input.url) || sponsorMatchesWatchedSource(name, input.url));
  const tied = rulesTieSponsorToHost(input.text, input.url) || sameSiteSponsorWithAddress(input.text, input.url, input.rulesUrl);
  const matched = namedMatch || tied;
  const confirmed = matched || (vendor && sponsors.length > 0);
  const amount = largestStatedUsd(input.text, input.prizeUsd ?? null);
  const largeOnUnrecognized = (amount ?? 0) >= LARGE_PRIZE_USD && !matched && !vendor;
  if (!confirmed || largeOnUnrecognized) return SPONSOR_NOT_CONFIRMED;
  return null;
}

function explicitEndIso(text: string): string | null {
  const match = /(?:\bends\b|\bended\b|\bending\b|\bdeadline\b|\bcloses\b|\bthrough\b|\buntil\b)\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},\s+(?:19|20)\d{2}|\d{1,2}\s+[A-Za-z]+\s+(?:19|20)\d{2}|(?:19|20)\d{2}-\d{2}-\d{2})/i.exec(text);
  if (!match?.[1]) return null;
  return statedEndIso(match[1]);
}

function titleYear(title: string): string | null {
  const match = /\b((?:19|20)\d{2})\b/.exec(title);
  return match?.[1] ?? null;
}

function prizeNouns(text: string): Set<string> {
  const match = /enter to win\s+(?:a |an |the |your )?([^.]{3,80})/i.exec(text);
  if (!match?.[1]) return new Set();
  return new Set(
    match[1]
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !NOUN_STOP.has(token) && !/^\d+$/.test(token)),
  );
}

function nounsDisagree(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) return false;
  const subset = (a: Set<string>, b: Set<string>) => [...a].every((token) => b.has(token));
  return !subset(left, right) && !subset(right, left);
}

function prizeAmounts(text: string): Set<number> {
  const found = new Set<number>();
  for (const match of text.matchAll(/\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/g)) {
    const amount = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(amount) && amount >= 1) found.add(amount);
  }
  return found;
}

/**
 * True only when both pages state the same kind of fact and those facts differ.
 * A month and day with no year is not compared, and no year is filled in.
 */
export function rulesAndEntryDisagree(entryText: string, entryTitle: string, rulesText: string, rulesTitle: string): boolean {
  const entry = entryText.trim();
  const rules = rulesText.trim();
  if (!entry || !rules) return false;
  const entryEnd = explicitEndIso(entry);
  const rulesEnd = explicitEndIso(rules);
  if (entryEnd && rulesEnd && entryEnd !== rulesEnd) return true;
  const entryYear = titleYear(entryTitle);
  const rulesYear = titleYear(rulesTitle);
  if (entryYear && rulesYear && entryYear !== rulesYear) return true;
  const entryAmounts = prizeAmounts(entry);
  const rulesAmounts = prizeAmounts(rules);
  if (entryAmounts.size > 0 && rulesAmounts.size > 0 && ![...entryAmounts].some((amount) => rulesAmounts.has(amount))) return true;
  if (nounsDisagree(prizeNouns(entry), prizeNouns(rules))) return true;
  return false;
}

export function rulesDisagreeForContests(entry: Contest, rules: Contest): boolean {
  const entryText = `${entry.title} ${entry.shortDescription} ${entry.pageObservedDetailedDescription ?? ""}`;
  const rulesText = `${rules.title} ${rules.shortDescription} ${rules.pageObservedDetailedDescription ?? ""}`;
  return rulesAndEntryDisagree(entryText, entry.title, rulesText, rules.title);
}

function resolveUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sameDestination(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const host = (url: URL) => url.hostname.replace(/^www\./, "");
    return host(a) === host(b) && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
}

function destinationIssue(target: string): string | null {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (SHORTENER_HOSTS.some((domain) => hostMatches(host, domain))) return "Enter goes through a URL shortener";
  if (AFFILIATE_HOSTS.some((domain) => hostMatches(host, domain))) return "Enter goes through an affiliate redirect";
  if (AFFILIATE_PARAMS.some((key) => url.searchParams.has(key))) return "Enter goes through an affiliate redirect";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "Enter leads to the brand homepage";
  if (/\.pdf$/i.test(path)) return "Enter leads to a PDF";
  if (/\/winners?(?:\/|$)/i.test(path)) return "Enter leads to a winners page";
  if (isExcludedDirectorySource(target) || isDirectoryListing(target)) return "Enter leads to a sweepstakes directory";
  return null;
}

function postWinContext(value: string): boolean {
  return /\b(?:if you win|potential winners?|winner(?:'s|s)?|to claim|upon claiming|w-?9|1099|tax (?:reporting|purposes|form|identification))\b/i.test(value);
}

function secretAsk(blob: string): string | null {
  if (postWinContext(blob)) return null;
  if (/\b(?:ssn|social security(?: number)?)\b/i.test(blob)) return "Enter asks for an SSN before a win";
  if (/\b(?:credit card|debit card|card number|cvv|cvc|cc-number|cardnumber)\b/i.test(blob)) return "Enter asks for a card number before a win";
  if (/\b(?:bank account|routing number|checking account|savings account)\b/i.test(blob)) return "Enter asks for a bank account before a win";
  return null;
}

/** The specific reason Enter cannot be Verified, or null when the form stays on this page. */
export function enterDestinationNote(html: string, pageUrl: string): string | null {
  const formChunks: string[] = [];
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)) formChunks.push(match[0]);
  const secret = secretAsk(formChunks.join(" "));
  if (secret) return secret;

  const targets: string[] = [];
  for (const match of html.matchAll(/<form\b[^>]*\baction=["']([^"']+)["'][^>]*>/gi)) {
    const resolved = resolveUrl(match[1], pageUrl);
    if (resolved) targets.push(resolved);
  }
  if (targets.length === 0) {
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!/^enter(?:\s+now|\s+to\s+win)?$/i.test(text)) continue;
      const resolved = resolveUrl(match[1], pageUrl);
      if (resolved) targets.push(resolved);
    }
  }
  for (const target of targets) {
    if (sameDestination(target, pageUrl)) continue;
    const issue = destinationIssue(target);
    if (issue) return issue;
  }
  return null;
}

/** Drops campaign and click ids. The path and any other query are kept. */
export function stripTrackingParams(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function lastCheckedLabel(isoDate: string): string {
  return `Last checked ${isoDate}`;
}

export function entryFormGoneNote(isoDate: string): string {
  return `Entry form not found on last check (${isoDate})`;
}

function calendarDays(isoDate: string, now: Date): number | null {
  return daysUntil(parseDueDate(isoDate), now);
}

/** A stored sponsor page should be fetched again. A directory URL is not. */
export function needsSponsorRefetch(input: { url: string; lastChecked: string | null; endIso: string | null }, now: Date): boolean {
  if (isExcludedDirectorySource(input.url) || isDirectoryListing(input.url)) return false;
  const today = now.toISOString().slice(0, 10);
  if (input.lastChecked === today) return false;
  if (input.endIso) {
    const left = calendarDays(input.endIso, now);
    if (left !== null && left >= 0 && left <= ENDING_SOON_DAYS) return true;
  }
  if (!input.lastChecked) return false;
  const age = calendarDays(input.lastChecked, now);
  return age !== null && age <= -RECHECK_AFTER_DAYS - 1;
}

export function entrySectionPresent(contest: Contest): boolean {
  return (
    contest.formChecked ||
    contest.contestMarkers?.ownEntry === true ||
    contest.rulesFacts?.mailOffered === true ||
    contest.pageObservedWidget === true
  );
}
