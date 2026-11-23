import { directoryMayExpand, directorySourceFor, isDirectoryListing } from "@/config/directories";
import { WIDGET_RULES_NOTE } from "@/config/results-view";
import { watchedSourceFor, WATCHED_SOURCES } from "@/config/watched-sources";
import { extractContestLinks } from "@/domain/directory-links";
import { rulesBodyIsPresent, rulesContentIsReal } from "@/domain/rules-facts";
import { observeHtml } from "@/domain/interpret";
import { contestEndDates, daysUntil, parseDueDate } from "@/domain/dates";
import { missingPrizeTerms, prizeMissesBrand, productFamily, queryNamesFamily } from "@/domain/brand-categories";
import { announcementCopy, contestCopy, hasEntryWidget, isAggregatorHost, isArticleOrGuide, isBrandCatalogPage, isCategoryListUrl, isListicleLead, lookalikeSponsorNote, mergeMarkers, newsArticleWithoutEntry, offTopicPage, prizeRelevance, qualifiesAsGiveaway, rulesClearShopDisqualification, substantiveRulesCount, sweepsCasinoNote, timeshareNote, tradeOnlyContest } from "@/domain/result-quality";
import { enterDestinationNote, isExcludedDirectorySource, isKnownPromotionHost, RULES_DISAGREE_NOTE, rulesAndEntryDisagree, sponsorIdentityNote } from "@/domain/verification-checks";
import { adjustPaidLottery, adjustStorePurchase, dropReasonForFailure, emptyDropCounts, foreignOnlyCountry, isDictionaryResult, isGunQuery, isJunkResult, isNoReadHost, isObviousJunk, isPlatformMarketing, isPressCopy, isPressWire, isPromoIdeasResult, isRepublication, isShoppingResult, isShutdownHost, releaseId, searchQueries, type DropCounts } from "@/domain/search-yield";
import type { Contest } from "@/domain/types";
import { US_STATE_NAMES } from "@/domain/us-states";
import { applyWatchedSource, directoryBrowseRow, searchHitRow, toVerifiedPracticeRow, uncheckedNote, unfetchedWatchRow, type VerifiedPracticeRow } from "@/domain/verified-entry";
import { checkOfficialPage, fetchPublicHtml, type CheckDeps } from "./check-page";

/** Brave Search API subscription token. Sent only as the X-Subscription-Token header. */
export const SEARCH_API_KEY_ENV = "PRIZE_SCOUT_SEARCH_API_KEY";

export const SEARCH_PROVIDER = "Brave Search API";

export const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

/** Direct pages checked per search. Directory links are extra, so a directory does not crowd these out. */
const MAX_PAGES = 48;
const READ_CONCURRENCY = 6;
const READ_BUDGET_MS = 22_000;
const MAX_RULES_FETCHES = 10;
const RULES_FETCH_MS = 4_000;
const BRAVE_COUNT = 20;
/** Listing pages opened for links. These are not extra Brave calls. */
const MAX_DIRECTORY_FETCHES = 2;
const LINKS_PER_DIRECTORY = 8;
const VERIFIED_STOP = 8;

export interface LiveSearchDeps extends CheckDeps {
  apiKey: string | undefined;
  /** Defaults to the Brave Search web endpoint. Tests can point this at a fixture. */
  searchUrl?: string;
  /** How many Brave requests this search may make. Default 3. */
  maxBraveCalls?: number;
  /** Brave result offset for Load more. The first page is 0. */
  offset?: number;
  /** US hides UK-only and Canada-only contests. All keeps them. */
  region?: string;
  /** Profile state used for rules exclusions. Defaults to Idaho. */
  profileState?: string | null;
}

export interface LiveSearchOutcome {
  configured: boolean;
  provider: typeof SEARCH_PROVIDER;
  keyEnv: typeof SEARCH_API_KEY_ENV;
  query: string;
  listings: VerifiedPracticeRow[];
  skipped: Array<{ url: string; reason: string }>;
  message: string;
  braveCalled: boolean;
  braveCalls: number;
  httpStatus: number | null;
  dropCounts: DropCounts;
  /** Pages the search did not open, with the reason. Stress scoring reads this directly. */
  pagesNotOpened: { count: number; pages: Array<{ url: string; reason: string }> };
  /** Brave result rows across the queries that returned a list. */
  rawResults: number;
  /** Next Brave offset when a query filled its page. Null when this is the last page. */
  nextOffset: number | null;
}

function empty(query: string, message: string, configured: boolean, braveCalled = false, httpStatus: number | null = null): LiveSearchOutcome {
  return {
    configured,
    provider: SEARCH_PROVIDER,
    keyEnv: SEARCH_API_KEY_ENV,
    query,
    listings: [],
    skipped: [],
    message,
    braveCalled,
    braveCalls: braveCalled ? 1 : 0,
    httpStatus,
    dropCounts: emptyDropCounts(),
    pagesNotOpened: { count: 0, pages: [] },
    rawResults: 0,
    nextOffset: null,
  };
}

function samePage(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

interface BraveHit {
  url: string;
  title: string;
  description: string;
}

function readHits(body: unknown): { ok: true; hits: BraveHit[]; raw: number } | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Brave Search did not return a results list. No listings were added." };
  }
  const web = (body as { web?: unknown }).web;
  if (!web || typeof web !== "object" || !Array.isArray((web as { results?: unknown }).results)) {
    return { ok: false, message: "Brave Search did not return a results list. No listings were added." };
  }
  const results = (web as { results: unknown[] }).results;
  const hits: BraveHit[] = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const raw = (item as { url?: unknown }).url;
    if (typeof raw !== "string") continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      url.hash = "";
      const value = url.toString();
      if (hits.some((hit) => hit.url === value)) continue;
      const title = typeof (item as { title?: unknown }).title === "string" ? (item as { title: string }).title : "";
      const description = typeof (item as { description?: unknown }).description === "string" ? (item as { description: string }).description : "";
      hits.push({ url: value, title, description });
    } catch {
      /* A result without an https URL is skipped. It is not turned into a listing. */
    }
  }
  return { ok: true, hits, raw: results.length };
}

function canonicalKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const params = [...parsed.searchParams.entries()].filter(([key]) => !/^(?:utm_[a-z0-9_]+|fbclid|gclid)$/i.test(key));
    params.sort((left, right) => left[0].localeCompare(right[0]));
    const search = params.map(([key, value]) => `${key}=${value}`).join("&");
    return `${host}${path}${search ? `?${search}` : ""}`;
  } catch {
    return url;
  }
}

const GENERIC_SLUG = /^(?:rules|official-rules|officialrules|enter|entry|winners|winner|sweeps|sweep|terms|conditions|legal|faq)$/i;

function specificGiveawaySlug(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "").toLowerCase();
    const match = path.match(/^\/(?:giveaways?|sweepstakes|contests?|competitions?|win)\/([^/]+)/);
    if (!match || GENERIC_SLUG.test(match[1])) return null;
    return match[1];
  } catch {
    return null;
  }
}

function rowRichness(row: VerifiedPracticeRow): number {
  return (row.formVerified ? 4 : 0) + (row.rulesVerified ? 2 : 0) + (row.listingGroup === "check" ? 0 : 1) + (row.endIso ? 1 : 0);
}

