import { WIDGET_RULES_NOTE } from "@/config/results-view";
import { observeHtml } from "@/domain/interpret";
import { hasEntryWidget, lookalikeSponsorNote, substantiveRulesCount, sweepsCasinoNote } from "@/domain/result-quality";
import { chooseOnPageRules, rulesContentIsReal } from "@/domain/rules-facts";
import { enterDestinationNote, sponsorIdentityNote } from "@/domain/verification-checks";
import { contestEndDates, daysUntil, parseDueDate, statedEndIso, statedEndPhrase } from "@/domain/dates";
import type { Contest } from "@/domain/types";
import { stripTrackingParams } from "@/domain/verification-checks";
import { saveAddonCheck, type AddonCheckRecord } from "./addon-pairing";

export interface RenderedCheck {
  url: string;
  title: string;
  checkedByYou: boolean;
  listingGroup: "verified" | "check" | "store";
  rulesNote: string;
  endIso: string | null;
  openRulesUrl: string | null;
  limits: string[];
  lastChecked: string;
  /** Set when the tab is terms, privacy, search, or a promotions index. Hidden from lists. */
  notContest?: boolean;
  /** Facts read from an embedded widget frame on the same click. */
  widgetFacts?: string | null;
  /** Add-on build that captured this check. Empty when the popup did not send one. */
  addonVersion?: string;
}

export function addonVersionIsOld(version: string | undefined): boolean {
  if (!version) return false;
  const [major, minor] = version.split(".").map((part) => Number(part) || 0);
  return major < 0 || (major === 0 && minor < 2);
}

export function withAddonVersion<T extends { rulesNote: string }>(result: T, version: string | undefined): T & { addonVersion: string } {
  const addonVersion = version ?? "";
  const rulesNote = addonVersionIsOld(version) && !result.rulesNote.includes("Old add-on version")
    ? `${result.rulesNote} Old add-on version: reload it on chrome://extensions`
    : result.rulesNote;
  return { ...result, rulesNote, addonVersion };
}

export function notContestPage(url: string, title = ""): boolean {
  let host = "";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    path = parsed.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return false;
  }
  if ((host === "sweepwidget.com" || host.endsWith(".sweepwidget.com")) && /terms-of-use|privacy/.test(path)) return true;
  if (path === "/terms-of-use" || path.endsWith("/terms-of-use")) return true;
  if (/search\.cfm$/i.test(path) && /(?:\?|&)kword=/i.test(url)) return true;
  if (host === "powerequipment.honda.com" && path === "/promotions") return true;
  if ((host === "dreamgiveaway.com" || host.endsWith(".dreamgiveaway.com")) && path === "/rules") return true;
  if (/\bprivacy policy\b/i.test(title) && host.includes("sweepwidget")) return true;
  return false;
}

function plainWithoutForeignRules(plain: string, pageTitle: string): string {
  const page = pageTitle.toLowerCase();
  return plain.replace(/[^.!?\n]{0,160}\bofficial rules\b[^.!?\n]{0,240}[.!?]?/gi, (sentence) => {
    const heading = /([^.!?\n]{0,80})\s+official rules\b/i.exec(sentence)?.[1] ?? "";
    const tokens = heading.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !["official", "rules", "sweepstakes", "giveaway", "abbreviated"].includes(token));
    if (tokens.length === 0) return sentence;
    return tokens.some((token) => page.includes(token)) ? sentence : " ";
  });
}

