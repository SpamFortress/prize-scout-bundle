import { formatAddonEnd } from "@/domain/dates";
import type { EntryClock, RulesZone } from "@/domain/entry-clock";
import { entryHostPolicy } from "@/domain/prefill";
import type { MailAmoe } from "@/domain/types";
import type { VerifiedPracticeRow } from "@/domain/verified-entry";
import type { Source } from "@/domain/types";

/** Shown under the Home search bar. Not a guarantee. */
export const SEARCH_DISCLAIMER = "Prize Scout finds giveaways but can't guarantee them. Always read the official rules before entering.";

/** Synthetic Entries fixtures. Not discovered contests and not genuine entries. */

export type CountKind = "confirmed" | "estimated";

export interface EntrySample {
  id: string;
  title: string;
  status: string;
  end: string;
  countText: string;
  countKind: CountKind;
  /** Omitted for a free-only row. */
  spend: string | null;
  entryLimit: string;
  eligibility: string;
  prize: string;
  history: string[];
  url: string;
  delivery: string;
  kind: "completed" | "daily-entered" | "daily-open" | "mixed";
  /** This row's prize is the truck used in the arithmetic illustration. */
  truckExample?: boolean;
  source?: Source;
  published?: string;
  /** When set, this is the entry method. Otherwise mixed is both and every other kind is free. */
  methods?: Array<"free" | "paid">;
  mailIn?: boolean;
  /** The sample's free entry for this period is already used. A paid method can remain. */
  freeEntryUsed?: boolean;
  /** Entries tab. Omitted samples are still on Home. */
  tracked?: boolean;
  priceLabel?: string;
  /** Sample country code. Omitted samples are marked United States. */
  region?: string;
  /** True only after an official rules page was fetched and read. Samples stay false. */
  rulesVerified?: boolean;
  automationProhibited?: boolean;
  /** False when the fetched rules do not state daily, weekly, or once. */
  frequencyKnown?: boolean;
  rulesNote?: string;
  mailCard?: { addressLines: string[]; requiredFields: string[] } | null;
  /** Dollar ARV copied from a page, or the sample truck illustration. */
  arvUsd?: number | null;
  arvKind?: "sample" | "verified";
  /** A row built from a fetched page. Sample rows omit this. */
  liveVerified?: boolean;
  /** Verified rows passed the form and rules check. Other labels are a manual look. */
  listingGroup?: "verified" | "store" | "directory" | "social" | "article" | "check";
  placement?: "main" | "related";
  directoryName?: string | null;
  /** A store page where a purchase earns entries. Never Automatic. */
  purchaseEntry?: boolean;
  /** Shown when that store page also states a free or mail-in method. */
  freeMethodLabel?: string | null;
  /** Directory or brand hub that linked this fetched page. */
  foundVia?: string | null;
  /** Caution from the verified source notes. State-specific notes are added when the row is shown. */
  caution?: string | null;
  cashNotes?: Array<{ label: string; tone: "positive" | "neutral" }>;
  unreadDirectory?: boolean;
  ageTag?: string | null;
  dealerPickup?: boolean;
  restrictionsDetail?: string | null;
  /** The fetched page had an entry form. Practice samples omit this. */
  formVerified?: boolean;
  /** Captcha or login on the fetched page. Practice samples omit this. */
  needsAttention?: "captcha" | "login" | null;
  /** Brave or page snippet. Empty when none was returned. */
  snippet?: string;
  /** https image from the fetched page. */
  imageUrl?: string | null;
  /** State codes the fetched rules exclude. */
  excludedStates?: string[];
  /** Seven-item rules count. Null when no rules text was read. Omitted on practice samples. */
  rulesFoundCount?: number | null;
  rulesMissing?: string[];
  rulesRegistrationNote?: string | null;
  scamPhrases?: string[];
  rulesScanSkipped?: boolean;
  mailAmoe?: MailAmoe | null;
  winnersListUrl?: string | null;
  rulesReadOn?: string | null;
  entryClock?: EntryClock;
  rulesTimeZone?: RulesZone;
  winnerNotice?: { days: number; assumed: boolean };
  rulesUrl?: string | null;
  instantWin?: boolean;
  /** The user checked this URL from the add-on. Distinct from a fetched Verified row. */
  checkedByYou?: boolean;
  /** This row is showing a saved add-on check, including a paid row. */
  addonChecked?: boolean;
  /** Calendar date the sponsor page was last fetched. */
  lastChecked?: string | null;
  /** Add-on build that checked this row, when the popup sent one. */
  addonVersion?: string;
}

