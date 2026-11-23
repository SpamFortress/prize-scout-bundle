import { WATCHED_SOURCES, watchedDomains, type WatchedSource } from "@/config/watched-sources";
import { queryCategories } from "./brand-categories";
import type { Contest } from "./types";

export const FREE_METHOD_LABEL = "Free method available (see rules)";

export const DROP_REASONS = ["fetch_failed", "no_form", "no_rules", "js_widget", "blocked", "news", "dictionary", "promo", "junk", "other"] as const;
export type DropReason = (typeof DROP_REASONS)[number];
export type DropCounts = Record<DropReason, number>;

export function emptyDropCounts(): DropCounts {
  return { fetch_failed: 0, no_form: 0, no_rules: 0, js_widget: 0, blocked: 0, news: 0, dictionary: 0, promo: 0, junk: 0, other: 0 };
}

const CONTEST_WORD = /\b(?:giveaways?|sweepstakes|sweeps|contests?|win(?:s|ning|ner|ners)?)\b/i;

/** A query with no contest word is sent as “<query> giveaway sweepstakes”. */
export function rewriteSearchQuery(query: string): string {
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (!trimmed || CONTEST_WORD.test(trimmed)) return trimmed;
  return `${trimmed} giveaway sweepstakes`;
}

const DICTIONARY_HOSTS = [
  "dictionary.com",
  "merriam-webster.com",
  "thefreedictionary.com",
  "collinsdictionary.com",
  "dictionary.cambridge.org",
  "oxfordlearnersdictionaries.com",
  "lexico.com",
  "wiktionary.org",
  "wordreference.com",
  "vocabulary.com",
  "yourdictionary.com",
  "definitions.net",
  "wordnik.com",
  "britannica.com",
  "wordwebonline.com",
  "dictionary.nolo.com",
  "thelawdictionary.org",
  "dictionary.law.com",
];