function visibleCopy(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** The entry page without a rules snapshot appended on an earlier pass. */
function entryHtmlWithoutFold(html: string): string {
  const at = html.search(/<section\b[^>]*\bdata-linked-rules=/i);
  return at === -1 ? html : html.slice(0, at);
}

/** A short Official Rules viewer. Its own row stays hidden and does not take the entry date. */
function standaloneRulesShell(html: string, pageUrl: string): boolean {
  if (!isRulesUrl(pageUrl)) return false;
  const visible = visibleCopy(html);
  const pdfish = rulesLinkIsPdf(pageUrl) || /\.pdf\b|application\/pdf/i.test(`${pageUrl} ${visible}`);
  return visible.length > 0 && visible.length <= 2200 && pdfish;
}

/** A folded PDF viewer. The real OfficialRules wrapper is about 1,600 visible characters and contains nested sections. */
function rulesSnapshotIsShell(html: string): boolean {
  const marks = [...html.matchAll(/<section\b[^>]*\bdata-linked-rules="([^"]*)"[^>]*>/gi)];
  if (marks.length === 0) return false;
  return marks.every((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end = index + 1 < marks.length ? (marks[index + 1].index ?? html.length) : html.length;
    const visible = visibleCopy(html.slice(start, end));
    const pdfish = rulesLinkIsPdf(mark[1] ?? "") || /\.pdf\b|application\/pdf/i.test(`${mark[1] ?? ""} ${visible}`);
    return visible.length > 0 && visible.length <= 2200 && pdfish;
  });
}

function severalEnds(html: string | undefined, now: Date): boolean {
  if (!html) return false;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const ends = new Set(contestEndDates(text, now).filter((hit) => hit.kind !== "interim").map((hit) => hit.iso));
  return ends.size > 1;
}

function widgetPanelIsDatesOnly(html: string): boolean {
  const frames = [...html.matchAll(/<section\b[^>]*\bdata-widget-frame=(?:"[^"]*"|'[^']*')[^>]*>([\s\S]*?)<\/section>/gi)];
  if (frames.length === 0) return false;
  const panel = frames.map((match) => match[1].replace(/<[^>]+>/g, " ")).join(" ");
  const dated = /\bend date\b/i.test(panel) || /\bstart date\b/i.test(panel);
  if (!dated) return false;
  const sponsor = /\b(?:sponsored by|the sponsor is|sponsor:)\b/i.test(panel);
  const eligibility = /\b(?:eligib|open to|legal residents|void in|years of age|years or older)\b/i.test(panel);
  return !sponsor && !eligibility;
}

function freeMethodStated(text: string): boolean {
  return /no purchase[\s\S]{0,80}necessary/i.test(text) || /free entry method/i.test(text) || /free method|mail-?in|alternate method/i.test(text);
}

function purchaseEntriesInText(text: string): boolean {
  return /\bpurchase entries\b/i.test(text)
    || /\b(?:get\s+)?\d+\s*x\s+entries\b[^.]{0,100}\bpurchas/i.test(text)
    || /\bpurchas\w*\b[^.]{0,100}\b(?:get\s+)?\d+\s*x\s+entries\b/i.test(text);
}

function hasEmbeddedFrame(html: string): boolean {
  return new RegExp("<" + "iframe\\b", "i").test(html);
}

function rulesAlreadyFolded(html: string): boolean {
  return /data-linked-rules=|data-uploaded-rules=|data-pasted-rules=/i.test(html);
}

function samePage(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const host = (value: URL) => value.hostname.replace(/^www\./, "");
    return host(a) === host(b) && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
}

function ended(contest: Contest, now: Date): boolean {
  if (!contest.due.proven) return false;
  const days = daysUntil(parseDueDate(contest.due.isoDate), now);
  return days !== null && days < 0;
}

function rulesLinkIsPdf(url: string): boolean {
  return /\.pdf(?:$|\?)|officialrules|fs=true/i.test(url);
}

/** One note for a missing end date or missing rules. */
export function missingFactsNote(input: {
  endIso: string | null;
  hasEntry: boolean;
  rulesFound: boolean;
  rulesUrl: string | null;
  pageUrl?: string;
  folded?: boolean;
  shell?: boolean;
  previewText?: string;
}): string {
  if (input.shell) return "Rules page is a viewer; open the PDF rules to confirm the mail method.";
  const offPage = input.rulesUrl && (!input.pageUrl || !samePage(input.rulesUrl, input.pageUrl)) ? input.rulesUrl : null;
  if (!input.endIso && !offPage && !input.folded && !input.rulesFound && input.hasEntry) {
    return "Official rules not found on this page. End date not stated.";
  }
  const parts: string[] = [];
  if (!input.endIso) parts.push("End date needs checking");
  if (!input.rulesFound && !offPage && !input.folded) parts.push("Official rules not found");
  if (!input.hasEntry) parts.push("Entry form not found");
  let note = parts.length > 0 ? `${parts.join(". ")}.` : "This page still needs checking.";
  if (offPage && !input.folded) {
    note += rulesLinkIsPdf(offPage)
      ? " Open the Official Rules (PDF) and click Check this tab."
      : " Open the rules page and click Check this tab.";
  }
  const preview = acceptableHint(input.previewText ?? "");
  if (!input.endIso && preview) note += ` Search preview says ${preview}.`;
  return note;
}

function acceptableHint(text: string): string | null {
  const preview = statedEndPhrase(text);
  if (!preview) return null;
  const at = text.toLowerCase().indexOf(preview.toLowerCase());
  const around = text.slice(Math.max(0, at - 100), at + preview.length + 20);
  if (/\b(?:fast\s*entry|early[-\s]?bird|bonus|interim|drawing)\b/i.test(around)) return null;
  return preview;
}

function excludedInIdaho(contest: Contest): boolean {
  const facts = contest.rulesFacts;
  const excluded = facts?.excludedStates ?? contest.limits.excludedStates ?? [];
  const included = facts?.includedStates ?? [];
  if (excluded.includes("ID")) return true;
  return included.length > 0 && !included.includes("ID");
}

/** Classify one rendered tab. Does not fetch the page or its rules URL. */
export function classifyRenderedPage(html: string, pageUrl: string, now: Date, limits: string[] = []): RenderedCheck {
  const base = { url: pageUrl, title: "", endIso: null as string | null, openRulesUrl: null as string | null, limits, lastChecked: now.toISOString().slice(0, 10) };
  const observed = observeHtml(html, pageUrl, now);
  if (!observed.ok) {
    return { ...base, checkedByYou: false, listingGroup: "check", rulesNote: observed.error };
  }
  let contest = observed.contest;
  const title = contest.title;
  if (notContestPage(pageUrl, title)) {
    return { ...base, title, endIso: null, checkedByYou: false, listingGroup: "check", rulesNote: "Not a contest page", notContest: true };
  }
  let sourceHtml = html;
  const firstPlain = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const docTitle = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || title;
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, " ") ?? "";
  const rulesBody = docTitle ? firstPlain.replace(docTitle, " ") : firstPlain;
  const rulesChoice = chooseOnPageRules(rulesBody, `${docTitle} ${h1}`, now);
  const earlyPlain = sourceHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const earlyPaid = (contest.pageObservedPurchaseEntry || contest.entryCost === "paid" || purchaseEntriesInText(earlyPlain))
    && !(/\bcontribution\b/i.test(earlyPlain) && /\bmethod\s*#?\s*3\b[\s\S]{0,400}\bmail\b/i.test(earlyPlain))
    && !freeMethodStated(earlyPlain)
    && !(/\bdonations?\b/i.test(earlyPlain) && (/tax-deductible|\$\s?\d|no purchase[\s\S]{0,80}necessary/i.test(earlyPlain)) && freeMethodStated(earlyPlain));
  if (earlyPaid) {
    const paidEnd = contest.due.proven ? contest.due.isoDate : null;
    return { ...base, title, endIso: paidEnd, checkedByYou: false, listingGroup: "check", rulesNote: "Paid entries are not checked by the add-on." };
  }
  if (rulesChoice.ambiguous) {
    return { ...base, title, endIso: null, checkedByYou: true, listingGroup: "check", rulesNote: "Two rule sets on this page; end date needs checking" };
  }
  let usedChosenRules = false;
  if (rulesChoice.text) {
    const forms = html.match(/<form\b[\s\S]*?<\/form>/gi)?.join("") ?? "";
    sourceHtml = `<!doctype html><html><head><title>${title}</title></head><body><p>${rulesChoice.text}</p>${forms}</body></html>`;
    const again = observeHtml(sourceHtml, pageUrl, now);
    if (again.ok) contest = again.contest;
    usedChosenRules = true;
  }
  const chosenTitle = usedChosenRules ? rulesChoice.title : null;
  const say = (note: string) => (chosenTitle ? `Using the ${chosenTitle} rules. ${note}` : note);
  let endIso = contest.due.proven ? contest.due.isoDate : null;
  if (!endIso && rulesChoice.text) endIso = statedEndIso(rulesChoice.text, now);
  if (!endIso && !standaloneRulesShell(html, pageUrl)) endIso = statedEndIso(visibleCopy(html), now);
  const described = `${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`;
  const facts = contest.rulesFacts;
  const markers = contest.contestMarkers;

  const plain = sourceHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const mailInstead = /\bcontribution\b/i.test(plain) && /\bmethod\s*#?\s*3\b[\s\S]{0,400}\bmail\b/i.test(plain);
  const freeStated = freeMethodStated(plain);
  const paidBoost = purchaseEntriesInText(plain);
  const donationDrawing = /\bdonations?\b/i.test(plain) && (/tax-deductible|\$\s?\d|no purchase[\s\S]{0,80}necessary/i.test(plain)) && freeStated;
  const paidEntry = contest.pageObservedPurchaseEntry || contest.entryCost === "paid" || paidBoost;
  if (paidEntry && !mailInstead && !freeStated && !donationDrawing) {
    return { ...base, title, endIso, checkedByYou: false, listingGroup: "check", rulesNote: say("Paid entries are not checked by the add-on.") };
  }
  if (facts?.verificationBlock === "captcha") {
    return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say("This page asked for a captcha. Prize Scout did not bypass it.") };
  }
  if (ended(contest, now)) return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say("This contest has ended.") };
  if (excludedInIdaho(contest)) return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say("Not open in Idaho") };

  if (donationDrawing) {
    return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say("Donation drawing, free entry method in rules") };
  }
  const folded = rulesAlreadyFolded(html);
  const rulesOnThisPage = usedChosenRules || folded;
  const briefWidget = widgetPanelIsDatesOnly(html);
  let rulesUrl = rulesOnThisPage || briefWidget ? null : contest.rulesUrl;
  if (rulesUrl && samePage(rulesUrl, pageUrl)) rulesUrl = null;
  const shell = folded && rulesSnapshotIsShell(html);
  if (shell) {
    return {
      ...base,
      title,
      endIso,
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: say(missingFactsNote({ endIso, hasEntry: true, rulesFound: false, rulesUrl: null, pageUrl, folded: true, shell: true })),
      openRulesUrl: null,
    };
  }
  if (briefWidget && endIso) {
    return {
      ...base,
      title,
      endIso,
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: say("Rules are brief: dates only. Sponsor and eligibility not stated."),
      openRulesUrl: null,
      widgetFacts: "End date and prize names were read from the embedded widget.",
    };
  }
  const ownRulesText = plainWithoutForeignRules(plain, `${docTitle} ${h1} ${title}`);
  const noRules = !rulesUrl && !rulesOnThisPage && !/\bofficial rules\b|\bno purchase necessary\b|\bvoid in\b/i.test(ownRulesText);
  if (noRules && !endIso) {
    return {
      ...base,
      title,
      endIso: null,
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: say(missingFactsNote({ endIso: null, hasEntry: true, rulesFound: false, rulesUrl: null, pageUrl, folded: false })),
    };
  }
  if (rulesUrl && !samePage(rulesUrl, pageUrl) && !folded) {
    const describedForPreview = `${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`;
    return {
      ...base,
      title,
      endIso,
      checkedByYou: false,
      listingGroup: "check",
      rulesNote: say(endIso
        ? "Open the rules page and click Prize Scout again."
        : missingFactsNote({ endIso, hasEntry: Boolean(contest.contestMarkers?.ownEntry), rulesFound: false, rulesUrl, pageUrl, folded, previewText: describedForPreview })),
      openRulesUrl: rulesUrl,
    };
  }

  const casino = sweepsCasinoNote(title, `${described} ${html.replace(/<[^>]+>/g, " ")}`, pageUrl);
  if (casino) return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(casino) };
  const scam = contest.scamPhrases ?? [];
  if (scam.length > 0) return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(`Scam warning: ${scam[0]}`) };
  const lookalike = lookalikeSponsorNote(title, described, pageUrl);
  if (lookalike) return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(lookalike) };
  if (mailInstead || (paidEntry && freeStated)) {
    const formMissing = !/<form\b/i.test(sourceHtml) && hasEmbeddedFrame(html);
    const note = mailInstead
      ? "Free entry is by mail (Method #3). Prize Scout does not fill the contribution form."
      : paidBoost
        ? formMissing
          ? "Entry form not found (it may be inside a widget; reload the add-on and check again). Purchase entries are paid. A free method is in the rules."
          : "Purchase entries are paid. A free method is in the rules."
        : /\bmail-?in\b/i.test(plain)
          ? "Paid entries; free mail-in method in rules"
          : "Purchase entries are paid. A free method is in the rules.";
    return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(note) };
  }

  const real = rulesContentIsReal(facts, described);
  const hasEntry = Boolean(markers?.ownEntry);
  const terms = Boolean(markers && (markers.noPurchaseNecessary || substantiveRulesCount(markers) >= 3));
  const widgetOnly = hasEntryWidget(html) && !terms;
  if (!ended(contest, now) && contest.due.proven && widgetOnly) {
    return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(WIDGET_RULES_NOTE) };
  }
  const widgetFacts = /data-widget-frame=/i.test(html) ? "End date and prize names were read from the embedded widget." : null;
  const rulesPath = /sweepstakes-rules|\/(?:official-)?rules(?:\/|$|\.)/i.test(pageUrl) || /\bofficial rules\b/i.test(title);
  const formHere = /<form\b[\s\S]*?<\/form>/i.test(html) && /type=["']email["']|name=["']email["']/i.test(html);
  if (rulesPath && !formHere && contest.due.proven) {
    return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say("Rules found; entry form not found on the page you checked"), widgetFacts };
  }
  if (real && hasEntry && contest.due.proven && !markers?.disqualified) {
    const pageText = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
    const sponsorNote = sponsorIdentityNote({ text: `${described} ${pageText}`, url: pageUrl, prizeUsd: contest.prizeValue?.amount ?? null });
    const destination = enterDestinationNote(html, pageUrl);
    if (sponsorNote) return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(sponsorNote) };
    if (destination) return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(destination), widgetFacts };
    return { ...base, title, endIso, checkedByYou: true, listingGroup: "verified", rulesNote: say("Checked by you."), widgetFacts };
  }
  if (!hasEntry && (real || rulesOnThisPage || (markers?.noPurchaseNecessary && contest.due.proven))) {
    const rulesPage = /sweepstakes-rules|\/(?:official-)?rules(?:\/|$|\.)/i.test(pageUrl) || /\brules\b/i.test(title);
    const widgetForm = hasEmbeddedFrame(html);
    const note = widgetForm
      ? "Entry form not found (it may be inside a widget; reload the add-on and check again)"
      : rulesPage
        ? "Rules found; entry form not found on the page you checked"
        : "Entry form is not in the page HTML.";
    return { ...base, title, endIso, checkedByYou: true, listingGroup: "check", rulesNote: say(note), widgetFacts };
  }
  return {
    ...base,
    title,
    endIso,
    checkedByYou: true,
    listingGroup: "check",
    rulesNote: say(missingFactsNote({
      endIso,
      hasEntry,
      rulesFound: real,
      rulesUrl,
      pageUrl,
      folded,
      shell,
      previewText: `${title} ${described} ${plain}`,
    })),
    widgetFacts,
  };
}