export const ENTRY_SAMPLES: EntrySample[] = [
  {
    id: "chair",
    title: "Reading chair drawing — illustration only",
    status: "Daily sample is available",
    end: "2027-02-14",
    countText: "2",
    countKind: "confirmed",
    spend: null,
    entryLimit: "Once daily",
    eligibility: "US residents, 21+; excludes NY",
    prize: "A drawn oak reading chair with a woven seat. Illustration only, not a prize you can win.",
    history: ["01/09/2027 — sample entry noted in this preview.", "Today is still open in this sample."],
    url: "https://example.com/sample-chair",
    delivery: "Pickup required. Sample location: Loading dock B, 100 Example Street, Springfield. Not a real address.",
    kind: "daily-open",
    source: "web",
    published: "2026-06-01",
    priceLabel: "Not stated",
  },
  {
    id: "oak",
    title: "Oak table drawing — illustration only",
    status: "Completed one-time sample",
    end: "2027-01-26",
    countText: "1",
    countKind: "confirmed",
    spend: null,
    entryLimit: "Once",
    eligibility: "US residents, 21+; excludes NY",
    prize: "A drawn white oak table for six. Illustration only, not a prize you can win.",
    history: ["01/02/2027 — sample entry noted in this preview.", "One-time sample. No further entry."],
    url: "https://example.com/sample-oak",
    delivery: "Delivery included in this sample. No separate fee is stated.",
    kind: "completed",
    source: "web",
    published: "2026-01-02",
    priceLabel: "Not stated",
  },
  {
    id: "lamp",
    title: "Desk lamp drawing — illustration only",
    status: "Entered today. Next eligible tomorrow.",
    end: "2027-03-01",
    countText: "About 6",
    countKind: "estimated",
    spend: null,
    entryLimit: "Once daily",
    eligibility: "US residents, 21+; excludes NY",
    prize: "A drawn brass desk lamp with a linen shade. Illustration only, not a prize you can win.",
    history: ["01/10/2027 — sample entry for today.", "Next eligible 01/11/2027. Sample status: wait."],
    url: "https://example.com/sample-lamp",
    delivery: "Pickup: Not stated.",
    kind: "daily-entered",
    source: "x",
    published: "2026-02-01",
    priceLabel: "Not stated",
  },
  {
    id: "truck",
    title: "Field truck drawing — illustration only",
    status: "Merchandise and a free mail-in sample",
    end: "2027-01-15",
    countText: "1",
    countKind: "confirmed",
    spend: "$24",
    entryLimit: "Once",
    eligibility: "US residents, 21+; excludes NY",
    prize: "A drawn field truck. This sample illustration prices the truck at $55,000 plus $10,000 additional cash. Not a contest and not a photo.",
    history: ["12/20/2026 — sample merchandise amount $24.", "Mail-in is still offered in this sample only."],
    url: "https://example.com/sample-truck",
    delivery: "Delivery fee in this sample: $40. Pickup is not required here. Not a real charge.",
    kind: "mixed",
    truckExample: true,
    source: "facebook",
    published: "2026-03-01",
    mailIn: true,
    priceLabel: "$55,000 sample illustration, not a purchase price",
    arvUsd: 55_000,
    arvKind: "sample",
  },
];

