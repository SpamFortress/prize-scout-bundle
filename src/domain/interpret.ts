import { statedEndIso } from "./dates";
import { contestCopy, markersFromText, substantiveRulesCount } from "./result-quality";
import { normalizeVerifiedToolResult, type NormalizeResult } from "./normalize";
import { extractObservedGallery, extractPrizeDescription } from "./page-observations";
import { extractRulesFacts } from "./rules-facts";
import { entryClockFromText, rulesTimeZone } from "./entry-clock";
import { winnerNoticeDays } from "./entry-log";
import { scanRulesChecklist, scanScamWarning } from "./rules-checklist";
import { hasFreeMethodText, isPurchaseEntryText } from "./search-yield";
import type { EntryCost, Restriction, Source } from "./types";

const HUB_HOSTS = new Set([
  "giveawaylisting.com",
  "infinitesweeps.com",
  "sweepsadvantage.com",
  "contestgirl.com",
  "theprizefinder.com",
  "sweetiessweeps.com",
  "sweepstakesfanatics.com",
  "thefreebieguy.com",
  "sweepstakesradar.com",
]);

function decode(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decode(match[1]);
  }
  return null;
}

export function sourceFromUrl(url: string): Source {
  const host = hostname(url);
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com")) return "x";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com") return "facebook";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  return "web";
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function explicitPrize(text: string): { amount: number; currency: string; explicit: true } | null {
  const patterns: Array<{ currency: string; re: RegExp }> = [
    { currency: "USD", re: /(?:\bARV\b|approximate retail value|valued at|prize value|retail value of)\s*(?:of\s*)?\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/gi },
    { currency: "USD", re: /\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)\s*(?:prize|ARV|cash prize)/gi },
    { currency: "GBP", re: /(?:\bARV\b|approximate retail value|valued at|prize value)\s*(?:of\s*)?£\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/gi },
    { currency: "EUR", re: /(?:\bARV\b|approximate retail value|valued at|prize value)\s*(?:of\s*)?€\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/gi },
  ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.re)) {
      found.add(`${pattern.currency}:${match[1].replace(/,/g, "")}`);
    }
  }
  if (found.size !== 1) return null;
  const [currency, amountText] = [...found][0].split(":");
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount, currency, explicit: true };
}