/** Rules text the user pasted or uploaded, wrapped so a restart can classify it again. Does not fetch. */
export function attachedRulesDocument(priorHtml: string, rulesHtml: string, marker: "pasted" | "uploaded"): string {
  const base = /<title>[^<]+<\/title>/i.test(priorHtml)
    ? priorHtml
    : `<!doctype html><html><head><title>Official Rules</title></head><body>${priorHtml}</body></html>`;
  return `${base}\n<section data-${marker}-rules="true" data-linked-rules="attached">${rulesHtml}</section>`;
}

/** Classifies rules the user pasted or uploaded for one row. Does not fetch. */
export function classifyAttachedRules(pageUrl: string, priorHtml: string, rulesHtml: string, marker: "pasted" | "uploaded", now: Date, limits: string[] = []): RenderedCheck {
  return classifyRenderedPage(attachedRulesDocument(priorHtml, rulesHtml, marker), pageUrl, now, limits);
}

export function storeRenderedCheck(result: RenderedCheck, checkedAt: string, html = ""): AddonCheckRecord {
  const record: AddonCheckRecord = {
    ...result,
    url: stripTrackingParams(result.url),
    openRulesUrl: result.openRulesUrl ? stripTrackingParams(result.openRulesUrl) : null,
    checkedAt,
    html,
  };
  saveAddonCheck(record);
  return record;
}