/** Home catalog. Entries-tab rows are the tracked ones. These extras are results until someone saves them. */
export const PRACTICE_EXTRAS: EntrySample[] = [
  {
    id: "demo-illustration-1",
    title: "Furniture collection — illustration only",
    status: "Daily sample is available",
    end: "2027-01-26",
    countText: "1",
    countKind: "confirmed",
    spend: null,
    entryLimit: "Once daily",
    eligibility: "US residents, 21+; excludes NY",
    prize: "A drawn white oak dining table for six, with a linen-colored top. Illustration only, not a prize you can win.",
    history: ["No sample entry is confirmed.", "Saving or Enter does not confirm one."],
    url: "https://example.com/demo-illustration-1",
    delivery: "Delivery included in this sample. No separate fee is stated.",
    kind: "daily-open",
    source: "web",
    published: "2026-06-01",
    priceLabel: "Not stated",
    tracked: false,
  },
  {
    id: "demo-illustration-4",
    title: "Side table — illustration only",
    status: "Free mail-in sample is available",
    end: "2026-10-30",
    countText: "1",
    countKind: "confirmed",
    spend: null,
    entryLimit: "Once",
    eligibility: "US residents, 21+; excludes NY",
    prize: "A drawn oak side table. Illustration only, not a prize you can win.",
    history: ["No sample entry is confirmed."],
    url: "https://example.com/demo-illustration-4",
    delivery: "Pickup: Not stated.",
    kind: "daily-open",
    source: "instagram",
    published: "2025-12-01",
    mailIn: true,
    priceLabel: "Not stated",
    tracked: false,
  },
  {
    id: "demo-illustration-5",
    title: "Reading chair — illustration only",
    status: "Paid method only. Not automatic.",
    end: "2026-12-20",
    countText: "1",
    countKind: "confirmed",
    spend: null,
    entryLimit: "Once",
    eligibility: "US residents, 21+; excludes NY",
    prize: "A drawn reading chair. Illustration only, not a prize you can win.",
    history: ["No sample entry is confirmed."],
    url: "https://example.com/demo-illustration-5",
    delivery: "Pickup required. Sample location: 100 Example Street, Springfield. Not a real address.",
    kind: "daily-open",
    methods: ["paid"],
    source: "web",
    published: "2026-04-02",
    priceLabel: "Not stated",
    tracked: false,
  },
];

export const PRACTICE_ROWS: EntrySample[] = [...ENTRY_SAMPLES, ...PRACTICE_EXTRAS];

export type PracticeScope = "home" | "saved" | "entries";
export type PracticeOrder = "newest" | "oldest" | "ending-soonest" | "ending-latest";

export interface PracticeSearchGroup {
  id: string;
  query: string;
  active: boolean;
}

/** A blank query does not open or replace a group. Search updates the open group, or starts one. */
export function commitPracticeSearch(groups: readonly PracticeSearchGroup[], query: string, id: string): PracticeSearchGroup[] | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const active = groups.find((group) => group.active);
  if (!active) {
    return [...groups.map((group) => ({ ...group, active: false })), { id, query: trimmed, active: true }];
  }
  return groups.map((group) => (group.id === active.id ? { ...group, query: trimmed, active: true } : { ...group, active: false }));
}

/** Keeps every request and bookmark. The next Search starts a new request instead of replacing the open one. */
export function parkPracticeSearch(groups: readonly PracticeSearchGroup[]): PracticeSearchGroup[] {
  return groups.map((group) => ({ ...group, active: false }));
}

/** Closes the open group and keeps every query. The editor can be cleared by the caller. */
export function addPracticeSearch(groups: readonly PracticeSearchGroup[]): { groups: PracticeSearchGroup[]; cleared: boolean } {
  const active = groups.find((group) => group.active);
  if (!active || !active.query.trim()) {
    return { groups: groups.map((group) => ({ ...group })), cleared: false };
  }
  return { cleared: true, groups: groups.map((group) => ({ ...group, active: false })) };
}

export function filterPracticeRows(
  items: EntrySample[],
  input: {
    scope: PracticeScope;
    savedIds: readonly string[];
    query: string;
    sources: readonly Source[];
    method: MethodFilter;
    order: PracticeOrder;
    region?: string;
  },
): EntrySample[] {
  const needle = input.query.trim().toLowerCase();
  const rows = items.filter((item) => {
    if (input.scope === "saved" && !input.savedIds.includes(item.id)) return false;
    if (input.scope === "entries" && item.tracked === false) return false;
    if (input.region && (item.region ?? "US") !== input.region) return false;
    if (!input.sources.includes(item.source ?? "web")) return false;
    if (!matchesEntryMethod(item, input.method)) return false;
    if (!needle) return true;
    const haystack = `${item.title} ${item.prize} ${item.status} ${item.url}`.toLowerCase();
    return haystack.includes(needle);
  });
  const copy = [...rows];
  copy.sort((a, b) => {
    if (input.order === "oldest") return (a.published ?? a.end).localeCompare(b.published ?? b.end);
    if (input.order === "ending-soonest") return a.end.localeCompare(b.end);
    if (input.order === "ending-latest") return b.end.localeCompare(a.end);
    return (b.published ?? b.end).localeCompare(a.published ?? a.end);
  });
  return copy;
}

