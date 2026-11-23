import { seedCashChoice, cautionForUrl, watchedSourceFor } from "@/config/watched-sources";
import { stripTrackingParams } from "./verification-checks";
import { statedEndPhrase } from "./dates";
import { cashNotesFromChoice, cashNotesFromText, mergeCashNotes, type CashNote } from "./cash-alternative";
import { ageTag, restrictionsLine } from "./eligibility-tags";
import { stableId } from "./ids";
import { US_STATES } from "./geo";
import { rulesContentIsReal } from "./rules-facts";
import type { EntryClock, RulesZone } from "./entry-clock";
import { FREE_METHOD_LABEL, type ListingLabel } from "./search-yield";
import type { Contest, MailAmoe, RulesFacts, Source } from "./types";

export interface VerifiedPracticeRow {
  id: string;
  title: string;
  url: string;
  rulesUrl: string | null;
  endIso: string | null;
  /** The sponsor URL returned 403, 429, or a robots denial. */
  sponsorPageBlocked?: boolean;
  /** Facts the page itself did not confirm. A search preview is not confirmation. */
  needsChecking?: Array<"endDate" | "freeEntry" | "eligibility" | "entryMethod">;
  /** Main list, or tucked behind the related-pages link. */
  placement?: "main" | "related";
  /** Sponsorship or a prize that is not what was searched. Still listed, ranked with weak matches. */
  weakMatch?: boolean;
  entryLimit: string;
  eligibility: string;
  automation: "prohibited" | "not_prohibited" | "not_verified";
  rulesVerified: boolean;
  rulesNote: string;
  frequencyKnown: boolean;
  methods: Array<"free" | "paid">;
  mailIn: boolean;
  mailCard: { addressLines: string[]; requiredFields: string[] } | null;
  arvUsd: number | null;
  prize: string;
  formVerified: boolean;
  verificationBlock: "captcha" | "login" | null;
  /** Rank label. Only verified can qualify for Automatic. */
  listingGroup: ListingLabel;
  source: Source;
  /** Set on a directory row so its expanded contests can be found. */
  directoryName: string | null;
  /** Entries are earned by a purchase. The row is paid and never Automatic. */
  purchaseEntry: boolean;
  /** Set when a purchase-entry page also states a free or mail-in method. */
  freeMethodLabel: string | null;
  /** Directory or brand hub that linked this page. The row URL is still the contest page. */
  foundVia: string | null;
  /** Short caution from the verified source notes. State-specific notes are added in the UI. */
  caution: string | null;
  /** Cash-instead-of-prize notes. These are not cautions. */
  cashNotes: CashNote[];
  /** The directory cannot be fetched. The row only links out. */
  unreadDirectory: boolean;
  /** Stated minimum age, such as "21+". Null when the page did not state one. */
  ageTag: string | null;
  /** The rules require pickup or transfer through a licensed dealer or FFL. */
  dealerPickup: boolean;
  /** Full restriction sentences for the details popup. */
  restrictionsDetail: string | null;
  /** Search snippet. Empty when the hit had none. Not a prize. */
  snippet: string;
  /** https image from the fetched page. Null when the page did not give one. */
  imageUrl: string | null;
  /** State codes the fetched rules exclude. */
  excludedStates: string[];
  /** How many of the seven rules items were found. Null when no rules text was read. */
  rulesFoundCount: number | null;
  /** Names of the rules items that were not found. */
  rulesMissing: string[];
  /** Bond or registration language, when the rules stated it. Not required. */
  rulesRegistrationNote: string | null;
  /** Scam phrases found on the page or rules. Empty when none were found. */
  scamPhrases: string[];
  /** An unread directory. Rules were not scanned. */
  rulesScanSkipped: boolean;
  mailAmoe: MailAmoe | null;
  winnersListUrl: string | null;
  rulesReadOn: string | null;
  entryClock: EntryClock;
  rulesTimeZone: RulesZone;
  winnerNotice?: { days: number; assumed: boolean };
  instantWin: boolean;
  /** Calendar date this sponsor page was fetched. Absent when the page was not opened. */
  lastChecked?: string | null;
}

function stateName(code: string): string {
  return US_STATES[code] ?? code;
}