function contestKey(value: string): string {
  return stripTrackingParams(value).replace(/\/$/, "");
}

function cloneCheck(row: AddonCheckRecord): AddonCheckRecord {
  return {
    ...row,
    url: contestKey(row.url),
    openRulesUrl: row.openRulesUrl ? contestKey(row.openRulesUrl) : null,
    limits: [...(row.limits ?? [])],
    html: row.html,
  };
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function drawId(value: string): string | null {
  const match = value.match(/\/(\d{2,})(?:\/|$)/);
  return match?.[1] ?? null;
}

function isRulesUrl(url: string): boolean {
  return new RegExp("rules|terms-and-conditions|officialrules", "i").test(url);
}

function rulesNameEntry(rulesHtml: string | undefined, entryUrl: string): boolean {
  if (!rulesHtml || rulesHtml.length === 0) return false;
  if (rulesHtml.includes(entryUrl) || rulesHtml.includes(`${entryUrl}/`)) return true;
  const id = drawId(entryUrl);
  if (!id) return false;
  return rulesHtml.includes(`/draw/${id}`) || rulesHtml.includes(`/dg/draw/${id}`);
}

function registrableHost(url: string): string {
  const host = hostOf(url);
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  return parts.slice(-2).join(".");
}

function sweepstakesTitle(value: string): string | null {
  const cleaned = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !["the", "and", "for", "official", "rules", "giveaway", "sweepstakes", "entry", "enter", "this", "page"].includes(token));
  if (tokens.length < 2 || cleaned.length < 8) return null;
  return cleaned;
}