/** Each sample appears once, in the earliest request that matches it. */
export function rowsForPracticeGroups(
  items: EntrySample[],
  groups: readonly PracticeSearchGroup[],
  input: {
    savedIds: readonly string[];
    sources: readonly Source[];
    method: MethodFilter;
    order: PracticeOrder;
    region?: string;
  },
): Array<{ group: PracticeSearchGroup; rows: EntrySample[]; hiddenAsDuplicate: boolean }> {
  const seen = new Set<string>();
  return groups.map((group) => {
    const matched = filterPracticeRows(items, { ...input, scope: "home", query: group.query });
    const rows = matched.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    return { group, rows, hiddenAsDuplicate: matched.length > 0 && rows.length === 0 };
  });
}

export const SAMPLE_AS_OF = new Date("2027-01-10T12:00:00Z");

export type MethodFilter = "all" | "free" | "paid";

/** Entry methods the sample can offer. The filter uses the current button, not this whole list. */
export function entryMethods(item: EntrySample): Array<"free" | "paid"> {
  if (item.methods) return item.methods;
  return item.kind === "mixed" ? ["free", "paid"] : ["free"];
}

/** Free while Enter, tomorrow, or done is the current state. Paid only when the button is $ Paid. */
export function currentEntrySide(item: EntrySample): "free" | "paid" | "unknown" {
  const action = entryAction(item);
  if (action === "unavailable") return "unknown";
  return action === "paid" ? "paid" : "free";
}

export function matchesEntryMethod(item: EntrySample, filter: MethodFilter): boolean {
  if (filter === "all") return true;
  return currentEntrySide(item) === filter;
}

/** Marks a practice click that used the free entry. It does not submit or change a count. */
export function presentEntry(item: EntrySample, freeUsedIds: readonly string[]): EntrySample {
  if (item.freeEntryUsed || !freeUsedIds.includes(item.id)) return item;
  return { ...item, freeEntryUsed: true };
}

/** Prefill means the free form can be filled. The user still presses the sponsor's Submit button. */
export function automaticCaption(item: EntrySample): string {
  const limit = item.entryLimit.toLowerCase();
  const frequency = limit.includes("daily") ? "Daily" : limit.includes("weekly") ? "Weekly" : limit.includes("once") ? "Once" : item.entryLimit;
  return `Prefill · ${frequency}`;
}

export type EnterMode = "prefill" | "open_only" | "needs_you";

/** A free form can be prefilled. Paid entries are not. Hosts that forbid automated access are open-only. */
export function enterMode(item: EntrySample): EnterMode {
  if (item.purchaseEntry || (item.methods?.includes("paid") && !item.methods.includes("free"))) return "needs_you";
  if (entryHostPolicy(item.url) === "open-only") return "open_only";
  if (item.liveVerified) {
    if (item.rulesVerified !== true || item.formVerified !== true || item.frequencyKnown === false) return "needs_you";
    return "prefill";
  }
  return "prefill";
}

/** Fetched pages are called verified only when the row is an entry. Indexes and other pages stay check-the-page. */
export function fetchedPageLabel(item: { liveVerified?: boolean; listingGroup?: string }): string {
  if (!item.liveVerified) return "Sample page — not a real contest";
  if (item.listingGroup === "directory" || item.listingGroup === "check" || item.listingGroup === "article") {
    return "Check the page. This was not treated as an entry.";
  }
  return "Verified page — fetched from this URL. Not a sample.";
}