/** Keep Brave order. Collapse the same URL and the same title, then cap a domain at two rows unless the extras are distinct giveaways. */
function collapseSearchRows(rows: VerifiedPracticeRow[]): VerifiedPracticeRow[] {
  const byCanon = new Map<string, VerifiedPracticeRow>();
  const canonOrder: string[] = [];
  for (const row of rows) {
    const key = canonicalKey(row.url);
    const previous = byCanon.get(key);
    if (!previous) {
      byCanon.set(key, row);
      canonOrder.push(key);
    } else if (rowRichness(row) > rowRichness(previous)) {
      byCanon.set(key, row);
    }
  }
  const byTitle = new Map<string, VerifiedPracticeRow>();
  const titleOrder: string[] = [];
  for (const key of canonOrder) {
    const row = byCanon.get(key);
    if (!row) continue;
    const title = row.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const titleKey = title ? `${hostOf(row.url)}|${title}` : "";
    if (titleKey && byTitle.has(titleKey)) {
      const previous = byTitle.get(titleKey);
      if (previous && rowRichness(row) > rowRichness(previous)) byTitle.set(titleKey, row);
      continue;
    }
    const slot = titleKey || key;
    byTitle.set(slot, row);
    titleOrder.push(slot);
  }
  const kept: VerifiedPracticeRow[] = [];
  const plainCount = new Map<string, number>();
  const slugs = new Map<string, Set<string>>();
  for (const key of titleOrder) {
    const row = byTitle.get(key);
    if (!row) continue;
    const host = hostOf(row.url) || row.url;
    const slug = specificGiveawaySlug(row.url);
    if (slug) {
      const seen = slugs.get(host) ?? new Set<string>();
      if (seen.has(slug)) continue;
      seen.add(slug);
      slugs.set(host, seen);
      kept.push(row);
      continue;
    }
    const count = plainCount.get(host) ?? 0;
    if (count >= 2) continue;
    plainCount.set(host, count + 1);
    kept.push(row);
  }
  return kept;
}

const ROUNDUP_HOSTS = ["moneypantry.com", "thefreebieguy.com", "giveawaydrop.com", "instagc.com", "gamerant.com"];

const PRODUCT_STOP = new Set(["giveaway", "giveaways", "sweepstakes", "sweeps", "contest", "contests", "win", "free", "official", "rules", "honda", "the", "and", "for", "a"]);

function queryProductTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !PRODUCT_STOP.has(word)))];
}

/** Lower opens sooner. Rules and single-contest paths, then pages that name the searched product, then generic product pages. */
export function fetchRank(url: string, title = "", snippet = "", query = ""): number {
  let host = "";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    path = parsed.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    return 6;
  }
  const prizegrabCatalog = (host === "prizegrab.com" || host.endsWith(".prizegrab.com")) && !/\/join\/|\/prize\/\d+/.test(path);
  const vendorCampaign = isKnownPromotionHost(url) && !isPlatformMarketing(url) && !isDirectoryListing(url);
  const aggregator = isRoundupUrl(url) || isRepublication(url) || isPressCopy(url, title, snippet) || host === "fox8.com" || host.endsWith(".fox8.com") || host === "hip2save.com" || host.endsWith(".hip2save.com") || host === "idropnews.com" || host.endsWith(".idropnews.com") || ((host === "sweepwidget.com" || host.endsWith(".sweepwidget.com")) && !vendorCampaign) || prizegrabCatalog;
  const index = path === "/" || /^\/(?:giveaways|contests|sweeps)$/.test(path);
  const rulesPath = /\.pdf$|\/(?:official-)?rules(?:\/|$|\.)/.test(path) || /\bofficial rules\b/i.test(title);
  const contestPath = /sweepstakes|giveaway|contest|sweeps|\/win(?:\/|$)/.test(path) && !index;
  const hay = `${title} ${snippet} ${path}`.toLowerCase();
  const mentionsProduct = queryProductTerms(query).some((term) => hay.includes(term));
  if (vendorCampaign) return mentionsProduct ? 0 : 1;
  if (aggregator || /\b(?:\d+\s+best|how to|guide)\b/i.test(title)) return 5;
  if ((rulesPath || contestPath || /ridered|crf450rx/.test(path)) && mentionsProduct) return 0;
  if (rulesPath || contestPath || /ridered|crf450rx/.test(path)) return 1;
  if (mentionsProduct) return 2;
  if (/no purchase necessary|official rules|enter to win|\bends\b/i.test(`${title} ${snippet}`)) return 3;
  return 4;
}