function titleFromHtml(html: string | undefined): string {
  if (!html) return "";
  return /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
}

function sameSweepstakes(entry: AddonCheckRecord, rules: AddonCheckRecord): boolean {
  if (registrableHost(entry.url) === "" || registrableHost(entry.url) !== registrableHost(rules.url)) return false;
  const name = sweepstakesTitle(entry.title) ?? sweepstakesTitle(titleFromHtml(entry.html));
  if (!name) return false;
  const blob = `${rules.title}\n${titleFromHtml(rules.html)}\n${rules.html ?? ""}`.toLowerCase();
  return blob.includes(name.toLowerCase());
}

function htmlLinksToRules(html: string | undefined, rulesUrl: string): boolean {
  if (!html) return false;
  if (html.includes(rulesUrl)) return true;
  try {
    const url = new URL(rulesUrl);
    const specific = `${url.hostname}${url.pathname}${url.search}`.replace(/\/$/, "");
    if (specific.length > 0 && html.includes(specific)) return true;
    const path = `${url.pathname}${url.search}`.replace(/\/$/, "");
    return path.length > 8 && html.includes(path);
  } catch {
    return false;
  }
}

function foldMatch(entry: AddonCheckRecord, rules: AddonCheckRecord): boolean {
  if (entry.url === rules.url || entry.hidden || isRulesUrl(entry.url)) return false;
  if (entry.openRulesUrl && entry.openRulesUrl === rules.url) return true;
  if (htmlLinksToRules(entry.html, rules.url) && !severalEnds(rules.html, new Date(entry.checkedAt))) return true;
  const entryId = drawId(entry.url);
  const rulesId = drawId(rules.url);
  if (entryId && rulesId && entryId === rulesId && hostOf(entry.url) !== "" && hostOf(entry.url) === hostOf(rules.url)) return true;
  if (rulesNameEntry(rules.html, entry.url)) return true;
  return sameSweepstakes(entry, rules);
}

function genericLegalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /^\/(?:legal|privacy|terms-of-use|terms)\/?$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function manuallyVerified(record: AddonCheckRecord): boolean {
  if (record.verifiedBy === "user") return true;
  if (typeof record.status === "string" && record.status.toUpperCase() === "VERIFIED") return true;
  return record.listingGroup === "verified" && record.rulesNote === "Checked by you.";
}

/** Newest snapshot wins. Equal timestamps keep the longer snapshot, then the later copy. */
function newerSnapshot(current: AddonCheckRecord, next: AddonCheckRecord): AddonCheckRecord {
  const currentAt = Date.parse(current.checkedAt);
  const nextAt = Date.parse(next.checkedAt);
  if (!Number.isNaN(nextAt) && (Number.isNaN(currentAt) || nextAt > currentAt)) return next;
  if (nextAt === currentAt && (next.html?.length ?? 0) > (current.html?.length ?? 0)) return next;
  return current;
}

function classifyStoredRow(record: AddonCheckRecord): AddonCheckRecord {
  if (typeof record.html !== "string" || record.html.length === 0) {
    if (record.rulesNote === "Not open in Idaho") return { ...record, rulesNote: "Re-check needed (saved before the Idaho fix)" };
    return { ...record, limits: [...(record.limits ?? [])] };
  }
  const when = Number.isNaN(Date.parse(record.checkedAt)) ? new Date() : new Date(record.checkedAt);
  const fresh = withAddonVersion(classifyRenderedPage(record.html, record.url, when, [...(record.limits ?? [])]), record.addonVersion);
  const next: AddonCheckRecord = {
    ...fresh,
    url: record.url,
    html: record.html,
    checkedAt: record.checkedAt,
    addonVersion: record.addonVersion,
    limits: [...(record.limits ?? [])],
    hidden: record.hidden,
    notContest: fresh.notContest,
    openRulesUrl: fresh.openRulesUrl ?? (genericLegalUrl(record.openRulesUrl) ? null : record.openRulesUrl),
    status: record.status,
    verifiedBy: record.verifiedBy,
  };
  if (!manuallyVerified(record)) return next;
  return {
    ...next,
    listingGroup: "verified",
    rulesNote: record.rulesNote,
    status: record.status ?? "VERIFIED",
    verifiedBy: record.verifiedBy ?? "user",
  };
}