export function sampleFromVerified(row: VerifiedPracticeRow): EntrySample {
  const recurring = row.entryLimit.toLowerCase().includes("daily") || row.entryLimit.toLowerCase().includes("weekly");
  const freeReadable = !row.unreadDirectory && row.listingGroup !== "directory" && row.listingGroup !== "social" && !row.purchaseEntry && row.methods.includes("free") && !row.methods.includes("paid");
  return {
    id: `live-${row.id}`,
    title: row.title,
    status: row.rulesNote,
    end: row.endIso ?? "",
    countText: "Not stated",
    countKind: "estimated",
    spend: null,
    entryLimit: row.entryLimit,
    eligibility: row.eligibility,
    prize: row.prize,
    history: ["Fetched in this search. No entry was submitted."],
    url: row.url,
    delivery: "Not stated on the fetched page.",
    kind: recurring ? "daily-open" : row.methods.includes("paid") && row.methods.includes("free") ? "mixed" : "daily-open",
    methods: row.methods,
    mailIn: row.mailIn,
    tracked: false,
    priceLabel: row.arvUsd !== null ? `$${row.arvUsd.toLocaleString("en-US")} ARV stated on the fetched page` : "Not stated",
    rulesVerified: freeReadable ? row.rulesVerified : false,
    automationProhibited: row.automation === "prohibited",
    frequencyKnown: freeReadable ? row.frequencyKnown : false,
    formVerified: freeReadable ? row.formVerified : false,
    listingGroup: row.listingGroup,
    placement: row.placement ?? "main",
    directoryName: row.directoryName,
    source: row.source,
    purchaseEntry: row.purchaseEntry,
    freeMethodLabel: row.freeMethodLabel,
    foundVia: row.foundVia,
    caution: row.caution,
    cashNotes: row.cashNotes,
    unreadDirectory: row.unreadDirectory,
    ageTag: row.ageTag,
    dealerPickup: row.dealerPickup,
    restrictionsDetail: row.restrictionsDetail,
    needsAttention: row.verificationBlock,
    snippet: row.snippet,
    imageUrl: row.imageUrl,
    excludedStates: row.excludedStates,
    rulesFoundCount: row.rulesFoundCount,
    rulesMissing: row.rulesMissing,
    rulesRegistrationNote: row.rulesRegistrationNote,
    scamPhrases: row.scamPhrases,
    rulesScanSkipped: row.rulesScanSkipped,
    mailAmoe: row.mailAmoe,
    winnersListUrl: row.winnersListUrl,
    rulesReadOn: row.rulesReadOn,
    entryClock: row.entryClock,
    rulesTimeZone: row.rulesTimeZone,
    winnerNotice: row.winnerNotice,
    rulesUrl: row.rulesUrl,
    instantWin: row.instantWin,
    rulesNote: row.rulesNote,
    lastChecked: row.lastChecked ?? null,
    mailCard: row.mailCard,
    arvUsd: row.arvUsd,
    arvKind: row.arvUsd !== null ? "verified" : undefined,
    liveVerified: true,
  };
}

export interface AddonOverlay {
  checkedByYou?: boolean;
  listingGroup?: string;
  rulesNote?: string;
  addonVersion?: string;
  endIso?: string | null;
  openRulesUrl?: string | null;
}

/** A saved add-on check replaces the note and shows the extracted end date. A paid path stays paid. */
export function applyAddonOverlay(item: EntrySample, check: AddonOverlay | undefined): EntrySample {
  if (!check) return item;
  const note = check.rulesNote || item.rulesNote || "";
  const paidPath = /paid entries|purchase entries are paid/i.test(note);
  const methods = paidPath ? (["paid"] as Array<"free" | "paid">) : item.methods;
  const group = check.listingGroup === "verified" || check.listingGroup === "check" || check.listingGroup === "store" ? check.listingGroup : item.listingGroup;
  return {
    ...item,
    addonChecked: true,
    checkedByYou: check.checkedByYou === true,
    rulesNote: note || item.rulesNote,
    addonVersion: check.addonVersion || item.addonVersion,
    end: check.endIso || item.end,
    rulesUrl: check.openRulesUrl || item.rulesUrl,
    listingGroup: group,
    purchaseEntry: paidPath ? true : item.purchaseEntry,
    methods,
    rulesVerified: paidPath ? false : item.rulesVerified,
    formVerified: paidPath ? false : item.formVerified,
  };
}

