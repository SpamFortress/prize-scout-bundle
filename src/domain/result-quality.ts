import { contestEndDates, statedEndIso } from "./dates";
import { isPressCopy } from "./search-yield";
import type { Contest, ContestMarkers } from "./types";

/** Contest signals, brand-query noise, and prize relevance. Prize words rank; they do not grant Verified. */

const STOP = new Set(["giveaway", "giveaways", "sweepstakes", "sweeps", "contest", "contests", "win", "free", "official", "rules", "a", "an", "the", "of", "and", "for", "or", "to"]);

const PHRASES: Array<{ phrase: string; terms: string[] }> = [
  { phrase: "side by side", terms: ["side by side", "side-by-side", "sxs", "utv", "atv"] },
  { phrase: "side-by-side", terms: ["side by side", "side-by-side", "sxs", "utv", "atv"] },
  { phrase: "dirt bike", terms: ["dirt bike", "dirtbike", "motorcycle", "motocross", "crf", "ktm", "ride red"] },
  { phrase: "video game", terms: ["video game", "videogame", "roblox", "xbox", "playstation", "nintendo", "steam"] },
  { phrase: "gift card", terms: ["gift card", "giftcard"] },
  { phrase: "pots and pans", terms: ["pots and pans", "cookware", "pots", "pans"] },
];

const WORD_TERMS: Record<string, string[]> = {
  truck: ["truck", "pickup"],
  honda: ["honda"],
  kitchen: ["kitchen", "appliance", "cookware"],
  cruise: ["cruise"],
  vacation: ["vacation", "trip"],
  cash: ["cash"],
  motorcycle: ["motorcycle", "motocross", "dirt bike", "dirtbike", "crf", "ride red"],
  crf: ["crf", "dirt bike", "motorcycle", "ride red"],
  utv: ["utv", "side by side", "sxs"],
  atv: ["atv", "utv", "sxs"],
};

/** Groups of synonyms. Every group must hit the prize title. Empty when the query has no object word. */
export function queryConceptGroups(query: string): string[][] {
  let rest = query.toLowerCase().replace(/\s+/g, " ").trim();
  rest = rest.replace(/\b(?:giveaways?|sweepstakes|sweeps|contests?|win|free|official|rules)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!rest) return [];
  const groups: string[][] = [];
  for (const item of PHRASES) {
    if (!rest.includes(item.phrase)) continue;
    groups.push(item.terms);
    rest = rest.replace(item.phrase, " ");
  }
  for (const word of rest.split(" ").filter((part) => part.length > 1 && !STOP.has(part))) {
    groups.push(WORD_TERMS[word] ?? [word]);
  }
  return groups;
}

function prizeHay(title: string, prize: string): string {
  const cleaned = prize.replace(/^not stated\b[^.]*/i, "");
  return `${title} ${cleaned}`.toLowerCase();
}

/** True when the searched thing is in the title or the prize description. A plan or guide is not the object itself. */
export function prizeMatchesQuery(query: string, title: string, prize: string): boolean {
  const groups = queryConceptGroups(query);
  if (groups.length === 0) return true;
  const hay = prizeHay(title, prize);
  if (/\b(?:woodworking plan|free plan|build plan|pdf plan|how to build)\b/i.test(hay)) return false;
  return groups.every((group) => group.some((term) => hay.includes(term)));
}

/** The brand is only a sponsor, a dealer ad, or a jobs story. A product sweepstakes is not one of these. */
export function isSponsorshipOnly(query: string, title: string, text: string): boolean {
  const blob = `${title} ${text}`;
  if (/\btest[- ]?drive\b/i.test(blob)) return true;
  if (/\btechnicians?\b/i.test(blob) && /\b(?:contest|sweepstakes|competition|winner)\b/i.test(blob)) return true;
  const brand = query.toLowerCase().split(/\s+/).find((word) => word.length > 2 && !STOP.has(word)) ?? "";
  if (!brand || !new RegExp(`\\b${brand}\\b`, "i").test(title)) return false;
  if (/\b(?:classic|tournament|invitational)\b/i.test(title) && /\b(?:golf|topgolf|pga|lpga)\b/i.test(blob)) return true;
  if (/\b(?:ducks|jets|yankees|lakers|nhl|nfl|nba|mlb)\b/i.test(title)) return true;
  return false;
}

const EMPTY_MARKERS: ContestMarkers = {
  noPurchaseNecessary: false,
  eligibility: false,
  entryPeriod: false,
  winnerSelection: false,
  odds: false,
  prizeValue: false,
  sponsor: false,
  specificPrize: false,
  specificDates: false,
  ownEntry: false,
  disqualified: false,
  shopWidgetOnly: false,
};