/**
 * The startup pipeline. Pure: it does not read or write the checks file and does not
 * mutate the rows it is given. Normalize URLs, keep the newest duplicate, fold a rules
 * snapshot only onto its own entry, then classify that entry's merged text.
 */
export function reclassifyStoredChecks(rows: readonly AddonCheckRecord[]): AddonCheckRecord[] {
  const byUrl = new Map<string, AddonCheckRecord>();
  for (const row of rows) {
    const copy = cloneCheck(row);
    const prior = byUrl.get(copy.url);
    byUrl.set(copy.url, prior ? newerSnapshot(prior, copy) : copy);
  }
  const list = [...byUrl.values()];
  const rulesRows = list.filter((row) => isRulesUrl(row.url)).sort((left, right) => left.url.localeCompare(right.url));
  const ownEnds = new Map<string, string>();
  for (const entry of list) {
    if (entry.openRulesUrl || !entry.html || isRulesUrl(entry.url)) continue;
    const linked = rulesRows.find((rules) => htmlLinksToRules(entry.html, rules.url));
    const when = Number.isNaN(Date.parse(entry.checkedAt)) ? new Date() : new Date(entry.checkedAt);
    if (linked && !severalEnds(linked.html, when)) entry.openRulesUrl = linked.url;
  }
  for (const rules of rulesRows) {
    if (!rules.html) continue;
    const candidates = list.filter((entry) => entry.url !== rules.url && !entry.hidden && !isRulesUrl(entry.url));
    const named = candidates.filter((entry) => {
      const entryId = drawId(entry.url);
      const rulesId = drawId(rules.url);
      const sameDraw = Boolean(entryId && rulesId && entryId === rulesId && hostOf(entry.url) === hostOf(rules.url));
      return sameDraw || rulesNameEntry(rules.html, entry.url);
    });
    const matches = named.length > 0 ? named : candidates.filter((entry) => foldMatch(entry, rules));
    if (matches.length === 0) continue;
    for (const entry of matches) {
      const when = Number.isNaN(Date.parse(entry.checkedAt)) ? new Date() : new Date(entry.checkedAt);
      const own = statedEndIso(visibleCopy(entryHtmlWithoutFold(entry.html ?? "")), when);
      if (own) ownEnds.set(entry.url, own);
      if (entry.html?.includes(`data-linked-rules="${rules.url}"`)) continue;
      entry.html = `${entry.html || ""}\n<section data-linked-rules="${rules.url}">${rules.html}</section>`;
      entry.openRulesUrl = entry.openRulesUrl ?? rules.url;
    }
    rules.hidden = true;
  }
  return list.map((row) => {
    const next = classifyStoredRow(row);
    const pinned = ownEnds.get(row.url);
    if (pinned && !manuallyVerified(row)) next.endIso = pinned;
    if (!manuallyVerified(row)) next.rulesNote = settleStoredNote(next.rulesNote, next.endIso, next.html ?? "");
    return next;
  });
}

/** Drops a missing-end or missing-rules phrase once the folded facts answer it. Other notes stay. */
function settleStoredNote(note: string, endIso: string | null, html: string): string {
  const folded = rulesAlreadyFolded(html);
  if (folded && rulesSnapshotIsShell(html)) return "Rules page is a viewer; open the PDF rules to confirm the mail method.";
  let next = note;
  if (endIso) next = next.replace(/End date needs checking\.\s*/gi, "");
  if (folded) next = next.replace(/Official rules not found(?: on this page)?\.\s*/gi, "");
  next = next.replace(/\s{2,}/g, " ").trim();
  if (!endIso && !folded && /end date needs checking/i.test(note) && /official rules not found/i.test(note) && !/open the (?:rules page|official rules)/i.test(note)) {
    return "Official rules not found on this page. End date not stated.";
  }
  return next;
}

/** Fold rules into the entry they belong to, then classify. Same pipeline as startup. */
export function mergeCheckedRows(rows: AddonCheckRecord[]): AddonCheckRecord[] {
  return reclassifyStoredChecks(rows);
}