export function rulesReading(item: EntrySample): Array<{ label: string; value: string }> {
  if (!item.liveVerified) {
    return [
      { label: "Entry frequency", value: `${item.entryLimit}. Official rules page was not fetched.` },
      { label: "Eligibility", value: `${item.eligibility}. Idaho exclusion was not read from an official rules page.` },
      { label: "End date", value: `${item.end || "Not stated"}. Sample date. Not read from a rules page.` },
      { label: "Automated entry", value: `Practice sample. The caption says ${automaticCaption(item)}. The click is simulated and does not submit.` },
    ];
  }
  const caption = enterCaption(item);
  const automated = item.automationProhibited
    ? "The fetched rules prohibit automated entry. The button says Manual · Rules and opens the official page."
    : caption === "Needs you"
      ? "Paid entries are not filled. A page without a readable free form is opened for you to complete."
      : "Prize Scout can prefill the free form. You review it and press the sponsor's Submit button. Prize Scout does not submit, solve captchas, or script follows.";
  const lines = [
    { label: "Entry frequency", value: item.entryLimit },
    { label: "Eligibility", value: item.eligibility },
    { label: "End date", value: (item.addonChecked ? formatAddonEnd(item.end) : null) || item.end || "Not stated on the fetched page." },
    { label: "Automated entry", value: automated },
    { label: "Rules check", value: item.rulesNote || "Not verified." },
  ];
  if (item.addonChecked && item.rulesUrl) lines.push({ label: "Open rules", value: item.rulesUrl });
  if (item.restrictionsDetail) lines.push({ label: "Restrictions", value: item.restrictionsDetail });
  if (item.caution) lines.push({ label: "Note", value: item.caution });
  if (!item.rulesScanSkipped && item.rulesFoundCount != null) {
    lines.push({ label: "Rules check", value: `Rules checked ${item.rulesFoundCount}/7` });
    if ((item.rulesMissing ?? []).length > 0) lines.push({ label: "Not found in the rules", value: (item.rulesMissing ?? []).join("; ") });
  } else if (item.liveVerified && !item.rulesScanSkipped) {
    lines.push({ label: "Rules check", value: "Rules not found" });
  }
  if (item.rulesReadOn) lines.push({ label: "Rules last read on", value: item.rulesReadOn });
  if (item.winnersListUrl) lines.push({ label: "Winners list", value: item.winnersListUrl });
  if (item.mailAmoe) {
    const parts = [
      item.mailAmoe.addressLines.join(", "),
      item.mailAmoe.cardSize ? `Card size: ${item.mailAmoe.cardSize}` : "",
      item.mailAmoe.postmarkBy ? `Postmark by ${item.mailAmoe.postmarkBy}` : "",
      item.mailAmoe.receivedBy ? `Received by ${item.mailAmoe.receivedBy}` : "",
      item.mailAmoe.entryLimit ?? "",
    ].filter((part) => part.length > 0);
    if (parts.length > 0) lines.push({ label: "Mail-in", value: parts.join(". ") });
  }
  if (item.rulesRegistrationNote) lines.push({ label: "Registration", value: item.rulesRegistrationNote });
  if ((item.scamPhrases ?? []).length > 0) lines.push({ label: "Scam warning", value: (item.scamPhrases ?? []).join("; ") });
  return lines;
}

export const NEEDS_YOU_CAPTION = "Needs you";

/** Prefill when a free form can be filled. The user still submits. Open-only hosts are not filled. */
export function enterCaption(item: EntrySample): string {
  const mode = enterMode(item);
  if (mode === "open_only") return "Open the page";
  if (mode === "needs_you") return NEEDS_YOU_CAPTION;
  return automaticCaption(item);
}

export const ENTER_CLICK_HELP = "Enter needs your click. This does not fill in or submit an entry.";

export const PAID_CAPTION = "Paid · Manual";
export const DONE_CAPTION = "One entry used · Not submitted";

/** Off until another region is ready to show. The filter still accepts a region code. */
export const SHOW_PRACTICE_REGION = false;

/** Practice offers the United States only. Add a region here when it is ready to show. */
export const PRACTICE_REGIONS = [{ code: "US", label: "United States" }] as const;

export type EntryAction = "enter" | "paid" | "tomorrow" | "done" | "unavailable";

/** Daily or weekly free entry. It stays Free after today's entry and never becomes $ Paid. */
export function isRecurringFree(item: EntrySample): boolean {
  const limit = item.entryLimit.toLowerCase();
  return limit.includes("daily") || limit.includes("weekly");
}

export function waitingCaption(item: EntrySample): string {
  return item.entryLimit.toLowerCase().includes("weekly") ? "Next free entry next week" : "Next free entry tomorrow";
}