function eligibilityLine(facts: RulesFacts | undefined): string {
  if (!facts) return "Not stated on the fetched page.";
  const parts: string[] = [];
  if (facts.countries.includes("US")) parts.push("United States");
  else if (facts.countries.includes("*")) parts.push("Worldwide, as stated on the page");
  if (facts.minAge !== null) parts.push(`${facts.minAge}+`);
  if (facts.includedStates.length > 0) parts.push(`only ${facts.includedStates.map(stateName).join(", ")}`);
  if (facts.excludedStates.length > 0) parts.push(`excludes ${facts.excludedStates.map(stateName).join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : "Not stated on the fetched page.";
}

function entryLimit(facts: RulesFacts | undefined): string {
  if (!facts || facts.frequency === "unstated") return "Not stated on the fetched rules";
  if (facts.frequency === "daily") return "Once daily";
  if (facts.frequency === "weekly") return "Once weekly";
  return "Once";
}

export function toVerifiedPracticeRow(
  contest: Contest,
  rulesVerified: boolean,
  rulesNote: string,
  listingGroup: ListingLabel = "verified",
  foundVia: string | null = null,
  directoryName: string | null = null,
): VerifiedPracticeRow {
  const facts = contest.rulesFacts;
  const purchaseEntry = contest.pageObservedPurchaseEntry === true;
  const group: ListingLabel = purchaseEntry && listingGroup === "verified" ? "store" : listingGroup;
  const verifiedGroup = group === "verified";
  const sufficient = !purchaseEntry && verifiedGroup && rulesVerified && rulesContentIsReal(facts, `${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`);
  const purchase = purchaseEntry || contest.entryCost === "paid" || facts?.purchaseRequired === true || contest.restrictions.includes("purchase_required");
  const free = !purchaseEntry && (contest.entryCost === "free" || facts?.freeEntryStated === true);
  const methods: Array<"free" | "paid"> = purchaseEntry ? ["paid"] : free && purchase ? ["free", "paid"] : purchase ? ["paid"] : free ? ["free"] : [];
  const freeMethod = facts?.freeEntryStated === true || facts?.mailOffered === true || contest.pageObservedFreeMethod === true;
  const prohibited = facts?.automationProhibited === true;
  const minAge = facts?.minAge ?? contest.limits.minAge ?? null;
  const dealerPickup = facts?.dealerPickup === true;
  const prize = contest.prizeValue ? `${contest.prizeValue.currency} ${contest.prizeValue.amount} stated on the fetched page` : "Not stated on the fetched page";
  return {
    id: contest.id,
    title: contest.title,
    url: stripTrackingParams(contest.officialUrl),
    rulesUrl: contest.rulesUrl ? stripTrackingParams(contest.rulesUrl) : null,
    endIso: contest.due.proven ? contest.due.isoDate : null,
    entryLimit: entryLimit(facts),
    eligibility: eligibilityLine(facts),
    automation: !sufficient ? (prohibited ? "prohibited" : "not_verified") : prohibited ? "prohibited" : "not_prohibited",
    rulesVerified: sufficient,
    rulesNote,
    frequencyKnown: sufficient && facts?.frequency !== "unstated",
    methods,
    mailIn: facts?.mailOffered === true || contest.restrictions.includes("mail_in_only"),
    mailCard: facts?.mailIn ?? null,
    arvUsd: contest.prizeValue?.currency === "USD" ? contest.prizeValue.amount : null,
    prize: contest.pageObservedDetailedDescription?.trim() || contest.shortDescription || prize,
    snippet: snippetOf(contest.shortDescription),
    imageUrl: httpsImage(contest.imageUrl),
    excludedStates: contest.limits.excludedStates ?? contest.rulesFacts?.excludedStates ?? [],
    formVerified: !purchaseEntry && verifiedGroup && contest.formChecked && contest.readiness === "form_checked" && !contest.hubOnly,
    verificationBlock: facts?.verificationBlock ?? null,
    listingGroup: group,
    source: contest.source,
    directoryName,
    purchaseEntry,
    freeMethodLabel: purchaseEntry && freeMethod ? FREE_METHOD_LABEL : null,
    foundVia,
    caution: cautionForUrl(contest.officialUrl, null),
    cashNotes: mergeCashNotes(cashNotesFromText(`${contest.title} ${contest.shortDescription} ${contest.pageObservedDetailedDescription ?? ""}`), cashNotesForContest(contest.officialUrl)),
    unreadDirectory: false,
    ageTag: ageTag(minAge),
    dealerPickup,
    restrictionsDetail: restrictionsLine({ age: minAge, quote: facts?.ageQuote ?? null }, { required: dealerPickup, quote: facts?.dealerPickupQuote ?? null }),
    rulesFoundCount: contest.rulesChecklist ? contest.rulesChecklist.found : null,
    rulesMissing: contest.rulesChecklist?.missing ?? [],
    rulesRegistrationNote: contest.rulesChecklist?.registrationNote ?? null,
    scamPhrases: contest.scamPhrases ?? [],
    rulesScanSkipped: false,
    mailAmoe: contest.rulesFacts?.mailAmoe ?? null,
    winnersListUrl: contest.winnersListUrl ? stripTrackingParams(contest.winnersListUrl) : null,
    rulesReadOn: contest.rulesReadOn ?? null,
    entryClock: contest.entryClock ?? "unstated",
    rulesTimeZone: contest.rulesTimeZone ?? { iana: null, assumed: true },
    winnerNotice: contest.winnerNotice,
    instantWin: contest.instantWin === true,
  };
}

function snippetOf(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text || text === "The fetched page did not include a short description.") return "";
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

function httpsImage(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("https://")) return null;
  return value;
}

function cashNotesForContest(url: string): CashNote[] {
  const source = watchedSourceFor(url);
  return cashNotesFromChoice(source ? seedCashChoice(source.domain) : null);
}

/** A Brave directory hit that is not fetched. No prize or end date is filled in. */
export function directoryBrowseRow(url: string, title: string, directoryName: string | null, snippet = ""): VerifiedPracticeRow {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* Keep the raw string. */
  }
  const watched = watchedSourceFor(url);
  const paid = watched?.paidRaffle === true;
  return {
    id: stableId(["directory-browse", url]),
    title: title.trim() || directoryName || host,
    url,
    rulesUrl: null,
    endIso: null,
    entryLimit: "Not stated on a fetched page.",
    eligibility: "Not stated on a fetched page.",
    automation: "not_verified",
    rulesVerified: false,
    rulesNote: "Directory listing",
    frequencyKnown: false,
    methods: paid ? ["paid"] : [],
    mailIn: false,
    mailCard: null,
    arvUsd: null,
    prize: "Not stated on a fetched page.",
    formVerified: false,
    verificationBlock: null,
    listingGroup: "directory",
    source: "web",
    directoryName,
    purchaseEntry: paid,
    freeMethodLabel: null,
    foundVia: null,
    caution: cautionForUrl(url, null),
    cashNotes: [],
    unreadDirectory: true,
    ageTag: null,
    dealerPickup: false,
    restrictionsDetail: null,
    snippet: snippetOf(snippet),
    imageUrl: null,
    excludedStates: [],
    rulesFoundCount: null,
    rulesMissing: [],
    rulesRegistrationNote: null,
    scamPhrases: [],
    rulesScanSkipped: true,
    mailAmoe: null,
    winnersListUrl: null,
    rulesReadOn: null,
    entryClock: "unstated",
    rulesTimeZone: { iana: null, assumed: true },
    instantWin: false,
  };
}

const UNCHECKED_FACTS = ["endDate", "freeEntry", "eligibility", "entryMethod"] as const;

const FACT_LABEL = {
  endDate: "end date",
  freeEntry: "free entry",
  eligibility: "eligibility",
  entryMethod: "entry method",
} as const;

/** Which unconfirmed facts to name, plus a search-preview date only when the text stated one. */
export function uncheckedNote(why: string, title = "", snippet = ""): string {
  const labels = UNCHECKED_FACTS.map((fact) => FACT_LABEL[fact]);
  const list = `${labels[0].charAt(0).toUpperCase()}${labels[0].slice(1)}, ${labels.slice(1, -1).join(", ")}, and ${labels[labels.length - 1]} need checking.`;
  const preview = statedEndPhrase(`${title} ${snippet}`);
  const hint = preview ? ` Search preview says ${preview}.` : "";
  return `${list}${hint} ${why}`;
}

/** A search hit shown without a fetched page. No prize, date, or entry tags are invented. */
export function searchHitRow(url: string, title: string, snippet: string, reason: "not_attempted" | "failed" = "not_attempted"): VerifiedPracticeRow {
  const row = directoryBrowseRow(url, title, null, snippet);
  const why = reason === "failed" ? "This page did not load." : "The search stopped before this page.";
  return {
    ...row,
    id: stableId(["search-hit", url]),
    listingGroup: "check",
    endIso: null,
    needsChecking: [...UNCHECKED_FACTS],
    rulesNote: uncheckedNote(why, title, snippet),
    unreadDirectory: false,
    rulesScanSkipped: false,
  };
}

/** A watched page the site would not return. The known URL is shown. Prize and end date stay blank. */
export function unfetchedWatchRow(url: string, title: string): VerifiedPracticeRow {
  let path = "/";
  try {
    path = new URL(url).pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    /* Keep the default path. */
  }
  const index = path === "/giveaways" || path === "/giveaway";
  const row = directoryBrowseRow(url, title, null);
  return {
    ...row,
    id: stableId(["unfetched-watch", url]),
    listingGroup: index ? "directory" : "check",
    rulesNote: index ? "Directory listing" : uncheckedNote("This site blocked our check.", title, ""),
    needsChecking: index ? undefined : [...UNCHECKED_FACTS],
    unreadDirectory: false,
    endIso: null,
    arvUsd: null,
    prize: "Not stated on a fetched page.",
    ageTag: null,
    dealerPickup: false,
    restrictionsDetail: null,
    snippet: row.snippet,
    imageUrl: null,
    excludedStates: [],
    rulesFoundCount: null,
    rulesMissing: [],
    rulesRegistrationNote: null,
    scamPhrases: [],
    rulesScanSkipped: false,
  };
}

/** Paid-raffle sources stay paid and cannot qualify for Automatic. Seed prize text is not copied. */
export function applyWatchedSource(row: VerifiedPracticeRow): VerifiedPracticeRow {
  const source = watchedSourceFor(row.url);
  const cashNotes = mergeCashNotes(row.cashNotes ?? [], cashNotesFromChoice(source ? seedCashChoice(source.domain) : null));
  if (!source) return { ...row, caution: row.caution ?? null, cashNotes };
  if (row.listingGroup === "check" && source.storeBrand && row.purchaseEntry) {
    return {
      ...row,
      listingGroup: "store",
      methods: ["paid"],
      formVerified: false,
      rulesVerified: false,
      frequencyKnown: false,
      automation: "not_verified",
      caution: cautionForUrl(row.url, null),
      cashNotes,
    };
  }
  if (row.listingGroup === "check" || row.listingGroup === "directory" || row.listingGroup === "article") {
    if (!source.paidRaffle) return { ...row, caution: cautionForUrl(row.url, null), cashNotes };
    return {
      ...row,
      methods: ["paid"],
      purchaseEntry: true,
      formVerified: false,
      rulesVerified: false,
      frequencyKnown: false,
      automation: "not_verified",
      freeMethodLabel: null,
      caution: cautionForUrl(row.url, null),
      cashNotes,
    };
  }
  if (source.donation && row.listingGroup !== "social") {
    return {
      ...row,
      listingGroup: "verified",
      methods: ["paid"],
      purchaseEntry: false,
      freeMethodLabel: row.freeMethodLabel || (source.freeMethodStated ? FREE_METHOD_LABEL : null),
      caution: cautionForUrl(row.url, null),
      cashNotes,
    };
  }
  if (source.storeBrand && row.listingGroup !== "social") {
    return {
      ...row,
      listingGroup: "store",
      methods: ["paid"],
      purchaseEntry: true,
      formVerified: false,
      rulesVerified: false,
      frequencyKnown: false,
      automation: "not_verified",
      freeMethodLabel: row.freeMethodLabel,
      caution: cautionForUrl(row.url, null),
      cashNotes,
    };
  }
  if (!source.paidRaffle) return { ...row, caution: cautionForUrl(row.url, null), cashNotes };
  return {
    ...row,
    listingGroup: "store",
    methods: ["paid"],
    purchaseEntry: true,
    formVerified: false,
    rulesVerified: false,
    frequencyKnown: false,
    automation: "not_verified",
    freeMethodLabel: null,
    caution: cautionForUrl(row.url, null),
    cashNotes,
  };
}

/** Automatic is allowed only for a free method when rules, frequency, and the form were verified and nothing blocks automation. */
export function automaticEntryAllowed(row: Pick<VerifiedPracticeRow, "rulesVerified" | "frequencyKnown" | "automation" | "methods" | "formVerified" | "verificationBlock" | "purchaseEntry">): boolean {
  return !row.purchaseEntry && row.rulesVerified && row.frequencyKnown && row.formVerified && row.verificationBlock === null && row.automation === "not_prohibited" && row.methods.includes("free");
}