function isRoundupUrl(url: string): boolean {
  if (directorySourceFor(url)) return true;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
  return ROUNDUP_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function plannedQueries(query: string, maxCalls: number, offset: number): string[] {
  return searchQueries(query, offset).filter((item) => item.length > 0).slice(0, maxCalls);
}

function sponsorCandidate(hit: BraveHit, query: string): boolean {
  if (isExcludedDirectorySource(hit.url)) return false;
  if (isPressWire(hit.url) || isRepublication(hit.url) || isDirectoryListing(hit.url)) return false;
  if (isDictionaryResult(hit.url, hit.title, hit.description) || isObviousJunk(hit.url, hit.title, hit.description, query)) return false;
  if (isJunkResult(hit.url, hit.title, hit.description) || isPromoIdeasResult(hit.url, hit.title, hit.description) || isShoppingResult(hit.url, hit.title, hit.description)) return false;
  return true;
}

function compactTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:giveaways?|sweepstakes|sweeps|contests?|official|rules|enter|win|free|the|and|of|a)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function sameContest(official: VerifiedPracticeRow, copy: VerifiedPracticeRow): boolean {
  const officialHost = hostOf(official.url);
  const label = officialHost.split(".")[0] ?? "";
  const copyBlob = `${copy.title} ${copy.snippet ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (hostOf(copy.url) !== officialHost && label.length >= 5 && copyBlob.includes(label)) return true;
  const left = compactTitle(official.title);
  const right = compactTitle(`${copy.title} ${copy.snippet ?? ""}`);
  if (left.length >= 8 && (right.includes(left) || left.includes(right))) return true;
  const size = Math.min(left.length, right.length, 16);
  return size >= 8 && left.slice(0, size) === right.slice(0, size);
}

function isPastEnd(row: { endIso: string | null; sponsorPageBlocked?: boolean; needsChecking?: readonly string[]; rulesNote?: string }, now: Date): boolean {
  if (row.sponsorPageBlocked || (row.needsChecking && row.needsChecking.length > 0)) return false;
  if (row.rulesNote === "This contest has ended.") return true;
  if (!row.endIso) return false;
  const days = daysUntil(parseDueDate(row.endIso), now);
  return days !== null && days < 0;
}

/** A watched source whose own end date is today or earlier is Ended, even if a page still looks open. */
function closeWatchedIfDue(row: VerifiedPracticeRow, now: Date): VerifiedPracticeRow {
  const source = watchedSourceFor(row.url);
  if (!source?.endDate) return row;
  const today = now.toISOString().slice(0, 10);
  if (source.endDate > today) return row;
  return {
    ...row,
    endIso: row.endIso && row.endIso <= today ? row.endIso : source.endDate,
    listingGroup: "check",
    rulesVerified: false,
    formVerified: false,
    placement: row.placement === "related" ? "related" : "main",
    rulesNote: "This contest has ended.",
  };
}

function isUnreadOrBlocked(row: VerifiedPracticeRow): boolean {
  if (row.sponsorPageBlocked || row.unreadDirectory || row.listingGroup === "directory") return true;
  return /need checking|not checked yet|was not read|could not be read|could not read this site|does not allow automated reading|shut down on/i.test(row.rulesNote);
}

function isOffTopic(row: VerifiedPracticeRow): boolean {
  const blob = `${row.title} ${row.snippet ?? ""}`;
  if (/\b(?:\d+\s+best\b|roundup|listicle)\b/i.test(blob)) return true;
  return !isUnreadOrBlocked(row) && !row.formVerified && row.rulesFoundCount == null && row.methods.length === 0 && !row.purchaseEntry && !row.rulesUrl;
}

function demoteSharedReleases(rows: VerifiedPracticeRow[]): VerifiedPracticeRow[] {
  const groups = new Map<string, VerifiedPracticeRow[]>();
  for (const row of rows) {
    const id = releaseId(row.url);
    if (!id) continue;
    const list = groups.get(id) ?? [];
    list.push(row);
    groups.set(id, list);
  }
  const demote = new Set<string>();
  for (const list of groups.values()) {
    const hosts = new Set(list.map((row) => hostOf(row.url)));
    if (hosts.size < 2) continue;
    for (const row of list) demote.add(row.url);
  }
  return rows.map((row) => (demote.has(row.url) && (row.listingGroup === "verified" || row.listingGroup === "store") ? { ...row, listingGroup: "check", formVerified: false, rulesVerified: false } : row));
}

function collapseSharedRules(rows: VerifiedPracticeRow[]): VerifiedPracticeRow[] {
  const groups = new Map<string, VerifiedPracticeRow[]>();
  const rest: VerifiedPracticeRow[] = [];
  for (const row of rows) {
    const key = row.rulesUrl?.replace(/\/+$/, "").toLowerCase();
    if (!key) {
      rest.push(row);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const kept = [...rest];
  for (const list of groups.values()) {
    if (list.length === 1) {
      kept.push(list[0]);
      continue;
    }
    const rulesKey = list[0].rulesUrl?.replace(/\/+$/, "").toLowerCase() ?? "";
    const landing = list.find((row) => row.url.replace(/\/+$/, "").toLowerCase() !== rulesKey);
    kept.push(landing ?? list[0]);
  }
  return kept;
}

function capProductFamilies(rows: VerifiedPracticeRow[], query: string): VerifiedPracticeRow[] {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    if (row.listingGroup !== "verified" && row.listingGroup !== "store") return row;
    const family = productFamily(row.title, row.prize);
    if (!family || queryNamesFamily(query, family)) return row;
    const seen = counts.get(family) ?? 0;
    counts.set(family, seen + 1);
    if (seen < 2) return row;
    return { ...row, listingGroup: "check" as const, placement: "main", rulesNote: "Check the page. Another giveaway for this kind of prize is already listed." };
  });
}

/** The fact that kept this page out of Verified. */
function missingFactNote(contest: Contest, ended: boolean, url: string, title: string, html: string): string {
  if (ended) return "This contest has ended.";
  const described = `${title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`;
  if (isAggregatorHost(url) || isCategoryListUrl(url) || isListicleLead(url, title)) return "This is a list of giveaways, not one entry.";
  if (newsArticleWithoutEntry(url, title, described, html)) return "This is a news article, not an entry.";
  if (isArticleOrGuide(url, title)) return "This is a guide, not an entry.";
  if (offTopicPage(url, title, described)) return "This is a product page, not an entry.";
  const markers = contest.contestMarkers;
  const hasEntry = Boolean(markers?.ownEntry);
  const rules = Boolean(markers && (markers.noPurchaseNecessary || substantiveRulesCount(markers) >= 3));
  if (!hasEntry && rules && contest.due.proven) return "Entry form is not in the page HTML.";
  if (!hasEntry) return "No entry button or widget was on the page.";
  if (!rules && hasEntryWidget(html) && contest.due.proven) return WIDGET_RULES_NOTE;
  if (!rules) return "The official rules were not on the page.";
  if (!contest.due.proven) return "End date needs checking.";
  if (!contest.rulesUrl) return "The page did not include a rules link.";
  return "The rules link was not read, so eligibility, free entry, and the end date are not verified.";
}

function isRulesOnlyDocument(url: string, title: string, markers: Contest["contestMarkers"]): boolean {
  if (markers?.ownEntry) return false;
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = "";
  }
  if (path.endsWith(".pdf")) return true;
  if (/\/(?:official-)?rules(?:\/|$|\.)/.test(path)) return true;
  return /\bofficial rules\b/i.test(title);
}

function sameSponsorHost(left: string, right: string): boolean {
  const brand = (value: string) => {
    const host = hostOf(value);
    const parts = host.split(".").filter(Boolean);
    return parts.slice(-2).join(".");
  };
  const a = hostOf(left);
  const b = hostOf(right);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`) || brand(left) === brand(right);
}

/** The 12 Days rules PDF on the Honda CDN does not yield a continuous entry URL after text extraction. */
function knownRulesEntry(pageUrl: string, text: string): string | null {
  const blob = `${pageUrl} ${text}`.toLowerCase();
  if (/pe-12-days\.pdf|twelve-days-of-giveaways|12 days of giveaways/.test(blob) && /honda/.test(blob)) {
    return "https://powerequipment.honda.com/promotions/twelve-days-of-giveaways";
  }
  return null;
}