/** One entry control. A recurring free entry waits for the next period. Only a one-time free entry can switch to $ Paid. */
export function entryAction(item: EntrySample): EntryAction {
  const methods = entryMethods(item);
  if (item.methods && methods.length === 0) return "unavailable";
  const freeUsed = item.freeEntryUsed === true || item.kind === "daily-entered" || item.kind === "completed";
  if (methods.includes("free") && !freeUsed) return "enter";
  if (methods.includes("free") && isRecurringFree(item)) return "tomorrow";
  if (methods.includes("paid")) return "paid";
  if (freeUsed) return "done";
  return "tomorrow";
}

export function summarizePracticeGroups<TGroup extends { query: string }, TRow>(
  groups: readonly { group: TGroup; rows: readonly TRow[]; hiddenAsDuplicate: boolean }[],
): {
  withRows: Array<{ group: TGroup; rows: readonly TRow[]; hiddenAsDuplicate: boolean }>;
  noMatches: string[];
  alreadyListed: string[];
} {
  return {
    withRows: groups.filter((group) => group.rows.length > 0),
    noMatches: groups.filter((group) => group.rows.length === 0 && !group.hiddenAsDuplicate).map((group) => group.group.query),
    alreadyListed: groups.filter((group) => group.rows.length === 0 && group.hiddenAsDuplicate).map((group) => group.group.query),
  };
}

export const AFFORD_LINK = "* If I win: taxes & delivery";

export const AFFORD_HEADING = "Can I afford this if I win?";

export const TAX_SCENARIO = { truck: 55_000, cash: 10_000, federalRate: 0.25, stateRate: 0.05 } as const;

/** Illustration only. One tax on the combined prize value, then the cash award is subtracted once. */
export function illustrativeTax(scenario: { truck: number; cash: number; federalRate: number; stateRate: number } = TAX_SCENARIO) {
  const combined = scenario.truck + scenario.cash;
  const rate = scenario.federalRate + scenario.stateRate;
  const federalPart = combined * scenario.federalRate;
  const statePart = combined * scenario.stateRate;
  const taxOnCombined = federalPart + statePart;
  const afterSubtractingCash = taxOnCombined - scenario.cash;
  return { combined, rate, federalPart, statePart, taxOnCombined, afterSubtractingCash };
}

export interface ExampleOption {
  id: string;
  name: string;
  /** How many entries this option would add. Not a count you already own. */
  entries: number;
  /** All-in dollars when shipping, tax, and fees are known. Null when the total is incomplete or this is mail-in. */
  allIn: number | null;
  knownPart: number;
  detail: string;
  missing: string | null;
  /** Mail-in is not a dollar total and is not ranked with paid options. */
  group: "mail" | "known" | "incomplete";
}

export const EXAMPLE_OPTIONS: ExampleOption[] = [
  {
    id: "mail",
    name: "Mail-in · No purchase necessary",
    entries: 1,
    allIn: null,
    knownPart: 0,
    detail: "Postage and supplies not included.",
    missing: null,
    group: "mail",
  },
  {
    id: "daily",
    name: "Free daily example",
    entries: 1,
    allIn: 0,
    knownPart: 0,
    detail: "Quantity: 1 entry. All-in price: $0.",
    missing: null,
    group: "known",
  },
  {
    id: "two",
    name: "Two-entry example",
    entries: 2,
    allIn: 10,
    knownPart: 10,
    detail: "Quantity: 2 entries. All-in price: $10, shipping and tax included in this example.",
    missing: null,
    group: "known",
  },
  {
    id: "single",
    name: "Single-entry example",
    entries: 1,
    allIn: null,
    knownPart: 12,
    detail: "Quantity: 1 entry. Known part: $12.",
    missing: "Shipping is not included.",
    group: "incomplete",
  },
  {
    id: "three",
    name: "Three-entry example",
    entries: 3,
    allIn: 24,
    knownPart: 24,
    detail: "Quantity: 3 entries. All-in price: $24, shipping and tax included in this example.",
    missing: null,
    group: "known",
  },
];

export const PROVISIONAL_NOTE =
  "The single-entry example is missing shipping. If that shipping were $5, its all-in total would be $17, and a $12 budget would still leave it out. This recommendation can change when the missing amount is known.";