function findForm(html: string): boolean {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  return forms.some((form) => {
    if (/type=["']password["']/i.test(form) || /type=["']search["']/i.test(form) || /role=["']search["']/i.test(form)) return false;
    if (/\bname=["']s["']/i.test(form)) return false;
    const field = /<(input|textarea)\b/i.test(form);
    const submit = /type=["']submit["']/i.test(form) || /<button\b/i.test(form);
    return field && submit;
  });
}

function genericSiteRulesPath(pathname: string): boolean {
  return /^\/(?:legal|privacy|terms-of-use|terms)\/?$/i.test(pathname);
}

function rulesLabel(label: string): "official" | "rules" | "terms" | null {
  const text = label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (/official\s+rules/i.test(text)) return "official";
  if (/^rules$/i.test(text)) return "rules";
  if (/^terms(?:\s*(?:&|and)\s*conditions)?$/i.test(text)) return "terms";
  return null;
}

/** The official-rules, rules, or terms link, including a same-site page, a PDF, or a short URL. */
function rulesLink(html: string, pageUrl: string): string | null {
  const ranked: Array<{ url: string; rank: number }> = [];
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
    const labelText = anchor[2].replace(/<[^>]+>/g, " ");
    const label = rulesLabel(anchor[2]);
    const path = `${url.pathname}${url.search}`.toLowerCase();
    if (/terms-of-use|privacy(?:-policy)?(?:\/|$|\.)/.test(path)) continue;
    if (genericSiteRulesPath(url.pathname)) {
      const at = anchor.index ?? 0;
      const around = html.slice(Math.max(0, at - 120), at + anchor[0].length + 120);
      if (!/official\s+rules|giveaway|sweepstakes/i.test(`${labelText} ${around}`)) continue;
    }
    const pdf = path.includes(".pdf") && /rule|sweep|giveaway|contest|official/.test(path);
    const hrefRules = /(?:^|\/)(?:[\w-]*official[-_]?rules|rules)(?:[./]|$|\?)|officialrules|\/pages\/(?:sweeprules|[\w-]+-rules)(?:[./]|$|\?)|\/sweeprules(?:[./]|$|\?)/i.test(path);
    let pageHost = "";
    try {
      pageHost = new URL(pageUrl).hostname.replace(/^www\./, "");
    } catch {
      pageHost = "";
    }
    const sameSite = url.hostname.replace(/^www\./, "") === pageHost;
    const labeledOwn = label === "official" || label === "terms";
    if (!sameSite && !labeledOwn) continue;
    if (!labeledOwn && !label && !pdf && !hrefRules) continue;
    const rank = label === "official" ? 5 : label === "rules" ? 4 : pdf ? 3 : hrefRules ? 2 : 1;
    ranked.push({ url: url.toString(), rank });
  }
  ranked.sort((left, right) => right.rank - left.rank);
  return ranked[0]?.url ?? null;
}

function sentence(text: string, pattern: RegExp): string | null {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  pattern.lastIndex = 0;
  if (!match || match.index === undefined) return null;
  const start = Math.max(text.lastIndexOf(".", match.index) + 1, text.lastIndexOf("!", match.index) + 1);
  const endDot = text.indexOf(".", match.index);
  const end = endDot === -1 ? Math.min(text.length, match.index + 180) : endDot + 1;
  const line = text.slice(start, end).replace(/\s+/g, " ").trim();
  return line.length > 0 && line.length <= 200 ? line : null;
}

export function observeHtml(html: string, pageUrl: string, now: Date): NormalizeResult {
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return { ok: false, error: "That address is not a valid URL." };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "Official pages must be https." };

  const text = decode(contestCopy(html));
  const title = meta(html, "og:title") ?? decode((html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ""));
  if (!title) return { ok: false, error: "The page had no title, so no contest was recorded." };

  const source = sourceFromUrl(pageUrl);
  const host = hostname(pageUrl);
  const formFound = source === "web" && findForm(html);
  let rulesUrl = rulesLink(html, pageUrl);
  const externalHosts = new Set<string>();
  for (const match of html.matchAll(/href=["']https?:\/\/([^/"']+)/gi)) {
    const hostName = match[1].toLowerCase().replace(/^www\./, "");
    if (hostName && hostName !== host) externalHosts.add(hostName);
  }
  const purchaseEntry = isPurchaseEntryText(`${title} ${text}`);
  const hubByHost = HUB_HOSTS.has(host);
  const hubByLinks = !formFound && externalHosts.size >= 8;
  const hubByTitle = /\b(giveaway list|sweepstakes directory|list of giveaways)\b/i.test(title) && !formFound;
  const hubOnly = !purchaseEntry && (source !== "web" || hubByHost || hubByLinks || hubByTitle);
  const contestMarkers = markersFromText(text, html, formFound, hubOnly, pageUrl, title);
  if (!rulesUrl && (contestMarkers.noPurchaseNecessary || substantiveRulesCount(contestMarkers) >= 3)) {
    rulesUrl = pageUrl;
  }

  const restrictions: Restriction[] = [];
  const redFlags: string[] = [];
  const auto = sentence(text, /automated entries?(?: \w+){0,4} (?:not allowed|prohibited|void|disqualified)/i);
  if (auto || /automated entries are not allowed/i.test(text)) {
    restrictions.push("no_automation");
    if (auto) redFlags.push(auto);
  }
  const free = /no purchase necessary/i.test(text);
  const paid = !free && /purchase (?:is )?required|purchase necessary/i.test(text);
  if (paid) restrictions.push("purchase_required");
  if (/one entry per person/i.test(text)) restrictions.push("one_entry_per_person");
  if (/mail-?in entry/i.test(text) && !formFound) restrictions.push("mail_in_only");
  if (/skill contest|essay contest/i.test(text)) restrictions.push("skill_required");

  const countries: string[] = [];
  if (/legal residents of the (?:50 )?(?:united states|u\.s\.a\.|u\.s\.)|u\.s\. residents only|united states only/i.test(text)) {
    countries.push("US");
  } else if (/\bopen worldwide\b|\bworldwide\b/i.test(text)) {
    countries.push("*");
  }
  const ageMatch = /(?:must be|at least)\s+(\d{2})\s+years/i.exec(text);
  const endMatch = statedEndIso(text, now);
  let gallery: ReturnType<typeof extractObservedGallery> = { images: [], kind: null };
  let prize: ReturnType<typeof extractPrizeDescription> = { text: null, truncated: false, kind: "prize", limit: 12_000 };
  try {
    gallery = extractObservedGallery(html, pageUrl);
    prize = extractPrizeDescription(html);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
  }
  const widget = /gleam\.io|viralsweep|woobox|shortstack|kingsumo|rafflecopter|instagram\.com\/(?:p|reel)\//i.test(html);
  const entryLink = /href\s*=\s*["'][^"']*(?:\/enter\b|giveaway|sweepstakes|sweepstake|\/contest|official[-_ ]rules)/i.test(html);
  const normalized = normalizeVerifiedToolResult(
    {
      tool: "evidence.fetch",
      verified: true,
      evidenceUrl: pageUrl,
      payload: {
        title,
        shortDescription: meta(html, "description") ?? meta(html, "og:description") ?? "The fetched page did not include a short description.",
        pageObservedDetailedDescription: prize.text,
        pageObservedDescriptionKind: "prize",
        pageObservedDescriptionTruncated: prize.truncated,
        pageObservedGallery: gallery.images,
        pageObservedGalleryKind: gallery.kind,
        officialUrl: pageUrl,
        rulesUrl,
        imageUrl: gallery.images[0]?.url ?? null,
        sponsor: meta(html, "og:site_name"),
        prizeValue: explicitPrize(text),
        endDate: endMatch,
        entryCost: (free ? "free" : paid ? "paid" : "unknown") as EntryCost,
        entryMethod: formFound && !hubOnly ? "An entry form was observed on this page." : "Entry method was not stated on the fetched page.",
        limits: {
          countries,
          states: [],
          minAge: ageMatch ? Number(ageMatch[1]) : null,
          maxAge: null,
        },
        restrictions,
        redFlags,
        publishedAt: null,
        source,
        formFound,
        rulesLinkFound: Boolean(rulesUrl),
        hubOnly,
      },
    },
    now,
  );
  if (!normalized.ok) return normalized;
  const facts = extractRulesFacts(text);
  let winnersListUrl: string | null = null;
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    if (!/winner/i.test(match[1])) continue;
    try {
      const url = new URL(match[1], pageUrl);
      if (url.protocol === "https:") {
        winnersListUrl = url.toString();
        break;
      }
    } catch {
      /* Skip a bad href. */
    }
  }
  const limits = {
    ...normalized.contest.limits,
    states: normalized.contest.limits.states.length > 0 ? normalized.contest.limits.states : facts.includedStates,
    excludedStates: facts.excludedStates,
    minAge: normalized.contest.limits.minAge ?? facts.minAge,
  };
  return {
    ...normalized,
    contest: {
      ...normalized.contest,
      limits,
      rulesFacts: facts,
      contestMarkers,
      rulesChecklist: scanRulesChecklist(text),
      scamPhrases: scanScamWarning(text),
      pageObservedWidget: widget,
      pageObservedPurchaseEntry: purchaseEntry,
      pageObservedFreeMethod: hasFreeMethodText(text),
      pageObservedEntryLink: entryLink,
      winnersListUrl,
      entryClock: entryClockFromText(text),
      rulesTimeZone: rulesTimeZone(text),
      winnerNotice: winnerNoticeDays(text),
      instantWin: /\binstant\s+wins?\b/i.test(text),
      rulesReadOn: null,
    },
  };
}