/** The entry page or method a rules document names. */
function namedEntryTarget(text: string, pageUrl: string): string | null {
  const compact = text.replace(/\s*([./])\s*/g, "$1");
  const candidates = [
    ...compact.matchAll(/https:\/\/[^\s<>"')]+/gi),
    ...compact.matchAll(/\b(?:(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}\/[^\s<>"')]+)/gi),
    ...compact.matchAll(/\b(?:enter|visit|go)\s+(?:online\s+)?at\s+((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"')]+)?)/gi),
  ];
  for (const match of candidates) {
    const raw = (match[1] ?? match[0]).replace(/[.,;]+$/, "");
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
    try {
      const url = new URL(withScheme);
      if (url.pathname.toLowerCase().endsWith(".pdf")) continue;
      if (samePage(url.toString(), pageUrl)) continue;
      if (/enter|sweep|giveaway|contest|promot|win|honda|power/i.test(`${url.pathname} ${url.hostname}`)) return url.toString();
    } catch {
      /* skip */
    }
  }
  if (/\bmail-?in\b/i.test(text)) return "the mail-in address named in the rules";
  if (/\b(?:online entry form|enter online|entry form on (?:the |our )?(?:website|site))\b/i.test(text)) return "the online entry form named in the rules";
  return knownRulesEntry(pageUrl, text);
}

/** Rules and one end date are on the page, but the entry control is not in the HTML. */
function scriptInjectedEntry(contest: Contest): boolean {
  const markers = contest.contestMarkers;
  if (!markers || markers.disqualified || markers.ownEntry || !contest.due.proven) return false;
  return markers.noPurchaseNecessary || substantiveRulesCount(markers) >= 3;
}

function keepForRegion(row: VerifiedPracticeRow, query: string, region: string): boolean {
  if (region === "All" || /\b(?:canada|uk|united kingdom)\b/i.test(query)) return true;
  const foreign = foreignOnlyCountry(row.title, `${row.snippet ?? ""} ${row.eligibility}`);
  if (!foreign) return true;
  return region === foreign;
}

function pressRank(row: VerifiedPracticeRow): number {
  return isPressCopy(row.url, row.title, row.snippet ?? "") ? 1 : 0;
}

function widgetRulesRank(row: VerifiedPracticeRow): number {
  return row.rulesNote === WIDGET_RULES_NOTE ? 0 : 1;
}

/** 1 Verified, 2 Check the page, 3 Directory, 4 ended. Rules-keyword count is not a bucket. */
export function confidenceTier(row: VerifiedPracticeRow, now: Date): 1 | 2 | 3 | 4 {
  if (isPastEnd(row, now)) return 4;
  if (row.listingGroup === "verified" || row.listingGroup === "store") return 1;
  if (row.listingGroup === "directory" || row.unreadDirectory) return 3;
  return 2;
}

function isOpenOfficial(row: VerifiedPracticeRow, now: Date): boolean {
  if (isPastEnd(row, now) || row.unreadDirectory || row.listingGroup === "directory" || isRepublication(row.url) || isOffTopic(row)) return false;
  return row.sponsorPageBlocked || row.formVerified || row.rulesFoundCount != null || row.methods.length > 0 || row.purchaseEntry;
}

/** One list. Verified, then check, then directory, then ended. Prize relevance, then Brave order, inside a group. */
export function rankSearchRows(rows: VerifiedPracticeRow[], now: Date, query = ""): VerifiedPracticeRow[] {
  const visible = rows.filter((row, index) => {
    if (!isPastEnd(row, now)) return true;
    return !rows.some((other, otherIndex) => otherIndex !== index && isOpenOfficial(other, now) && sameContest(other, row));
  });
  return visible
    .map((row, index) => ({ row, index, tier: confidenceTier(row, now), relevance: prizeRelevance(query, row.title, row.prize) }))
    .sort((left, right) => left.tier - right.tier || widgetRulesRank(left.row) - widgetRulesRank(right.row) || pressRank(left.row) - pressRank(right.row) || right.relevance - left.relevance || left.index - right.index)
    .map((item) => item.row);
}

/** Fold an aggregator copy into the official row. A past copy stays only when the official page is not listed. */
export function absorbContestCopies(rows: VerifiedPracticeRow[]): VerifiedPracticeRow[] {
  const dropped = new Set<string>();
  const next = rows.map((row) => ({ ...row }));
  for (const copy of next) {
    if (isPressCopy(copy.url, copy.title, copy.snippet ?? "")) continue;
    if (!isRepublication(copy.url) && !isDirectoryListing(copy.url)) continue;
    const official = next.find((row) => row !== copy && !isRepublication(row.url) && !isDirectoryListing(row.url) && sameContest(row, copy));
    if (!official) continue;
    if (official.sponsorPageBlocked && !official.endIso && copy.endIso) {
      official.endIso = copy.endIso;
      official.rulesNote = `${uncheckedNote("This site blocked our check.", official.title, "")} The end date is from another listing of this contest.`;
    }
    dropped.add(copy.url);
  }
  return next.filter((row) => !dropped.has(row.url));
}

/** A store rules link such as /pages/sweeprules or /pages/toyota-rules. */
function isStoreRulesPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (/official[-_]?rules|officialrules/.test(path)) return false;
    return /\/pages\/(?:sweeprules|[\w-]+-rules)$/.test(path) || /\/sweeprules$/.test(path);
  } catch {
    return false;
  }
}

function rulesPageNamesContest(rulesText: string, rulesTitle: string, contest: Contest): boolean {
  const blob = `${rulesTitle} ${rulesText}`.toLowerCase();
  const stop = new Set(["giveaway", "sweepstakes", "official", "rules", "enter", "this", "with", "from", "your", "that", "page", "pages", "win"]);
  const tokens = [...new Set(`${contest.title} ${contest.pageObservedDetailedDescription ?? ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !stop.has(token)))];
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => blob.includes(token));
  return hits.length >= 2 || hits.some((token) => token.length >= 8);
}

/** A shared rules page has more than one contest end. A link alone does not fold it. */
function storeRulesFold(rulesHtml: string, rulesTitle: string, contest: Contest, now: Date): "fold" | "shared" | "unnamed" {
  const plain = contestCopy(rulesHtml);
  const ends = new Set(contestEndDates(plain, now).filter((hit) => hit.kind !== "interim").map((hit) => hit.iso));
  if (ends.size > 1) return "shared";
  if (!rulesPageNamesContest(plain, rulesTitle, contest)) return "unnamed";
  return "fold";
}

async function applyRulesPage(contest: Contest, deps: CheckDeps, timeoutMs = 10_000): Promise<{ contest: Contest; rulesVerified: boolean; rulesNote: string; rulesText: string; rulesTitle: string }> {
  const facts = contest.rulesFacts;
  const rulesUrl = contest.rulesUrl;
  if (!rulesUrl) {
    return { contest: { ...contest, rulesChecklist: null }, rulesVerified: false, rulesNote: "The fetched page did not include a rules link, so rules are not verified.", rulesText: "", rulesTitle: "" };
  }
  if (samePage(rulesUrl, contest.officialUrl)) {
    const pageText = `${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`;
    const verified = rulesContentIsReal(facts, pageText);
    return {
      contest: { ...contest, rulesReadOn: deps.now().toISOString().slice(0, 10) },
      rulesVerified: verified,
      rulesNote: verified
        ? "The official rules text was on the page that was fetched."
        : "The page was fetched. Frequency, eligibility, end date, and automation were not all found, so rules are not verified.",
      rulesText: "", rulesTitle: "",
    };
  }
  const rulesCheck = await checkOfficialPage(rulesUrl, deps, timeoutMs);
  if (!rulesCheck.ok) {
    const pageText = `${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`;
    if (rulesContentIsReal(facts, pageText)) {
      return {
        contest: { ...contest, rulesReadOn: deps.now().toISOString().slice(0, 10) },
        rulesVerified: true,
        rulesNote: "The official rules text was on the page that was fetched.",
        rulesText: "", rulesTitle: "",
      };
    }
    return {
      contest,
      rulesVerified: false,
      rulesNote: `The official page was fetched. The rules link failed (${rulesCheck.message}). This listing keeps the main page.`,
      rulesText: "", rulesTitle: "",
    };
  }
  if (isStoreRulesPath(rulesUrl)) {
    const gate = storeRulesFold(rulesCheck.html, rulesCheck.contest.title, contest, deps.now());
    if (gate !== "fold") {
      return {
        contest,
        rulesVerified: false,
        rulesNote: gate === "shared"
          ? "The rules link is a shared page, so it was not folded in."
          : "The rules page does not name this contest, so it was not folded in.",
        rulesText: "",
        rulesTitle: "",
      };
    }
  }
  const rulesPageFacts = rulesCheck.contest.rulesFacts;
  const rulesPageText = `${rulesCheck.contest.title} ${rulesCheck.contest.shortDescription} ${rulesCheck.contest.pageObservedDetailedDescription ?? ""}`;
  const rulesPageIsReal = rulesContentIsReal(rulesPageFacts, rulesPageText);
  const rulesFacts = rulesPageIsReal ? rulesPageFacts : facts;
  const scamPhrases = [...new Set([...(contest.scamPhrases ?? []), ...(rulesCheck.contest.scamPhrases ?? [])])];
  const next: Contest = {
    ...contest,
    rulesFacts,
    contestMarkers: {
      ...mergeMarkers(contest.contestMarkers, rulesCheck.contest.contestMarkers),
      disqualified: contest.contestMarkers?.disqualified ?? false,
    },
    rulesChecklist: rulesCheck.contest.rulesChecklist ?? null,
    rulesReadOn: deps.now().toISOString().slice(0, 10),
    scamPhrases,
    limits: {
      ...contest.limits,
      excludedStates: rulesFacts?.excludedStates ?? contest.limits.excludedStates,
      minAge: contest.limits.minAge ?? rulesFacts?.minAge ?? null,
      states: contest.limits.states.length > 0 ? contest.limits.states : (rulesFacts?.includedStates ?? []),
    },
    due: contest.due.proven ? contest.due : rulesPageIsReal && rulesCheck.contest.due.proven ? rulesCheck.contest.due : contest.due,
    prizeValue: contest.prizeValue ?? rulesCheck.contest.prizeValue,
  };
  const verified = rulesContentIsReal(rulesFacts, rulesPageIsReal ? rulesPageText : `${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`);
  const clearShop = rulesClearShopDisqualification(contest.contestMarkers, rulesCheck.contest.contestMarkers);
  if (clearShop && next.contestMarkers) next.contestMarkers = { ...next.contestMarkers, disqualified: false, shopWidgetOnly: false };
  return {
    contest: next,
    rulesVerified: verified,
    rulesNote: verified
      ? "The official rules page was fetched."
      : "The rules page was fetched, but frequency, eligibility, end date, and automation were not found, so rules are not verified.",
    rulesText: contestCopy(rulesCheck.html),
    rulesTitle: rulesCheck.contest.title,
  };
}

export async function searchVerifiedGiveaways(rawQuery: string, deps: LiveSearchDeps): Promise<LiveSearchOutcome> {
  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, 180);
  const offset = Math.max(0, Math.min(200, Math.floor(deps.offset ?? 0)));
  if (!query) return empty("", "A blank search is not sent. No listings were added.", Boolean(deps.apiKey?.trim()));
  const key = deps.apiKey?.trim();
  if (!key) {
    return empty(
      query,
      "Live search is not connected. Set PRIZE_SCOUT_SEARCH_API_KEY to a Brave Search API subscription token. No listings were added.",
      false,
    );
  }

  const maxCalls = Math.max(1, Math.min(6, deps.maxBraveCalls ?? 3));
  const variants = plannedQueries(query, maxCalls, offset);
  const hits: BraveHit[] = [];
  let rawResults = 0;
  let fullPage = false;
  let calls = 0;
  let httpStatus: number | null = null;
  let blockedStatus: number | null = null;
  for (const variant of variants) {
    if (calls >= maxCalls) break;
    const endpoint = new URL(deps.searchUrl?.trim() || BRAVE_SEARCH_URL);
    endpoint.searchParams.set("q", variant);
    endpoint.searchParams.set("count", String(BRAVE_COUNT));
    if (offset > 0) endpoint.searchParams.set("offset", String(offset));
    calls += 1;
    let response: Response;
    try {
      response = await deps.fetchImpl(endpoint.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: {
          accept: "application/json",
          "x-subscription-token": key,
        },
      });
    } catch {
      if (calls === 1) return { ...empty(query, "Brave Search did not respond. No listings were added.", true, true, null), braveCalls: calls };
      break;
    }
    httpStatus = response.status;
    if (response.status === 401 || response.status === 403 || response.status === 402 || response.status === 429) {
      blockedStatus = response.status;
      break;
    }
    if (!response.ok || (response.status >= 300 && response.status < 400)) {
      if (calls === 1) return { ...empty(query, "Brave Search did not return a results list. No listings were added.", true, true, response.status), braveCalls: calls };
      break;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (calls === 1) return { ...empty(query, "Brave Search did not return a results list. No listings were added.", true, true, response.status), braveCalls: calls };
      break;
    }
    const parsed = readHits(body);
    if (!parsed.ok) {
      if (calls === 1) return { ...empty(query, parsed.message, true, true, response.status), braveCalls: calls };
      break;
    }
    rawResults += parsed.raw;
    if (parsed.raw >= BRAVE_COUNT) fullPage = true;
    for (const hit of parsed.hits) {
      if (!hits.some((item) => item.url === hit.url)) hits.push(hit);
    }
  }
  if (offset === 0 && isGunQuery(query)) {
    for (const source of WATCHED_SOURCES) {
      if (!source.showWhenBlocked || !source.giveawayUrl) continue;
      if (!hits.some((hit) => hit.url === source.giveawayUrl)) hits.push({ url: source.giveawayUrl, title: source.name, description: "" });
    }
  }
  const nextOffset = fullPage ? offset + BRAVE_COUNT : null;
  if (blockedStatus !== null && hits.length === 0) {
    return { ...empty(query, "Brave Search did not accept the request. No listings were added.", true, true, blockedStatus), braveCalls: calls, nextOffset };
  }
  if (hits.length === 0) {
    console.info(JSON.stringify({ step: "search_yield", raw: rawResults, kept: 0, notFetched: 0, counts: emptyDropCounts() }));
    return { ...empty(query, "Brave Search returned no https pages. No listings were added.", true, true, httpStatus), braveCalls: calls, rawResults, nextOffset };
  }
  const dropCounts = emptyDropCounts();
  const foundVia = new Map<string, string>();
  const slots: Array<VerifiedPracticeRow | null> = hits.map(() => null);
  const directIndexes: number[] = [];
  const directories: Array<{ hit: BraveHit; index: number }> = [];
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    if (isExcludedDirectorySource(hit.url)) {
      dropCounts.dictionary += 1;
      continue;
    }
    if (isDictionaryResult(hit.url, hit.title, hit.description)) {
      dropCounts.dictionary += 1;
      continue;
    }
    if (isObviousJunk(hit.url, hit.title, hit.description, query)) {
      dropCounts.junk += 1;
      continue;
    }
    if (isPressWire(hit.url) && hits.some((item) => sponsorCandidate(item, query))) {
      dropCounts.junk += 1;
      continue;
    }
    if (isJunkResult(hit.url, hit.title, hit.description)) {
      dropCounts.junk += 1;
      continue;
    }
    if (isPromoIdeasResult(hit.url, hit.title, hit.description)) {
      dropCounts.promo += 1;
      continue;
    }
    if (isShoppingResult(hit.url, hit.title, hit.description)) {
      dropCounts.junk += 1;
      continue;
    }
    if (isShutdownHost(hit.url)) {
      const row = searchHitRow(hit.url, hit.title, hit.description);
      slots[index] = { ...row, rulesNote: uncheckedNote("Rafflecopter shut down on October 1, 2025.", hit.title, hit.description) };
    } else if (isNoReadHost(hit.url)) {
      const row = searchHitRow(hit.url, hit.title, hit.description);
      slots[index] = { ...row, rulesNote: uncheckedNote("This site does not allow our check.", hit.title, hit.description) };
    } else if (isDirectoryListing(hit.url)) {
      if (directoryMayExpand(hit.url)) directories.push({ hit, index });
      else slots[index] = { ...directoryBrowseRow(hit.url, hit.title, directorySourceFor(hit.url)?.name ?? null, hit.description), placement: "related" };
    } else directIndexes.push(index);
  }
  const titles = new Map(hits.map((hit) => [hit.url, hit.title]));
  const snippets = new Map(hits.map((hit) => [hit.url, hit.description]));
  const childLinks: string[] = [];
  function addChild(url: string, via: string | null) {
    if (isExcludedDirectorySource(url)) return;
    if (childLinks.includes(url) || directIndexes.some((index) => hits[index]?.url === url)) return;
    childLinks.push(url);
    if (via && !foundVia.has(url)) foundVia.set(url, via);
  }
  const blockedHosts = new Set<string>();
  function blockedSponsorRow(url: string, title: string, snippet: string): VerifiedPracticeRow {
    const row = searchHitRow(url, title, snippet, "failed");
    return { ...row, endIso: null, sponsorPageBlocked: true, rulesNote: uncheckedNote("This site blocked our check.", title, snippet) };
  }
  let directoryFetches = 0;
  for (const item of directories) {
    if (directoryFetches >= MAX_DIRECTORY_FETCHES) break;
    directoryFetches += 1;
    const source = directorySourceFor(item.hit.url);
    const page = await fetchPublicHtml(item.hit.url, deps);
    if (!page.ok) {
      const reason = dropReasonForFailure(page.status, page.message);
      if (reason === "blocked") blockedHosts.add(hostOf(item.hit.url));
      dropCounts[reason] += 1;
      slots[item.index] = directoryBrowseRow(item.hit.url, item.hit.title, source?.name ?? null, item.hit.description);
      continue;
    }
    const observed = observeHtml(page.html, page.url, deps.now());
    if (observed.ok && !isDictionaryResult(page.url, observed.contest.title, observed.contest.shortDescription) && !isPromoIdeasResult(page.url, observed.contest.title, observed.contest.shortDescription) && !isShoppingResult(page.url, observed.contest.title, observed.contest.shortDescription)) {
      const contest = adjustStorePurchase(adjustPaidLottery(observed.contest));
      slots[item.index] = {
        ...toVerifiedPracticeRow(contest, false, "Directory listing. Contests linked from this page are checked separately.", "directory", null, source?.name ?? null),
        listingGroup: contest.pageObservedPurchaseEntry ? "store" : "directory",
        snippet: contest.shortDescription || item.hit.description,
      };
    } else {
      slots[item.index] = directoryBrowseRow(item.hit.url, item.hit.title, source?.name ?? null, item.hit.description);
    }
      for (const link of extractContestLinks(page.html, page.url, LINKS_PER_DIRECTORY)) {
      if (isExcludedDirectorySource(link) || isDirectoryListing(link) || isDictionaryResult(link) || isPromoIdeasResult(link) || isShoppingResult(link) || isNoReadHost(link) || isShutdownHost(link)) continue;
      addChild(link, source?.name ?? null);
    }
  }
  const rankedIndexes = [...directIndexes].sort((left, right) => {
    const leftHit = hits[left];
    const rightHit = hits[right];
    const leftRank = fetchRank(leftHit?.url ?? "", leftHit?.title ?? "", leftHit?.description ?? "", query);
    const rightRank = fetchRank(rightHit?.url ?? "", rightHit?.title ?? "", rightHit?.description ?? "", query);
    return leftRank - rightRank || left - right;
  });
  let ordered: number[] = [];
  const deferred: number[] = [];
  const perHost = new Map<string, number>();
  for (const index of rankedIndexes) {
    const host = hostOf(hits[index]?.url ?? "");
    const count = perHost.get(host) ?? 0;
    if (count >= 3) {
      deferred.push(index);
      continue;
    }
    perHost.set(host, count + 1);
    ordered.push(index);
  }
  ordered.push(...deferred);

  const skipped: Array<{ url: string; reason: string }> = [];
  const extras: VerifiedPracticeRow[] = [];
  let secondaryFetches = 0;
  let fetchAttempts = 0;
  let readCursor = 0;
  let readWave: "primary" | "secondary" = "primary";
  const laterIndexes: number[] = [];
  const unopened: Array<{ url: string; reason: string }> = [];
  const queued = ordered.slice();
  function deferUnrelatedHit(): void {
    const drop = (index: number): boolean => {
      const hit = hits[index];
      if (!hit || fetchRank(hit.url, hit.title, hit.description, query) < 4) return false;
      const laterAt = laterIndexes.indexOf(index);
      if (laterAt >= 0) laterIndexes.splice(laterAt, 1);
      const orderedAt = ordered.indexOf(index);
      if (orderedAt >= readCursor) ordered.splice(orderedAt, 1);
      unopened.push({ url: hit.url, reason: "A same-site rules page was opened instead." });
      if (!slots[index]) slots[index] = searchHitRow(hit.url, hit.title, hit.description, "not_attempted");
      return true;
    };
    for (let i = laterIndexes.length - 1; i >= 0; i -= 1) {
      const index = laterIndexes[i];
      if (index !== undefined && drop(index)) return;
    }
    for (let i = ordered.length - 1; i >= readCursor; i -= 1) {
      const index = ordered[i];
      if (index !== undefined && drop(index)) return;
    }
  }
  async function readPage(url: string, title: string, snippet: string, into: (row: VerifiedPracticeRow) => void): Promise<boolean> {
    try {
      const checked = await checkOfficialPage(url, deps);
      if (!checked.ok) {
        const reason = dropReasonForFailure(checked.status, checked.message);
        const blocked = reason === "blocked";
        const watched = watchedSourceFor(url);
        if (watched?.showWhenBlocked) {
          into(unfetchedWatchRow(url, title || watched.name));
          return blocked;
        }
        dropCounts[reason] += 1;
        skipped.push({ url, reason: checked.message });
        const row = searchHitRow(url, title, snippet, "failed");
        into(blocked ? { ...row, endIso: null, sponsorPageBlocked: true, rulesNote: uncheckedNote("This site blocked our check.", title, snippet) } : row);
        return blocked;
      }
      const contest = adjustStorePurchase(adjustPaidLottery(checked.contest));
      const via = foundVia.get(url) ?? null;
      if (isDictionaryResult(contest.officialUrl, contest.title, contest.shortDescription)) {
        dropCounts.dictionary += 1;
        skipped.push({ url, reason: "dictionary" });
        return false;
      }
      if (isJunkResult(contest.officialUrl, contest.title, contest.shortDescription)) {
        dropCounts.junk += 1;
        skipped.push({ url, reason: "junk" });
        return false;
      }
      if (isPromoIdeasResult(contest.officialUrl, contest.title, contest.shortDescription)) {
        dropCounts.promo += 1;
        skipped.push({ url, reason: "promo" });
        return false;
      }
      if (isShoppingResult(contest.officialUrl, contest.title, contest.shortDescription)) {
        dropCounts.junk += 1;
        skipped.push({ url, reason: "shopping" });
        return false;
      }
      let next = contest;
      let note = "The official page was fetched.";
      let rulesVerified = false;
      let fetchedRulesText = "";
      let fetchedRulesTitle = "";
      let entryPageHtml = checked.ok ? checked.html : "";
      if (next.rulesUrl && samePage(next.rulesUrl, next.officialUrl)) {
        const ruled = await applyRulesPage(next, deps);
        next = adjustStorePurchase(adjustPaidLottery(ruled.contest));
        rulesVerified = ruled.rulesVerified;
        note = ruled.rulesNote;
      } else if (next.rulesUrl && (isStoreRulesPath(next.rulesUrl) && hostOf(next.rulesUrl) === hostOf(url) ? fetchAttempts < MAX_PAGES : secondaryFetches < MAX_RULES_FETCHES)) {
        if (isStoreRulesPath(next.rulesUrl) && hostOf(next.rulesUrl) === hostOf(url)) {
          fetchAttempts += 1;
          deferUnrelatedHit();
        } else {
          secondaryFetches += 1;
        }
        try {
          const ruled = await applyRulesPage(next, deps, RULES_FETCH_MS);
          next = adjustStorePurchase(adjustPaidLottery(ruled.contest));
          rulesVerified = ruled.rulesVerified;
          note = ruled.rulesNote;
          fetchedRulesText = ruled.rulesText;
          fetchedRulesTitle = ruled.rulesTitle;
        } catch {
          note = "The official page was fetched. The rules link failed, so this listing keeps the main page.";
        }
      } else if (next.rulesUrl && rulesContentIsReal(next.rulesFacts, `${next.title} ${next.shortDescription} ${next.pageObservedDetailedDescription ?? ""}`)) {
        rulesVerified = true;
        note = "The official rules text was on the page that was fetched.";
      } else {
        next = { ...next, rulesChecklist: null };
      }
      const ended = isPastEnd({ endIso: next.due.proven ? next.due.isoDate : null }, deps.now());
      const described = `${next.title} ${next.shortDescription} ${next.pageObservedDetailedDescription ?? ""}`;
      const giveaway = qualifiesAsGiveaway(next, ended, query);
      const trade = tradeOnlyContest(url, next.title, described);
      let group: VerifiedPracticeRow["listingGroup"] = "check";
      let skipRules = false;
      let needsChecking: VerifiedPracticeRow["needsChecking"];
      const rulesDoc = isRulesOnlyDocument(url, next.title, next.contestMarkers);
      const rulesText = rulesDoc ? `${described} ${checked.ok ? contestCopy(checked.html) : ""}` : "";
      const entryTarget = rulesDoc ? namedEntryTarget(rulesText, url) : null;
      let mergedEntry = false;
      if (rulesDoc && entryTarget?.startsWith("https://") && sameSponsorHost(entryTarget, url) && !ended && !hits.some((hit) => samePage(hit.url, entryTarget)) && secondaryFetches < MAX_RULES_FETCHES) {
        secondaryFetches += 1;
        try {
          const entryCheck = await checkOfficialPage(entryTarget, deps, RULES_FETCH_MS);
          if (entryCheck.ok) {
            const entryEnded = isPastEnd({ endIso: entryCheck.contest.due.proven ? entryCheck.contest.due.isoDate : null }, deps.now());
            const entryGiveaway = qualifiesAsGiveaway(entryCheck.contest, entryEnded, query);
            if (entryGiveaway && entryCheck.contest.due.proven && !prizeMissesBrand(query, entryCheck.contest.title, `${entryCheck.contest.title} ${entryCheck.contest.shortDescription}`, entryTarget)) {
              fetchedRulesText = contestCopy(checked.ok ? checked.html : "");
              fetchedRulesTitle = next.title;
              next = entryCheck.contest;
              entryPageHtml = entryCheck.html;
              rulesVerified = true;
              mergedEntry = true;
              group = "verified";
              note = "The entry page named in the rules was fetched.";
            }
          }
        } catch {
          /* The rules row keeps the entry address. */
        }
      }
      if (mergedEntry) {
        /* The entry page is the row. */
      } else if (trade) {
        skipRules = true;
        needsChecking = ["eligibility"];
        note = "Open to trade professionals only — check eligibility.";
      } else if (rulesDoc && next.officialUrl === url) {
        skipRules = true;
        note = ended ? "This contest has ended." : entryTarget ? `Rules found; enter at ${entryTarget}.` : "Rules found. The rules do not name where to enter.";
      } else if (!ended && next.due.proven && hasEntryWidget(checked.ok ? checked.html : "") && !(next.contestMarkers && (next.contestMarkers.noPurchaseNecessary || substantiveRulesCount(next.contestMarkers) >= 3))) {
        skipRules = true;
        note = WIDGET_RULES_NOTE;
      } else if (giveaway && rulesVerified && next.due.proven && prizeMissesBrand(query, next.title, described, url)) {
        skipRules = true;
        note = "Prize may not match your search — check the prize.";
      } else if (giveaway && rulesVerified && next.due.proven && missingPrizeTerms(query, next.title, described).length > 0) {
        skipRules = true;
        note = `Prize does not mention ${missingPrizeTerms(query, next.title, described).join(" or ")}.`;
      } else if (giveaway && rulesVerified && next.due.proven) {
        group = "verified";
      } else if (giveaway) {
        skipRules = true;
        if (!next.due.proven) needsChecking = ["endDate"];
        if (!next.due.proven && rulesBodyIsPresent(next.rulesFacts, described)) note = "End date needs checking.";
        else if (!next.due.proven) note = `End date needs checking. ${note}`;
      } else if (scriptInjectedEntry(next) && !ended) {
        skipRules = true;
        note = "Entry form is not in the page HTML.";
      } else if (isDirectoryListing(url)) {
        group = "directory";
        skipRules = true;
        note = "Directory listing. Open it to browse.";
      } else {
        skipRules = true;
        note = missingFactNote(next, ended, url, next.title, checked.ok ? checked.html : "");
      }
      if (group === "verified") {
        const profile = (deps.profileState === undefined ? "ID" : deps.profileState ?? "").trim().toUpperCase();
        const facts = next.rulesFacts;
        const closed = Boolean(profile && facts && (facts.excludedStates.includes(profile) || (facts.includedStates.length > 0 && !facts.includedStates.includes(profile))));
        const scam = next.scamPhrases ?? [];
        const lookalike = lookalikeSponsorNote(next.title, described, url);
        const visibleRules = checked.ok ? contestCopy(checked.html) : described;
        const timeshare = timeshareNote(next.title, `${described} ${visibleRules}`);
        if (scam.length > 0) {
          group = "check";
          skipRules = true;
          note = `Scam warning: ${scam[0]}`;
        } else if (lookalike) {
          group = "check";
          skipRules = true;
          note = lookalike;
        } else if (timeshare) {
          group = "check";
          skipRules = true;
          note = timeshare;
        } else if (closed) {
          group = "check";
          skipRules = true;
          note = `Not open in ${US_STATE_NAMES.find(([code]) => code === profile)?.[1] ?? profile}`;
        }
      }
      const pageHtml = checked.ok ? checked.html : "";
      const news = newsArticleWithoutEntry(url, next.title, described, pageHtml);
      const copy = isPressCopy(url, next.title, described) || announcementCopy(url, next.title, described, pageHtml);
      const editorial = isArticleOrGuide(url, next.title) || isListicleLead(url, next.title) || isAggregatorHost(url) || isCategoryListUrl(url);
      const rulesOnly = isRulesOnlyDocument(url, next.title, next.contestMarkers);
      const ticketPrice = /\$\s?\d[\d,]*(?:\.\d{2})?\s+per\s+(?:entry|entries|spot|spots|seat|seats|ticket|tickets)\b|\bguntickets?\b|(?:paid entry|entry fee)(?:\s+is|\s+of)?\s+\$\s?\d|\bentr(?:y|ies)\s+per\s+\$\s?\d/i.test(`${described} ${pageHtml.replace(/<[^>]+>/g, " ")}`);
      if (next.pageObservedPurchaseEntry && !ended && !editorial && !(rulesOnly && !ticketPrice)) group = "store";
      const casino = sweepsCasinoNote(next.title, `${described} ${pageHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")}`, url);
      if (casino) {
        if (group === "verified" || group === "store") group = "check";
        skipRules = true;
        note = casino;
        next = { ...next, scamPhrases: [] };
      }
      if (group === "check" && (note === "The official page was fetched." || note === "Check the page. Prize Scout did not treat this as an entry.")) {
        note = missingFactNote(next, ended, url, next.title, pageHtml);
      }
      if (group === "verified") {
        const entryCopy = contestCopy(entryPageHtml);
        const entryPlain = entryPageHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
        const sponsorNote = sponsorIdentityNote({
          text: `${entryPlain} ${fetchedRulesText}`,
          url: next.officialUrl,
          rulesUrl: fetchedRulesText ? next.rulesUrl : null,
          prizeUsd: next.prizeValue?.amount ?? null,
        });
        const destination = enterDestinationNote(entryPageHtml, next.officialUrl);
        if (sponsorNote) {
          group = "check";
          skipRules = true;
          note = sponsorNote;
        } else if (fetchedRulesText && rulesAndEntryDisagree(entryCopy, next.title, fetchedRulesText, fetchedRulesTitle || next.title)) {
          group = "check";
          skipRules = true;
          note = RULES_DISAGREE_NOTE;
        } else if (destination) {
          group = "check";
          skipRules = true;
          note = destination;
        }
      }
      const visible = `${described} ${pageHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")}`;
      const related = group !== "verified" && group !== "store" && (isAggregatorHost(url) || isCategoryListUrl(url) || isListicleLead(url, next.title) || editorial || copy || news || offTopicPage(url, next.title, visible) || isDirectoryListing(url));
      if (news) dropCounts.news += 1;
      const row = toVerifiedPracticeRow(next, rulesVerified && !skipRules, note, group, via);
      into(applyWatchedSource({ ...row, lastChecked: deps.now().toISOString().slice(0, 10), needsChecking, placement: related ? "related" : "main", rulesScanSkipped: skipRules || row.rulesScanSkipped }));
      return false;
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      const code = error && typeof error === "object" && "code" in error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : null;
      console.error(JSON.stringify({ step: "official_page", name, code }));
      dropCounts.other += 1;
      skipped.push({ url, reason: "page_check_failed" });
      into(searchHitRow(url, title, snippet));
      return false;
    }
  }
  for (const item of directories.slice(directoryFetches)) {
    unopened.push({ url: item.hit.url, reason: "Directory fetch budget used." });
  }
  const readDeadline = Date.now() + READ_BUDGET_MS;
  let verifiedReads = 0;
  const hostLock = new Map<string, Promise<void>>();
  async function readWorker(): Promise<void> {
    while (readCursor < ordered.length) {
      if (Date.now() > readDeadline) return;
      const index = ordered[readCursor];
      readCursor += 1;
      const hit = hits[index];
      if (!hit) continue;
      if (readWave === "primary" && fetchRank(hit.url, hit.title, hit.description, query) >= 4) {
        laterIndexes.push(index);
        continue;
      }
      const host = hostOf(hit.url);
      const gate = hostLock.get(host) ?? Promise.resolve();
      let release = () => {};
      const lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      hostLock.set(host, gate.then(() => lock));
      await gate;
      try {
        if (blockedHosts.has(host)) {
          slots[index] = { ...blockedSponsorRow(hit.url, hit.title, hit.description), placement: "main" };
          continue;
        }
        if (isListicleLead(hit.url, hit.title) || isPressWire(hit.url) || isBrandCatalogPage(hit.url, hit.title)) {
          const why = isPressWire(hit.url)
            ? "Related page. This is a press copy, so the page was not opened."
            : isListicleLead(hit.url, hit.title)
              ? isAggregatorHost(hit.url)
                ? "Related page. This is an aggregator list, so the page was not opened."
                : "Related page. This title is a list, so the page was not opened."
              : "Related page. This brand page is not one contest, so the page was not opened.";
          slots[index] = { ...searchHitRow(hit.url, hit.title, hit.description), placement: "related", needsChecking: undefined, endIso: null, rulesNote: why };
          unopened.push({ url: hit.url, reason: why });
          if (isPressWire(hit.url)) dropCounts.news += 1;
          continue;
        }
        if (verifiedReads >= VERIFIED_STOP || fetchAttempts >= MAX_PAGES || Date.now() > readDeadline) {
          slots[index] = searchHitRow(hit.url, hit.title, hit.description, "not_attempted");
          unopened.push({ url: hit.url, reason: "Search stopped before this page was opened." });
          continue;
        }
        fetchAttempts += 1;
        const blocked = await readPage(hit.url, hit.title, hit.description, (row) => {
          slots[index] = row;
        });
        if (blocked) blockedHosts.add(host);
        if (slots[index]?.listingGroup === "verified" || slots[index]?.listingGroup === "store") verifiedReads += 1;
      } finally {
        release();
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, Math.max(ordered.length, 1)) }, () => readWorker()));
  if (laterIndexes.length > 0) {
    ordered = laterIndexes.slice();
    readCursor = 0;
    readWave = "secondary";
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, ordered.length) }, () => readWorker()));
  }
  for (const index of queued) {
    if (slots[index]) continue;
    const hit = hits[index];
    if (hit) {
      slots[index] = searchHitRow(hit.url, hit.title, hit.description, "not_attempted");
      unopened.push({ url: hit.url, reason: "Search stopped before this page was opened." });
    }
  }
  for (const url of childLinks) {
    const host = hostOf(url);
    if (blockedHosts.has(host)) {
      extras.push(blockedSponsorRow(url, titles.get(url) || "", snippets.get(url) || ""));
      continue;
    }
    const blocked = await readPage(url, titles.get(url) || "", snippets.get(url) || "", (row) => {
      extras.push(row);
    });
    if (blocked) blockedHosts.add(host);
  }
  const pagesNotOpened = { count: unopened.length, pages: unopened };
  const notFetched = pagesNotOpened.count;
  const prepared = absorbContestCopies(collapseSearchRows([...slots.filter((row): row is VerifiedPracticeRow => row !== null), ...extras].map((row) => closeWatchedIfDue(applyWatchedSource(row), deps.now()))));
  const region = deps.region ?? "US";
  const listed = capProductFamilies(collapseSharedRules(demoteSharedReleases(prepared)), query).filter((row) => keepForRegion(row, query, region));
  const listings = rankSearchRows(listed, deps.now(), query).map((row) => ({ ...row, placement: row.placement ?? "main" }));
  const buckets = {
    verified: listings.filter((row) => row.listingGroup === "verified" && !isPastEnd(row, deps.now())).length,
    paid: listings.filter((row) => row.listingGroup === "store" && !isPastEnd(row, deps.now())).length,
    check: listings.filter((row) => row.listingGroup !== "verified" && row.listingGroup !== "store" && row.listingGroup !== "directory" && !isPastEnd(row, deps.now())).length,
    directory: listings.filter((row) => row.listingGroup === "directory" || row.unreadDirectory).length,
    ended: listings.filter((row) => isPastEnd(row, deps.now())).length,
  };
  console.info(JSON.stringify({ step: "search_yield", raw: rawResults, kept: listings.length, notFetched, pagesNotOpened, buckets, counts: dropCounts }));
  const message =
    listings.length > 0
      ? `Fetched ${listings.length} official page${listings.length === 1 ? "" : "s"} from Brave Search. Nothing was submitted.`
      : "Brave Search returned pages, and none of them verified as an official entry. No listings were added.";
  return {
    configured: true,
    provider: SEARCH_PROVIDER,
    keyEnv: SEARCH_API_KEY_ENV,
    query,
    listings,
    skipped,
    message,
    braveCalled: calls > 0,
    braveCalls: calls,
    httpStatus,
    dropCounts,
    pagesNotOpened,
    rawResults,
    nextOffset,
  };
}