const WIDGET = /gleam\.io|js\.gleam\.io|gleamembed|sweepwidget\.com|w_init\.js|viralsweep|woobox|shortstack|kingsumo|easypromos|rafflepress|rafflecopter|wishpond|typeform|docs\.google\.com\/forms|google\.com\/forms|hubspot|hsforms|jotform/i;
/** Entry embeds. HubSpot, a newsletter form, and a theme Add to cart button are not entry widgets. */
const ENTRY_WIDGET = /gleam\.io|js\.gleam\.io|gleamembed|sweepwidget\.com|w_init\.js|viralsweep|woobox|shortstack|kingsumo|easypromos|rafflepress|rafflecopter|wishpond/i;

/** Gleam, SweepWidget, ViralSweep, and the other known entry embeds. */
export function hasEntryWidget(html: string): boolean {
  return ENTRY_WIDGET.test(html) && /<(?:iframe|script)\b/i.test(html);
}

/** Rules text, including a rules section stored in the page's own script or JSON. A site footer is left out. */
export function contestCopy(html: string): string {
  const decoded = html
    .replace(/\\u003c/gi, "<")
    .replace(/\\u003e/gi, ">")
    .replace(/\\u0026/gi, "&")
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"');
  const body = decoded.replace(/<footer\b[\s\S]*?<\/footer>/gi, " ");
  const visible = body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const embedded: string[] = [];
  for (const script of decoded.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const inner = script[1].replace(/<[^>]+>/g, " ");
    if (!/no purchase|official rules|sweepstakes period|giveaway ends|close date/i.test(inner)) continue;
    for (const sentence of inner.split(/(?<=[.!])\s+/)) {
      if (sentence.length > 420) continue;
      if (/no purchase|official rules|eligib|odds of|ends\b|close date|void where prohibited|random drawing/i.test(sentence)) embedded.push(sentence);
    }
  }
  const jsonDates = [...decoded.matchAll(/"(?:endDate|validThrough)"\s*:\s*"([^"]+)"/gi)].map((match) => `ends ${match[1]}`);
  return `${visible} ${embedded.join(" ")} ${jsonDates.join(" ")}`.replace(/\s+/g, " ");
}

export function hasNoPurchase(text: string): boolean {
  return /no purchase\b[\s\S]{0,80}\b(?:necessary|needed)\b/i.test(text);
}

function specificPrizeNamed(text: string): boolean {
  const named = /\b(?:enter to win|win|won)\s+(?:a|an|the|your)\s+([^.]{3,80})/i.exec(text);
  if (!named) return false;
  const rest = named[1].replace(/\b(?:prize|prizes|giveaway|sweepstakes|contest|entry)\b/gi, "").trim();
  return /[a-z0-9]{3,}/i.test(rest);
}

function outboundContestLinks(html: string, pageUrl: string): number {
  let count = 0;
  let pageHost = "";
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return 0;
  }
  for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(anchor[1])?.[1];
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    if (url.hostname.replace(/^www\./, "") === pageHost) continue;
    const label = anchor[2].replace(/<[^>]+>/g, " ");
    if (/\b(?:giveaway|sweepstakes|contest)\b/i.test(`${url.pathname} ${label}`)) count += 1;
  }
  return count;
}

const NEVER_VERIFIED_HOSTS = [
  "fox8.com",
  "moneypantry.com",
  "thefreebieguy.com",
  "giveawaydrop.com",
  "instagc.com",
  "ultracontest.com",
  "winprizesonline.com",
  "offerscontest.com",
  "sweepskings.com",
  "slickdeals.net",
  "sweepstake.com",
];

function hostNeverVerified(url: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return false;
  }
  if (/(^|\.)investor\.|\binvestor\b/.test(host)) return true;
  return NEVER_VERIFIED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** How-to, winner story, press release, listicle, homepage, or a page full of other contests. */
export function neverVerifiedPage(url: string, title: string, html = ""): boolean {
  if (hostNeverVerified(url)) return true;
  let path = "";
  try {
    path = new URL(url).pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    path = "";
  }
  const where = `${path} ${title}`;
  if (/\bhow-?\s*to\b|\bguides?\b|\bways\b|\btips\b|\bplans?\b/i.test(where)) return true;
  if (/\b(?:press release|investor|earnings)\b/i.test(where)) return true;
  if (/\b(?:\d+\s+best|listicle|roundup)\b/i.test(title)) return true;
  if (/\bwinners?\b/i.test(title) && /\b(?:announced|won|wins|selected|crowned|page)\b/i.test(title)) return true;
  if ((path === "/" || path === "/index" || path === "/index.html") && !homepageIsOneContest(html)) return true;
  if (/^\/(?:giveaways|contests|sweeps)$/.test(path)) return true;
  const indexPath = path === "/" || /^\/(?:sweepstakes|giveaways|contests)$/.test(path);
  const indexTitle = /\b(?:all sweepstakes|giveaway archive|sweepstakes index|contest list)\b/i.test(title);
  if ((indexPath && indexTitle) || (indexPath && outboundContestLinks(html, url) >= 6)) return true;
  if (outboundContestLinks(html, url) >= 6) return true;
  return false;
}