/** A title that is a definition, not a promotion. */
export function isDefinitionTitle(title: string): boolean {
  const text = title.replace(/\s+/g, " ").trim();
  if (!text || /\b(?:giveaway|sweepstakes|enter to win)\b/i.test(text)) return false;
  return /^(?:the\s+)?definition\b/i.test(text) || /\bdefinition$/i.test(text) || /\bdefinition\s+of\b/i.test(text);
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isDictionaryResult(url: string, title = "", description = ""): boolean {
  const host = hostOf(url);
  if (DICTIONARY_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (/\/(?:define|definition|dictionary|meanings?)\b/i.test(path)) return true;
  if ((host === "law.cornell.edu" || host.endsWith(".law.cornell.edu")) && (/^\/wex(?:\/|$)/i.test(path) || isDefinitionTitle(title))) return true;
  if ((host === "nolo.com" || host.endsWith(".nolo.com")) && (/dictionary|definition/i.test(path) || isDefinitionTitle(title))) return true;
  if (isDefinitionTitle(title)) return true;
  const blob = `${title} ${description}`;
  if (/\b(?:definition|synonyms?|pronunciation|word forms?)\b/i.test(blob) && /\b(?:noun|verb|adjective|adverb|plural|syllables?)\b/i.test(blob)) return true;
  return /\b(?:definition of|dictionary entry|pronunciation|list of synonyms)\b/i.test(blob);
}

/** Product listings and shopping pages. A giveaway path is not one. */
export function isShoppingResult(url: string, title = "", description = ""): boolean {
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  if (/\/(?:giveaways?|sweepstakes|contests?|competitions?|win|winners)(?:\/|$)/i.test(path)) return false;
  const blob = `${title} ${description}`;
  if (/\bfor sale\b/i.test(blob)) return true;
  if (/\/(?:products?|dp|sku|catalog)\//i.test(path) && !/\b(?:giveaway|sweepstakes|contest)\b/i.test(blob)) return true;
  return false;
}

export function isPromoIdeasResult(url: string, title = "", description = ""): boolean {
  const blob = `${url} ${title} ${description}`;
  return /\bgiveaway ideas\b|\bpromo(?:tional)? products?\b|\bpromotional items\b|\bgiveaway items\b|\bswag ideas\b|\btradeshow\b|\btrade show\b/i.test(blob);
}

const JUNK_HOSTS = ["random.org", "game8.co", "pinnaclepromotions.com", "giveaways.com", "themusclecarplace.com"];

/** Tool sites, mystery-box sellers, game guides, and interview blogs. Not contests. */
export function isJunkResult(url: string, title = "", description = ""): boolean {
  const host = hostOf(url);
  const blob = `${url} ${title} ${description}`;
  if (JUNK_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  if (/\b(?:mystery\s*-?\s*box(?:es)?|loot\s*-?\s*box(?:es)?|loot\s*crate)\b/i.test(blob)) return true;
  if (/\b(?:random(?:\.org)?|random\s+(?:number|picker|draw)|picker\s+wheel|wheel\s+of\s+names)\b/i.test(blob) && !/\bofficial rules\b/i.test(blob)) return true;
  if (/\b(?:walkthrough|tier\s+list|game\s+guide|event\s+guide|gacha)\b/i.test(blob)) return true;
  if (/\binterview\b/i.test(`${title} ${url}`) && !/\b(?:giveaway|sweepstakes)\s+(?:entry|rules)\b/i.test(title)) return true;
  return false;
}

const OPEN_WORDS = ["giveaway", "sweepstakes", "contest"] as const;

/** Two or three searches: the user's words plus each contest word they did not already type. */
export function openSearchQueries(query: string): string[] {
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const queries = OPEN_WORDS.map((word) => (new RegExp(`\\b${word}s?\\b`, "i").test(trimmed) ? trimmed : `${trimmed} ${word}`));
  return [...new Set(queries)].slice(0, 3);
}

/** The typed query, plus at most two variants. Repeated words are not added twice. */
export function queryVariants(query: string): string[] {
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const variants = [trimmed];
  if (!lower.includes("official rules")) variants.push(`${trimmed} sweepstakes official rules`);
  if (!lower.includes("giveaway enter")) variants.push(`${trimmed} giveaway enter`);
  return [...new Set(variants)].slice(0, 3);
}

/** The page sells entries. An event fee, a product price, or a price mentioned in an article does not. */
export function isPurchaseEntryText(text: string): boolean {
  return (
    /\bguntickets?\b/i.test(text) ||
    /\$\s?\d[\d,]*(?:\.\d{2})?\s+per\s+(?:entry|entries|spot|spots|seat|seats|ticket|tickets)\b/i.test(text) ||
    /\b(?:spot|seat|ticket)s?\s+(?:for|at)\s+\$\s?\d/i.test(text) ||
    /\bentr(?:y|ies)\s+(?:per|for(?:\s+every|\s+each)?)\s+\$\s?\d+/i.test(text) ||
    /\bentr(?:y|ies)\s+per[- ]dollar\b/i.test(text) ||
    /\bper[- ]dollar\b[^.]{0,24}\bentr(?:y|ies)\b/i.test(text) ||
    /\bfor every\s+\$\s?\d+\b[^.]{0,24}\bentr(?:y|ies)\b/i.test(text) ||
    /\bbuy-?in\b[^.]{0,40}\bentr(?:y|ies)\b/i.test(text) ||
    /(?:paid entry|entry fee)(?:\s+is|\s+of)?\s+\$\s?\d/i.test(text) ||
    /\$\s?\d[\d,]*(?:\.\d{2})?\s*(?:paid entry|entry fee)\b/i.test(text) ||
    /\b(?:paid|purchase[d]?|buy|bought)\b[^.]{0,40}\b(?:merch(?:andise)?|membership)\b[^.]{0,40}\bentr(?:y|ies)\b/i.test(text) ||
    /\b(?:merch(?:andise)?|membership)\s+entr(?:y|ies)\b/i.test(text) ||
    /\b(?:merch(?:andise)?|membership)\b[^.]{0,40}\b(?:purchase|fee|price)\b[^.]{0,40}\bentr(?:y|ies)\b/i.test(text) ||
    /\borders?\s+(?:also\s+)?(?:earn|receive|get)\s+(?:an\s+|you\s+)?entr/i.test(text) ||
    /\b(?:earn|earns|earned)\s+(?:\d+\s+)?entr(?:y|ies)\b[^.]{0,60}\b(?:order|purchase|buying|spent|spending)\b/i.test(text)
  );
}

export function hasFreeMethodText(text: string): boolean {
  return /no purchase necessary|mail-?in|\bAMOE\b|free method of entry|alternate method of entry|enter for free/i.test(text);
}

export function isGunQuery(query: string): boolean {
  return queryCategories(query).includes("gun");
}

const VEHICLE_WORD = String.raw`vehicles?|trucks?|cars?|suvs?|pickups?|raptors?|atvs?|utvs?|sxs|side[- ]by[- ]sides?|dirt\s*bikes?|dirtbikes?|motorcycles?|motocross|mx|off[- ]roads?|snowmobiles?|jet\s*skis?`;

export function isVehicleQuery(query: string): boolean {
  return queryCategories(query).includes("vehicle") || new RegExp(String.raw`\b(?:${VEHICLE_WORD})\b`, "i").test(query);
}

const SYNONYM_GROUPS: Array<{ match: RegExp; terms: string[] }> = [
  { match: /\b(?:dirt\s*bikes?|dirtbikes?|motorcycles?|motocross|mx|crf|ride\s*red)\b/i, terms: ["motorcycle", "motocross", "off-road", "CRF", "KTM", "ride red"] },
  { match: /\b(?:atvs?|utvs?|sxs|side[- ]by[- ]sides?)\b/i, terms: ["ATV", "UTV", "side by side", "SxS"] },
  { match: /\boff[- ]roads?\b/i, terms: ["off-road", "ATV", "UTV"] },
  { match: /\bsnowmobiles?\b/i, terms: ["snowmobile", "sled"] },
  { match: /\bjet\s*skis?\b/i, terms: ["jet ski", "personal watercraft"] },
];

/** One extra search that stays inside the open-query slots. Terms already typed are left out. */
export function synonymSearchQuery(query: string): string | null {
  const group = SYNONYM_GROUPS.find((item) => item.match.test(query));
  if (!group) return null;
  const extra = group.terms.filter((term) => !new RegExp(String.raw`\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\b`, "i").test(query));
  if (extra.length === 0) return null;
  const parts = extra.map((term) => (term.includes(" ") || term.includes("-") ? `"${term}"` : term));
  return `(${parts.join(" OR ")}) sweepstakes`;
}

/** Open queries, with a synonym query replacing the last slot when one applies. Watched-site and platform queries follow. */
export function searchQueries(query: string, offset = 0): string[] {
  let open = openSearchQueries(query);
  const synonym = offset === 0 ? synonymSearchQuery(query) : null;
  if (synonym) open = [...open.filter((item) => item.toLowerCase() !== synonym.toLowerCase()).slice(0, 2), synonym];
  if (offset > 0) return open;
  const site = watchedSiteQuery(query);
  return [...open, ...(site ? [site] : []), ...platformSearchQueries(query).slice(0, 2)];
}

/** Retail sweepstakes topics. A plain “home” word is included because the owner asked for it. */
export function isRetailQuery(query: string): boolean {
  return /\b(?:cash|money)\s+giveaways?\b|\bshopping spree\b|\bgift cards?\s+giveaways?\b|\bkitchen\b|\bpots and pans\b|\bcookware\b|\bhome\b/i.test(query);
}

/**
 * At most two extra Brave requests. The second request keeps the platform hosts
 * and spends that same slot on official-rules and brand paths. ShortStack and
 * Woobox are included only as search hits.
 */
export function platformSearchQueries(query: string): string[] {
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];
  return [
    `${trimmed} (site:gleam.io OR site:sweepwidget.com/c OR site:sweepwidget.com/view OR site:kingsumo.com/g OR site:rafflepress.com)`,
    `${trimmed} ("official rules" OR inurl:official-rules OR inurl:sweepstakes OR inurl:newsroom OR inurl:press) (site:app.viralsweep.com/sweeps OR site:apps.easypromosapp.com/p OR site:bs.easypromosapp.com/p OR site:pr.easypromosapp.com/p OR site:woobox.com OR site:cmpgn.page OR site:lndg.page)`,
  ];
}

export function isNoReadHost(url: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
  if (host === "woobox.com" || host.endsWith(".woobox.com")) return true;
  if (host === "shortstack.com" || host.endsWith(".shortstack.com")) return true;
  return host.endsWith(".cmpgn.page") || host.endsWith(".lndg.page");
}

export function isShutdownHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return host === "rafflecopter.com" || host.endsWith(".rafflecopter.com");
  } catch {
    return false;
  }
}

/** Open queries, one watched-site booster, and at most two platform queries. Synonyms replace a slot; they do not add a call. */
export function braveCallBudget(query: string, offset = 0): number {
  return searchQueries(query, offset).length;
}

/** One Brave query covering every watched domain that has a hostname. Not used for other topics. */
export function watchedSiteQuery(query: string, sources?: readonly WatchedSource[]): string | null {
  const list = sources ?? WATCHED_SOURCES;
  const categories = queryCategories(query);
  const vehicle = isVehicleQuery(query) || categories.includes("vehicle") ? watchedDomains(list, "vehicle") : [];
  const gun = isGunQuery(query) || categories.includes("gun") ? watchedDomains(list, "gun") : [];
  const cash = categories.includes("cash") ? watchedDomains(list, "cash") : [];
  const retail = isRetailQuery(query) ? watchedDomains(list, "retail") : [];
  const domains = [...new Set([...vehicle, ...gun, ...cash, ...retail])];
  if (domains.length === 0) return null;
  return `${query} (${domains.map((domain) => `site:${domain}`).join(" OR ")})`;
}

/** Internal entry shape. Search results are one list; these values are not section headings. */
export type ListingLabel = "verified" | "store" | "directory" | "social" | "article" | "check";

/** Buying entries makes the row paid. A stated free method stays on the facts so the label can use it. */
export function adjustStorePurchase(contest: Contest): Contest {
  if (!contest.pageObservedPurchaseEntry) return contest;
  const restrictions = contest.restrictions.includes("purchase_required") ? contest.restrictions : [...contest.restrictions, "purchase_required" as const];
  return {
    ...contest,
    entryCost: "paid",
    hubOnly: false,
    restrictions,
    rulesFacts: contest.rulesFacts ? { ...contest.rulesFacts, purchaseRequired: true } : contest.rulesFacts,
  };
}

/** A lottery or raffle that does not state “no purchase necessary” is paid. */
export function adjustPaidLottery(contest: Contest): Contest {
  const lottery = /\b(lottery|raffles?)\b/i.test(`${contest.title} ${contest.shortDescription} ${contest.officialUrl}`);
  const freeStated = contest.entryCost === "free" || contest.rulesFacts?.freeEntryStated === true;
  if (!lottery || freeStated) return contest;
  const restrictions = contest.restrictions.includes("purchase_required") ? contest.restrictions : [...contest.restrictions, "purchase_required" as const];
  return {
    ...contest,
    entryCost: "paid",
    restrictions,
    rulesFacts: contest.rulesFacts ? { ...contest.rulesFacts, purchaseRequired: true, freeEntryStated: false } : contest.rulesFacts,
  };
}

const PRESS_WIRES = ["einpresswire.com", "prnewswire.com", "businesswire.com", "globenewswire.com", "prweb.com", "accesswire.com", "newswire.com"];
const REFERENCE_HOSTS = ["wikipedia.org", "thesaurus.com", "powerthesaurus.org", "wordhippo.com", "crosswordsolver.com", "crosswordtracker.com", "wordplays.com"];
const THREAD_HOSTS = ["youtube.com", "youtu.be", "facebook.com", "fb.com", "fb.watch", "reddit.com", "redd.it"];
const REPUBLISHERS = ["winprizesonline.com", "offerscontest.com"];
const PLATFORM_HOSTS = ["gleam.io", "woobox.com", "shortstack.com", "viralsweep.com", "kingsumo.com", "sweepwidget.com"];

function hostMatchesList(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function isPressWire(url: string): boolean {
  return hostMatchesList(hostOf(url), PRESS_WIRES);
}

/** A syndicated release. The bare word "press" is not enough. */
export function isPressCopy(url: string, title = "", text = ""): boolean {
  if (isPressWire(url)) return true;
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = "";
  }
  if (/press-releases?|ein-presswire/.test(path)) return true;
  const blob = `${title} ${text}`;
  if (/\b(?:EIN\s*Presswire|PR\s*Newswire|Business\s*Wire|GlobeNewswire|Accesswire|PRWeb)\b/i.test(blob)) return true;
  if (/[A-Z][A-Za-z .]+,\s+[A-Z]{2}(?:,\s+[A-Z][A-Za-z]+\s+\d{1,2},\s+\d{4})?\s+\/\s*(?:EIN\s*Presswire|PR\s*Newswire|Business\s*Wire|GlobeNewswire|Accesswire)/.test(blob)) return true;
  return false;
}

/** A long release id shared by two hosts, from the path. Not a calendar year. */
export function releaseId(url: string): string | null {
  const match = url.match(/\/(\d{8,})(?=-|\/|$)/);
  return match?.[1] ?? null;
}

/** UK-only or Canada-only wording. A page that also names the United States is not foreign-only. */
export function foreignOnlyCountry(title: string, text: string): "UK" | "CA" | null {
  const blob = `${title} ${text}`;
  if (/\b(?:united states|u\.s\.a\.|u\.s\.)\b/i.test(blob)) return null;
  if (/\b(?:united kingdom|u\.k\. only|uk only|residents of (?:the )?uk|great britain only)\b/i.test(blob)) return "UK";
  if (/\b(?:canada only|canadian residents only|residents of canada only|open only to (?:legal )?residents of canada)\b/i.test(blob)) return "CA";
  return null;
}

/** A giveaway platform's own marketing page. A campaign URL is not one. */
export function isPlatformMarketing(url: string): boolean {
  const host = hostOf(url);
  if (!hostMatchesList(host, PLATFORM_HOSTS)) return false;
  let path = "/";
  try {
    path = new URL(url).pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    return false;
  }
  if (/^\/(?:pricing|compare|blog|docs|help|support|features|customers|about|templates|plans|enterprise|app)(?:\/|$)/i.test(path)) return true;
  if (path === "/giveaways" || path.startsWith("/giveaways/")) return false;
  if (/^\/[a-z0-9]{4,}(?:\/|$)/i.test(path)) return false;
  return path === "/";
}

/** A race or event schedule that is not itself a contest. */
export function isEventCalendar(url: string, title = "", description = ""): boolean {
  const blob = `${url} ${title} ${description}`;
  if (/\b(?:giveaway|sweepstakes|contest|enter to win)\b/i.test(blob)) return false;
  return /\b(?:race calendar|event calendar|upcoming races|race schedule|event schedule)\b/i.test(blob);
}

/** A charity page that is not a contest and does not mention the query. */
export function isUnrelatedCharity(url: string, title: string, description: string, query: string): boolean {
  const blob = `${url} ${title} ${description}`;
  if (!/\b(?:charit(?:y|ies)|donate|donation|nonprofit|foundation)\b/i.test(blob)) return false;
  if (/\b(?:giveaway|sweepstakes|contest|raffle|enter to win)\b/i.test(blob)) return false;
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !/^(?:the|and|for|win)$/.test(term));
  return !terms.some((term) => blob.toLowerCase().includes(term));
}

/** Wikipedia, reference sites, social threads, platform marketing, calendars, and unrelated charity pages. */
export function isObviousJunk(url: string, title = "", description = "", query = ""): boolean {
  const host = hostOf(url);
  if (hostMatchesList(host, REFERENCE_HOSTS) || /(?:crossword|thesaurus)/i.test(host)) return true;
  if (hostMatchesList(host, THREAD_HOSTS)) return true;
  if (isPlatformMarketing(url)) return true;
  if (isEventCalendar(url, title, description)) return true;
  if (isUnrelatedCharity(url, title, description, query)) return true;
  return false;
}

/** Directory and aggregator copies of someone else's contest. */
export function isRepublication(url: string): boolean {
  return hostMatchesList(hostOf(url), REPUBLISHERS);
}

export function dropReasonForFailure(status: number, message: string): DropReason {
  if (status === 403 || status === 429 || /\brobots\b|not public|private network|\bHTTP 403\b|\bHTTP 429\b/i.test(message)) return "blocked";
  return "fetch_failed";
}