export type CompareMode = "lowest" | "budget" | "value";
export type OptionMark = "winner" | "tie" | "plain" | "provisional" | "excluded";

export interface RankedOption extends ExampleOption {
  mark: OptionMark;
  label: string | null;
}

export interface CompareView {
  rows: RankedOption[];
  needsBudget: boolean;
  invalidBudget: boolean;
  provisional: boolean;
}

export function parseBudget(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return "invalid";
  return Number(cleaned);
}

function marksFor(ids: string[], label: string): Map<string, { mark: OptionMark; label: string | null }> {
  const map = new Map<string, { mark: OptionMark; label: string | null }>();
  if (ids.length === 1) map.set(ids[0], { mark: "winner", label });
  else for (const id of ids) map.set(id, { mark: "tie", label: `Equal recommendation · ${label}` });
  return map;
}

function rank(items: ExampleOption[], chosen: Map<string, { mark: OptionMark; label: string | null }>, extra: Map<string, { mark: OptionMark; label: string | null }> = new Map()): RankedOption[] {
  return items.map((item) => {
    const mark = chosen.get(item.id) ?? extra.get(item.id) ?? { mark: item.allIn === null ? "provisional" : "plain", label: item.allIn === null ? "Provisional. Ranking can change." : null };
    return { ...item, ...mark };
  });
}

function mailNote(): Map<string, { mark: OptionMark; label: string | null }> {
  return new Map([["mail", { mark: "plain", label: null }]]);
}

export function compareExamples(mode: CompareMode, budget: number | null | "invalid", options: ExampleOption[] = EXAMPLE_OPTIONS): CompareView {
  const provisional = options.some((item) => item.group === "incomplete");
  const postage = mailNote();
  if (mode === "budget") {
    if (budget === "invalid") return { rows: [], needsBudget: false, invalidBudget: true, provisional };
    if (budget === null) return { rows: [], needsBudget: true, invalidBudget: false, provisional };
    const eligible = options.filter((item) => item.group === "known" && item.allIn !== null && item.allIn <= budget);
    const most = eligible.length ? Math.max(...eligible.map((item) => item.entries)) : null;
    const winners = most === null ? [] : eligible.filter((item) => item.entries === most).map((item) => item.id);
    const chosen = winners.length ? marksFor(winners, "Most entries within your budget") : new Map();
    const extra = new Map(postage);
    for (const item of options) {
      if (item.group === "incomplete") extra.set(item.id, { mark: "provisional", label: "Not in this budget check. The total is incomplete." });
      else if (item.group === "known" && item.allIn !== null && item.allIn > budget) extra.set(item.id, { mark: "excluded", label: "Over this budget." });
    }
    return { rows: rank(options, chosen, extra), needsBudget: false, invalidBudget: false, provisional };
  }
  if (mode === "value") {
    const priced = options.filter((item) => item.group === "known" && item.allIn !== null && item.allIn > 0);
    const best = Math.max(...priced.map((item) => item.entries / (item.allIn as number)));
    const winners = priced.filter((item) => item.entries / (item.allIn as number) === best).map((item) => item.id);
    const chosen = marksFor(winners, "Best value per dollar");
    const extra = new Map(postage);
    for (const item of options) {
      if (item.group === "known" && item.allIn === 0) extra.set(item.id, { mark: "plain", label: "No dollar cost, so not ranked per dollar." });
      if (item.group === "incomplete") extra.set(item.id, { mark: "provisional", label: "Provisional. Ranking can change." });
    }
    return { rows: rank(options, chosen, extra), needsBudget: false, invalidBudget: false, provisional };
  }
  const complete = options.filter((item) => item.group === "known" && item.allIn !== null);
  const lowest = Math.min(...complete.map((item) => item.allIn as number));
  const winners = complete.filter((item) => item.allIn === lowest).map((item) => item.id);
  const chosen = marksFor(winners, "Lowest cost");
  const extra = new Map(postage);
  for (const item of options) {
    if (item.group === "incomplete") extra.set(item.id, { mark: "provisional", label: "Provisional. Ranking can change." });
  }
  return { rows: rank(options, chosen, extra), needsBudget: false, invalidBudget: false, provisional };
}