function sameSiteEntryCta(html: string, pageUrl: string): boolean {
  let pageHost = "";
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(anchor[1])?.[1];
    const label = anchor[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!href || !/\benter (?:now|to win)\b/i.test(label)) continue;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (url.hostname.replace(/^www\./, "") !== pageHost) continue;
    if (/\/(?:enter|sweepstakes|giveaway|contest|win)\b/i.test(url.pathname)) return true;
  }
  return false;
}

function manySponsors(text: string): boolean {
  const names = new Set<string>();
  for (const match of text.matchAll(/\b(?:sponsored by|the sponsor is|sponsor:)\s+([A-Za-z0-9][^.,;\n]{1,40})/gi)) {
    const name = match[1].replace(/\b(?:inc|llc|ltd|co|the)\b\.?/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
    if (name.length > 1) names.add(name);
  }
  return names.size >= 2;
}

function mainPrizeHtml(html: string): string {
  return html
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<(?:div|section|ul)\b[^>]*(?:id|class)=["'][^"']*(?:sidebar|related|more-sweep|recommended)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|ul)>/gi, " ");
}

function catalogOfContests(html: string, pageUrl: string): boolean {
  let pagePath = "";
  try {
    pagePath = new URL(pageUrl).pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
  const scope = mainPrizeHtml(html);
  const entered = new Set<string>();
  const named = new Set<string>();
  for (const anchor of scope.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(anchor[1])?.[1];
    const label = anchor[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === pagePath) continue;
    if (/^enter now$/i.test(label)) entered.add(path);
    if (label.length > 18 && /\b(?:sweepstakes|giveaway|gift card)\b/i.test(label)) named.add(path);
  }
  return entered.size >= 3 || named.size >= 4;
}

function socialOnlyEntry(text: string, html: string): boolean {
  const social = /\b(?:comment to enter|comment why|leave a comment|tag \d+ friends|tag a friend|follow,\s*comment|screenshot your)\b/i.test(text);
  const widget = WIDGET.test(html) && /<(?:iframe|script)\b/i.test(html);
  const mailIn = /\bmail-?in\b/i.test(text) && /\b(?:address|p\.?\s*o\.?\s*box|postcard|3\s*x\s*5)\b/i.test(text);
  return social && !widget && !mailIn;
}

/** A past-winner post that names the person who won. "Winners will be selected" does not. */
function namesAWinner(text: string): boolean {
  const named = String.raw`[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+`;
  if (new RegExp(String.raw`\b(?:grand prize winner|GRAND PRIZE WINNER|first prize winner)\s+${named}\b`).test(text)) return true;
  return new RegExp(String.raw`\b(?:winner|WINNER)\s*:\s*${named}\b`).test(text);
}

/** A past-winners post. The name can sit in a later element or in the meta description. */
function pastWinnerPost(url: string, text: string, html: string): boolean {
  if (namesAWinner(text)) return true;
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  if (!/\/blogs\/past-winners(?:\/|$)/.test(path)) return false;
  return /class=["'][^"']*giveaway-subheading|\bwinner\s*:/i.test(html) || /\bgrand prize winner\b/i.test(html);
}

type HardNegativeReason = "other" | "shop" | "none";

/** A page that is an index, an article about someone else's giveaway, a bare store listing, or a rewards catalog. */
function hardNegativeReason(url: string, title: string, text: string, html = ""): HardNegativeReason {
  if (isPressCopy(url, title, text)) return "other";
  if (neverVerifiedPage(url, title, html)) return "other";
  if (catalogOfContests(html, url)) return "other";
  if (pastWinnerPost(url, text, html)) return "other";
  if ((text.match(/\bpromo codes?\b/gi) ?? []).length >= 4) return "other";
  if (distinctMainEndDates(html).length >= 2) return "other";
  if (/\bdaily\s+(?:prizes|giveaways|sweepstakes)\b/i.test(`${title} ${url}`)) return "other";
  if (newsArticleWithoutEntry(url, title, text, html)) return "other";
  if (announcementCopy(url, title, text, html)) return "other";
  if (isListicleLead(url, title, "")) return "other";
  if (manySponsors(text)) return "other";
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const articleVoice = /\b(?:according to|announced|written by|posted by)\b/i.test(`${title} ${text}`);
  const articlePath = /\/(?:news|blog|blogs|deals)\//i.test(path);
  const articleLayout = /\bmin read\b/i.test(text) && /\bpublished\b/i.test(text);
  const widget = WIDGET.test(html) && /<(?:iframe|script)\b/i.test(html);
  const mailIn = /\bmail-?in\b/i.test(text) && /\b(?:address|p\.?\s*o\.?\s*box|postcard|3\s*x\s*5)\b/i.test(text);
  const form = /<form\b/i.test(html) && /email/i.test(html);
  if (articleLayout) return "other";
  if (articlePath && articleVoice && !form && !widget && !mailIn) return "other";
  const freeEntry = hasNoPurchase(text) || mailIn;
  const entryWidget = ENTRY_WIDGET.test(html) && /<(?:iframe|script)\b/i.test(html);
  if (entryWidget && /\badd to cart\b/i.test(html) && !(hasNoPurchase(text) && statedEndIso(text) !== null)) return "shop";
  if (/\badd to cart\b/i.test(html) && !freeEntry && !widget) return "other";
  if (/\brewards?\b/i.test(`${title} ${path}`) && /\b(?:points|redeem)\b/i.test(text) && !freeEntry && statedEndIso(text) === null) return "other";
  if (socialOnlyEntry(text, html) && statedEndIso(text) === null) return "other";
  return "none";
}

export function hardNegativePage(url: string, title: string, text: string, html = ""): boolean {
  return hardNegativeReason(url, title, text, html) !== "none";
}

/** The rules page states a real contest, so a shop-widget landing can use it. */
export function rulesClearShopDisqualification(landing?: ContestMarkers, rules?: ContestMarkers): boolean {
  if (!landing?.shopWidgetOnly || !landing.disqualified) return false;
  if (!rules || (rules.disqualified && !rules.shopWidgetOnly)) return false;
  const terms = rules.noPurchaseNecessary || substantiveRulesCount(rules) >= 3;
  return terms && rules.ownEntry;
}

const ENTRY_CONTROL = /^(?:enter(?:\s+now|\s+to\s+win)?|submit\s+entry)$/i;

function controlLabels(html: string): string[] {
  const labels: string[] = [];
  for (const button of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)) {
    const text = button[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) labels.push(text);
  }
  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    if (!/type=["']submit["']/i.test(input[0])) continue;
    const value = /value=["']([^"']*)["']/i.exec(input[0])?.[1]?.replace(/\s+/g, " ").trim();
    if (value) labels.push(value);
  }
  return labels;
}

function entryControlLabel(text: string): boolean {
  return ENTRY_CONTROL.test(text.replace(/\s+/g, " ").trim());
}

/** A homepage that is one dated contest with its own entry control, not a directory. */
function homepageIsOneContest(html: string): boolean {
  if (distinctMainEndDates(html).length !== 1) return false;
  return realEntryForm(html) || controlLabels(html).some(entryControlLabel);
}

function realEntryForm(html: string): boolean {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  return forms.some((form) => {
    if (/type=["']search["']|role=["']search["']/i.test(form)) return false;
    const label = form.replace(/<[^>]+>/g, " ");
    const controls = controlLabels(form);
    const named = controls.some(entryControlLabel);
    if (/\bsubscribe\b/i.test(label) && !named) return false;
    if (/\b(?:add to cart|buy now)\b/i.test(label) && !named) return false;
    const control = /type=["']submit["']|<button\b/i.test(form);
    const entryWord = controls.some((text) => /\b(?:enter|submit|entry)\b/i.test(text));
    return control && (named || (/email/i.test(form) && entryWord));
  });
}

/** Enter, Enter now, Enter to win, or Submit entry on a button, even when no form tag is present. */
function entryButton(html: string): boolean {
  return controlLabels(html).some(entryControlLabel);
}

function sameHostRulesLink(html: string, pageUrl: string): boolean {
  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  for (const anchor of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href=["']([^"']+)["']/i.exec(anchor[1])?.[1];
    const label = anchor[2].replace(/<[^>]+>/g, " ");
    if (!href || !/rule/i.test(`${href} ${label}`)) continue;
    try {
      if (new URL(href, pageUrl).hostname.replace(/^www\./, "") === host) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** Article markup with no entry on this site. A subscribe box is not an entry. */
export function newsArticleWithoutEntry(url: string, title: string, text: string, html: string): boolean {
  const markup = /property=["']og:type["'][^>]*content=["']article["']/i.test(html) || /"@type"\s*:\s*"(?:NewsArticle|Article)"/i.test(html) || (/\b(?:written by|posted by)\b/i.test(`${title} ${text}`) && /\b(?:19|20)\d{2}\b/.test(text));
  if (!markup) return false;
  if (realEntryForm(html)) return false;
  if (ENTRY_WIDGET.test(html)) return false;
  if (/\bmail-?in\b/i.test(text) && /\b(?:address|p\.?\s*o\.?\s*box|postcard|3\s*x\s*5)\b/i.test(text)) return false;
  if (sameHostRulesLink(html, url)) return false;
  return true;
}

/** A non-wire announcement that points at someone else's entry. */
export function announcementCopy(url: string, title: string, text: string, html: string): boolean {
  if (isPressCopy(url, title, text)) return false;
  const voice = /\b(?:today announced|announced|launches)\b/i.test(`${title} ${text}`);
  const dateline = /[A-Z][A-Za-z .]+,\s+[A-Z]{2}\b/.test(text);
  if (!voice || !dateline) return false;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const link = new URL(anchor[1], url);
      if (link.hostname.replace(/^www\./, "") !== host && /giveaway|sweepstakes|contest|\/enter\b/i.test(link.pathname)) return true;
    } catch {
      /* skip */
    }
  }
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/g)) {
    try {
      const link = new URL(match[0]);
      if (link.hostname.replace(/^www\./, "") !== host && /giveaway|sweepstakes|contest|\/enter\b/i.test(link.pathname)) return true;
    } catch {
      /* skip */
    }
  }
  return false;
}

/** A number of contests, not a trip length, a number of days, a mileage amount, or a dollar amount. */
export function isCountOfContests(title: string): boolean {
  if (/\b\d+\s*-?\s*days?\s+of\b|\b\d+\s*-day\b|\bmiles?\b|\b1000000\b|\b1,000,000\b|\$\s?\d/i.test(title)) return false;
  const match = /(?:^|[^$\d,])(\d{1,3})\s+([A-Za-z]+)\s+(?:giveaways|sweepstakes|contests)\b/i.exec(title);
  if (!match) return false;
  return !/^(?:day|days|mile|miles)$/i.test(match[2]);
}

const BRAND_HOST = /(?:honda|viking|united|glock|ruger|beretta|taurus|savage|mossberg|springfield|carnival|yamaha|kawasaki|polaris)/i;

function isSponsorBrandHost(host: string): boolean {
  return BRAND_HOST.test(host.replace(/^www\./, ""));
}

/** A path for one contest or its rules, not an index and not "12-truck-giveaways". */
function hasSingleContestSlug(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((part) => /^\d+-.+-(?:giveaways|sweepstakes|contests)$/i.test(part))) return false;
  if (parts.length === 1 && /^(?:giveaways|sweepstakes|contests|sweeps)$/i.test(parts[0])) return false;
  return parts.some((part) => /(?:^|-)(?:sweepstakes|sweeps|giveaway|contest|rules|official-rules)(?:-|$)/i.test(part));
}

const AGGREGATOR_HOSTS = [
  "ultracontest.com",
  "sweepfeed.com",
  "sweepstakesfanatics.com",
  "sweepstake.com",
  "contestbee.com",
  "winthatwhip.com",
  "contestgirl.com",
  "online-sweepstakes.com",
  "sweepsadvantage.com",
  "thefreebieguy.com",
  "thepennyhoarder.com",
  "pennyhoarder.com",
  "winprizesonline.com",
  "contestscoop.com",
  "sweepskings.com",
  "offerscontest.com",
  "giveawaydrop.com",
  "moneypantry.com",
  "sweepsdb.com",
  "sweepstakesbible.com",
  "sweepstakesradar.com",
  "ilovegiveaways.com",
  "morningsweeps.com",
  "freeentry.org",
  "giveowl.com",
  "gungiveaways.net",
  "sweepstakestoday.com",
  "wowsweepstakes.com",
  "freebiemom.com",
  "giveawaylisting.com",
  "allcargiveaways.com",
];

function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Known sweepstakes aggregators. A contest-shaped slug on these hosts is still a list. */
export function isAggregatorHost(url: string): boolean {
  const host = hostOfUrl(url);
  return AGGREGATOR_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** A category or list path, such as /sweepstakes/category/cash. Not a single contest slug. */
export function isCategoryListUrl(url: string): boolean {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  const parts = path.split("/").filter(Boolean);
  if (parts.some((part) => /^(?:category|categories|tag|tags|topics)$/i.test(part))) return true;
  const last = parts.at(-1) ?? "";
  return /^(?:cash|money)[-_](?:sweepstakes|giveaways|contests|sweeps)$/i.test(last);
}

/** Open these before any title-only list skip. Aggregator and category URLs are not opened. */
function opensAsContest(url: string, title: string): boolean {
  if (isAggregatorHost(url) || isCategoryListUrl(url)) return false;
  if (/\bofficial rules\b/i.test(title)) return true;
  let path = "";
  let host = "";
  try {
    const parsed = new URL(url);
    path = parsed.pathname.toLowerCase();
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  if (isCountOfContests(title)) return false;
  if (path.endsWith(".pdf")) return true;
  if (hasSingleContestSlug(path)) return true;
  if (/win\d{4}/i.test(host)) return true;
  if (isSponsorBrandHost(host) && /\b(?:giveaways?|sweepstakes|sweeps|contests?|win)\b/i.test(title) && !pluralIndexTitle(title)) return true;
  return false;
}

/** A brand site page that is not one contest and not a rules file. The company name in the domain is not enough to open it. */
export function isBrandCatalogPage(url: string, title: string): boolean {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (!isSponsorBrandHost(host)) return false;
  return !opensAsContest(url, title);
}

/** Count titles, archives, and pagers. A list-like snippet does not decide this. A contest URL is not skipped for its title. */
export function isListicleLead(url: string, title: string, snippet = ""): boolean {
  void snippet;
  if (isCategoryListUrl(url)) return true;
  if (opensAsContest(url, title)) return false;
  if (isCountOfContests(title)) return true;
  if (pluralIndexTitle(title)) return true;
  if (/\blist of\b/i.test(title)) return true;
  if (/\barchives\b/i.test(title) || /\/archives?(?:\/|$)/i.test(url)) return true;
  if (/\bpage\s+\d+\s+of\s+\d+\b/i.test(title)) return true;
  return false;
}

/** "Vacation Giveaways | The Travel Mom" is an index. A duration, mileage, dollar amount, or rules title is one contest. */
function pluralIndexTitle(title: string): boolean {
  if (/\bofficial rules\b|\b\d+\s*-?\s*days?\b|\b\d+\s*-day\b|\bmiles?\b|\b1000000\b|\b1,000,000\b|\$\s?\d/i.test(title)) return false;
  const match = /^(.{1,80}?)\b(?:giveaways|sweepstakes)\s*(?:\||-|–|—)\s+\S/i.exec(title.trim());
  if (!match) return false;
  const before = match[1].trim();
  return before.length > 0 && /[A-Za-z]/.test(before);
}

const RETAIL_SPONSORS = [
  { name: "Walmart", hosts: ["walmart.com"] },
  { name: "Costco", hosts: ["costco.com"] },
  { name: "Amazon", hosts: ["amazon.com"] },
  { name: "Target", hosts: ["target.com"] },
];

/** A page that claims to be Walmart's, Costco's, Amazon's, or Target's own giveaway, on someone else's site. A gift-card prize from another sponsor is not this. */
export function lookalikeSponsorNote(title: string, text: string, url: string): string | null {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    host = "";
  }
  const sponsor = /\b(?:sponsored by|the sponsor is|sponsor:)\s+([^.]{2,120})/i.exec(`${title} ${text}`)?.[1] ?? "";
  for (const retailer of RETAIL_SPONSORS) {
    const own = retailer.hosts.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (own) continue;
    const sponsorClaim = new RegExp(`\\b${retailer.name}\\b`, "i").test(sponsor) && !/gift\s*cards?/i.test(sponsor);
    const titleClaim = new RegExp(`^(?:official\\s+)?${retailer.name}(?:'s)?\\s+(?:official\\s+)?(?:giveaway|sweepstakes|contest)\\b`, "i").test(title) && !/gift\s*cards?/i.test(title);
    if (sponsorClaim || titleClaim) return `Not on ${retailer.name}'s own site`;
  }
  return null;
}

export const SWEEPS_CASINO_NOTE = "Online casino, not a contest; banned in some states (e.g. NY, OK).";

const CASINO_HOST = /(?:^|\.)(?:stake\.us|chumba(?:casino)?\.com|mcluck\.com|pulsz\.com)$/i;

/** A sweeps-coin or social casino. The word "coins" alone is not enough. */
export function sweepsCasinoNote(title: string, text: string, url: string): string | null {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    host = "";
  }
  if (CASINO_HOST.test(host)) return SWEEPS_CASINO_NOTE;
  const blob = `${title} ${text}`;
  if (/\bsocial casinos?\b/i.test(blob)) return SWEEPS_CASINO_NOTE;
  if (/\bsweepstakes casinos?\b/i.test(blob)) return SWEEPS_CASINO_NOTE;
  if (/\bsweeps coins\b|\bsweeps cash\b/i.test(blob)) return SWEEPS_CASINO_NOTE;
  if (/\bgold coins\b/i.test(blob) && /\b(?:sweeps|casino)\b/i.test(blob)) return SWEEPS_CASINO_NOTE;
  if (/\b(?:stake\.us|chumba|mcluck|pulsz)\b/i.test(blob)) return SWEEPS_CASINO_NOTE;
  return null;
}

/** A vacation prize that requires a sales presentation or tour. */
export function timeshareNote(title: string, text: string): string | null {
  const blob = `${title} ${text}`;
  if (!/\b(?:free vacation|vacations?|travel prize|trips?|cruises?)\b/i.test(blob)) return null;
  if (/\battendance required\b|\bpresentation\b|\b90[\s-]?minutes?\b|\btimeshare\b|tour required to receive/i.test(blob)) {
    return "A presentation or tour is required to receive this prize.";
  }
  return null;
}

/** A product guide or contest roundup. Not a page that sells entries. */
export function isArticleOrGuide(url: string, title: string): boolean {
  const where = `${url} ${title}`;
  if (/\b(?:how-?\s*to|guide|upgrades?|roundup)\b/i.test(where)) return true;
  if (/\bwriting contests\b/i.test(title)) return true;
  if (/\bsweepstakes casinos\b/i.test(title)) return true;
  return /\bbest\b/i.test(title) && /\b(?:20\d{2}|upgrades?|contests?|sweepstakes|casinos?)\b/i.test(title);
}

function distinctMainEndDates(html: string): string[] {
  return [...new Set(contestEndDates(contestCopy(mainPrizeHtml(html))).map((hit) => hit.iso))];
}

/** The official entry URL named by an announcement, if it is on another host. */
export function announcedEntryUrl(html: string, pageUrl: string): string | null {
  let host = "";
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const link = new URL(anchor[1], pageUrl);
      const label = anchor[2].replace(/<[^>]+>/g, " ");
      if (link.protocol !== "https:") continue;
      if (link.hostname.replace(/^www\./, "") === host) continue;
      if (/giveaway|sweepstakes|contest|\/enter\b/i.test(`${link.pathname} ${label}`)) return link.toString();
    } catch {
      /* skip */
    }
  }
  return null;
}

/** Terms that belong to a giveaway. News copy of a winner does not collect these. */
export function markersFromText(text: string, html = "", formFound = false, hubOnly = false, pageUrl = "", title = ""): ContestMarkers {
  void formFound;
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  const entryForm = forms.find((form) => /email/i.test(form) && !/type=["']search["']|role=["']search["']/i.test(form));
  const cartForm = entryForm ? /\b(?:add to cart|buy now)\b/i.test(entryForm) : false;
  const mailIn = /\bmail-?in\b/i.test(text) && /\b(?:address|p\.?\s*o\.?\s*box|postcard|3\s*x\s*5)\b/i.test(text);
    const widget = ENTRY_WIDGET.test(html) && /<(?:iframe|script)\b/i.test(html);
  const social = socialOnlyEntry(text, html);
  const negative = hardNegativeReason(pageUrl || "https://example.com/", title, text, html);
  const entry = realEntryForm(html) || mailIn || widget || entryButton(html) || sameSiteEntryCta(html, pageUrl);
  return {
    noPurchaseNecessary: hasNoPurchase(text),
    eligibility: /\b(?:must be \d|years of age|years or older|legal residents|eligib(?:le|ility)|residents of)\b/i.test(text),
    entryPeriod: (/\b(?:entry period|begins|starts|starting)\b/i.test(text) && /\b(?:ends|ending|deadline|closes|through|until)\b/i.test(text)) || /\b(?:ends|ended|ending|deadline|closes)\b/i.test(text),
    winnerSelection: /\b(?:random drawing|drawing method|winners? will be (?:selected|drawn|chosen|notified)|potential winners?)\b/i.test(text),
    odds: /\bodds of (?:winning|being selected|receiving)\b/i.test(text),
    prizeValue: /\b(?:approximate retail value|\barv\b|retail value|prize value)\b/i.test(text),
    sponsor: /\b(?:sponsored by|the sponsor is|sponsor:)\s+(?!the\b)[A-Za-z0-9]/i.test(text),
    specificPrize: specificPrizeNamed(text),
    specificDates: statedEndIso(text) !== null,
    ownEntry: !social && !cartForm && (widget || (!hubOnly && entry)),
    disqualified: negative !== "none",
    shopWidgetOnly: negative === "shop",
  };
}

export function mergeMarkers(left?: ContestMarkers, right?: ContestMarkers): ContestMarkers {
  const a = left ?? EMPTY_MARKERS;
  const b = right ?? EMPTY_MARKERS;
  return {
    noPurchaseNecessary: a.noPurchaseNecessary || b.noPurchaseNecessary,
    eligibility: a.eligibility || b.eligibility,
    entryPeriod: a.entryPeriod || b.entryPeriod,
    winnerSelection: a.winnerSelection || b.winnerSelection,
    odds: a.odds || b.odds,
    prizeValue: a.prizeValue || b.prizeValue,
    sponsor: a.sponsor || b.sponsor,
    specificPrize: a.specificPrize || b.specificPrize,
    specificDates: a.specificDates || b.specificDates,
    ownEntry: a.ownEntry || b.ownEntry,
    disqualified: a.disqualified || b.disqualified,
    shopWidgetOnly: (a.shopWidgetOnly || b.shopWidgetOnly) && !(a.disqualified && !a.shopWidgetOnly) && !(b.disqualified && !b.shopWidgetOnly),
  };
}

export function substantiveRulesCount(markers: ContestMarkers): number {
  return [markers.eligibility, markers.entryPeriod, markers.winnerSelection, markers.odds, markers.prizeValue, markers.sponsor].filter(Boolean).length;
}

/** Sports-team rules whose prize is not the searched brand. Kept in the list, not Verified. */
export function sportsSponsorshipPenalty(query: string, title: string, text: string): boolean {
  if (!/\b(?:ducks|jets|yankees|lakers|nhl|nfl|nba|mlb)\b/i.test(title)) return false;
  const terms = queryConceptGroups(query).flat();
  if (terms.length === 0) return false;
  const prize = (/\b(?:enter to win|win|won)\s+(?:a|an|the)\s+[^.]{3,80}/i.exec(text)?.[0] ?? "").toLowerCase();
  return !terms.some((term) => prize.includes(term));
}

/** A trade or professional design contest, not a consumer sweepstakes. A licensed-dealer pickup on a consumer page is not this. */
export function tradeOnlyContest(url: string, title: string, text: string): boolean {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = "";
  }
  if (/\/trade(?:\/|$)/.test(path)) return true;
  const blob = `${title} ${text}`;
  if (/\b(?:design professionals|trade members|for the trade|to the trade|trade only)\b/i.test(blob)) return true;
  return /\b(?:design|portfolio)\s+contest\b/i.test(blob) && /\b(?:judged|jury|professionals only|submit(?:ted)? (?:a |your )?(?:design|portfolio))\b/i.test(blob);
}

/** Own giveaway terms plus an entry method. A past end date, a how-to, or an index is not Verified. */
export function qualifiesAsGiveaway(contest: Contest, ended: boolean, query = ""): boolean {
  if (ended) return false;
  const markers = contest.contestMarkers ?? EMPTY_MARKERS;
  if (markers.disqualified) return false;
  const described = `${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`;
  if (sportsSponsorshipPenalty(query, contest.title, described)) return false;
  const terms = markers.noPurchaseNecessary || substantiveRulesCount(markers) >= 3;
  if (!(terms && markers.ownEntry)) return false;
  if (/\bplay for cash\b|\bwin cash playing\b/i.test(described) && /\bcash\b/i.test(query) && !/\bcash (?:prize|giveaway|sweepstakes)\b/i.test(`${contest.title} ${described}`)) return false;
  return true;
}

/** A store, review, or forum page that never mentions a contest. */
export function offTopicPage(url: string, title: string, text: string): boolean {
  const blob = `${url} ${title} ${text}`;
  if (/\b(?:giveaway|sweepstakes|contest|enter to win)\b/i.test(blob)) return false;
  if (/\/(?:p|products?|shop)\//i.test(url) && (/\badd to cart\b/i.test(text) || /\$\s?\d/.test(text))) return true;
  if (/\breview\b/i.test(title) || /\/reviews?\//i.test(url)) return true;
  if (/\/forum|\/thread|\/comments\//i.test(url)) return true;
  return false;
}

/** How many searched ideas show up in the title or prize. Zero when the query names no object. */
export function prizeRelevance(query: string, title: string, prize: string): number {
  const groups = queryConceptGroups(query);
  if (groups.length === 0) return 0;
  const hay = prizeHay(title, prize);
  return groups.filter((group) => group.some((term) => hay.includes(term))).length;
}
