import { parseDueDate, type DueProof } from "./dates";
import { stableId } from "./ids";
import {
  PRIZE_DESCRIPTION_LIMIT,
  PRIZE_DESCRIPTION_NOT_CAPTURED,
  PRIZE_DESCRIPTION_REMAINDER,
  type ObservedImage,
} from "./observations";
import { SOURCES, RESTRICTIONS, type Contest, type EntryCost, type Readiness, type Restriction, type Source } from "./types";

export interface ObservedPayload {
  title: string;
  shortDescription: string;
  pageObservedDetailedDescription?: string | null;
  officialUrl: string;
  rulesUrl: string | null;
  imageUrl: string | null;
  sponsor: string | null;
  prizeValue: { amount: number; currency: string; explicit: boolean } | null;
  endDate: string | null;
  entryCost: EntryCost;
  entryMethod: string;
  limits: Contest["limits"];
  restrictions: string[];
  redFlags: string[];
  publishedAt: string | null;
  source: Source;
  formFound: boolean;
  rulesLinkFound: boolean;
  hubOnly: boolean;
}

export type NormalizeResult =
  | { ok: true; contest: Contest; warnings: string[] }
  | { ok: false; error: string };

function cleanGallery(value: unknown, evidenceUrl: string): ObservedImage[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const images: ObservedImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { url?: unknown; alt?: unknown; caption?: unknown };
    const url = httpsUrl(record.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push({
      url,
      alt: cleanText(record.alt, 300),
      caption: cleanText(record.caption, 300),
      evidenceUrl,
    });
    if (images.length >= 24) break;
  }
  return images;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.includes("<")) return null;
  return text.slice(0, max);
}

export function sealReadiness(input: { formFound: boolean; rulesLinkFound: boolean; hubOnly: boolean }): {
  readiness: Readiness;
  formChecked: boolean;
  rulesChecked: boolean;
  hubOnly: boolean;
} {
  const hubOnly = input.hubOnly;
  const formChecked = input.formFound && !hubOnly;
  const rulesChecked = input.rulesLinkFound && !hubOnly;
  const ready = formChecked && rulesChecked;
  return {
    hubOnly,
    formChecked,
    rulesChecked,
    readiness: ready ? "form_checked" : hubOnly ? "hub_only" : rulesChecked ? "rules_found" : "fetched",
  };
}

export function contestIsEntryReady(contest: Contest): boolean {
  return contest.readiness === "form_checked" && contest.formChecked && contest.rulesChecked && !contest.hubOnly;
}

export const DETAILS_NOT_CAPTURED = PRIZE_DESCRIPTION_NOT_CAPTURED;

export interface PrizeDescriptionView {
  text: string;
  remainder: boolean;
}

/** Shows prize-section text only. A stored paragraph without kind "prize" is not treated as the full description. */
export function prizeDescriptionView(
  contest: Pick<Contest, "pageObservedDetailedDescription" | "pageObservedDescriptionKind" | "pageObservedDescriptionTruncated">,
): PrizeDescriptionView {
  if (contest.pageObservedDescriptionKind !== "prize") {
    return { text: PRIZE_DESCRIPTION_NOT_CAPTURED, remainder: false };
  }
  const text = contest.pageObservedDetailedDescription?.trim() ?? "";
  if (!text) return { text: PRIZE_DESCRIPTION_NOT_CAPTURED, remainder: false };
  return { text, remainder: contest.pageObservedDescriptionTruncated === true };
}

export function observedDetail(
  contest: Pick<Contest, "pageObservedDetailedDescription" | "pageObservedDescriptionKind" | "pageObservedDescriptionTruncated">,
): string {
  const view = prizeDescriptionView(contest);
  if (!view.remainder) return view.text;
  return `${view.text}\n\n${PRIZE_DESCRIPTION_REMAINDER}`;
}

export function normalizeVerifiedToolResult(input: unknown, now: Date): NormalizeResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Tool result was empty." };
  const envelope = input as Record<string, unknown>;
  if (envelope.verified !== true) {
    return { ok: false, error: "Unverified tool output is not turned into a contest." };
  }
  const evidenceUrl = httpsUrl(envelope.evidenceUrl);
  if (!evidenceUrl) return { ok: false, error: "The tool result had no https evidence URL." };
  const payload = envelope.payload;
  if (!payload || typeof payload !== "object") return { ok: false, error: "The tool result had no payload." };
  return payloadToContest(payload as Record<string, unknown>, evidenceUrl, now, String(envelope.tool ?? "evidence.fetch"));
}

function payloadToContest(payload: Record<string, unknown>, evidenceUrl: string, now: Date, tool: string): NormalizeResult {
  const warnings: string[] = [];
  const title = cleanText(payload.title, 180);
  if (!title) return { ok: false, error: "The page had no title, so no contest was recorded." };
  const officialUrl = httpsUrl(payload.officialUrl) ?? evidenceUrl;
  const source = (SOURCES as readonly string[]).includes(String(payload.source)) ? (payload.source as Source) : "web";
  const description = cleanText(payload.shortDescription, 600) ?? "The fetched page did not include a short description.";
  const prizeKind = payload.pageObservedDescriptionKind === "prize";
  const prizeRaw = prizeKind && typeof payload.pageObservedDetailedDescription === "string" ? payload.pageObservedDetailedDescription.trim() : "";
  const prizeTruncated = prizeKind && (payload.pageObservedDescriptionTruncated === true || prizeRaw.length > PRIZE_DESCRIPTION_LIMIT);
  const prizeText = prizeKind && prizeRaw ? prizeRaw.slice(0, PRIZE_DESCRIPTION_LIMIT) : null;
  const seal = sealReadiness({
    formFound: payload.formFound === true,
    rulesLinkFound: payload.rulesLinkFound === true,
    hubOnly: payload.hubOnly === true || source !== "web",
  });
  if (seal.hubOnly) warnings.push("Directory and social pages are not official entry forms.");

  let prizeValue: Contest["prizeValue"] = null;
  const rawPrize = payload.prizeValue;
  if (rawPrize && typeof rawPrize === "object") {
    const prize = rawPrize as Record<string, unknown>;
    const amount = prize.amount;
    const currency = typeof prize.currency === "string" ? prize.currency.toUpperCase() : "";
    if (prize.explicit === true && typeof amount === "number" && Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 && /^[A-Z]{3}$/.test(currency)) {
      prizeValue = { amount, currency, explicit: true };
    } else if (prize.explicit !== true) {
      warnings.push("A prize amount was present but not explicitly marked, so no value is shown.");
    } else {
      warnings.push("The prize amount could not be read, so no value is shown.");
    }
  }

  const due: DueProof = parseDueDate(typeof payload.endDate === "string" ? payload.endDate : null);
  if (!due.proven && payload.endDate) warnings.push("The end date was not explicit enough to use.");

  const entryCost: EntryCost = payload.entryCost === "free" || payload.entryCost === "paid" ? payload.entryCost : "unknown";
  const restrictions = Array.isArray(payload.restrictions)
    ? payload.restrictions.filter((item): item is Restriction => (RESTRICTIONS as readonly string[]).includes(String(item)))
    : [];
  const redFlags = Array.isArray(payload.redFlags)
    ? payload.redFlags
        .map((item) => cleanText(item, 200))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8)
    : [];
  const limitsIn = (payload.limits ?? {}) as Record<string, unknown>;
  const countries = Array.isArray(limitsIn.countries)
    ? limitsIn.countries.filter((item): item is string => typeof item === "string").map((item) => item.toUpperCase()).slice(0, 40)
    : [];
  const states = Array.isArray(limitsIn.states)
    ? limitsIn.states.filter((item): item is string => typeof item === "string").map((item) => item.toUpperCase()).slice(0, 60)
    : [];
  const age = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 120 ? value : null);

  const contest: Contest = {
    id: stableId(["contest", source, officialUrl]),
    source,
    title,
    shortDescription: description,
    pageObservedDetailedDescription: prizeText,
    pageObservedDescriptionKind: prizeKind ? "prize" : null,
    pageObservedDescriptionTruncated: prizeTruncated,
    pageObservedDescriptionLimit: PRIZE_DESCRIPTION_LIMIT,
    pageObservedGallery: cleanGallery(payload.pageObservedGallery, evidenceUrl),
    pageObservedGalleryKind: payload.pageObservedGalleryKind === "gallery" || payload.pageObservedGalleryKind === "summary" ? payload.pageObservedGalleryKind : null,
    officialUrl,
    rulesUrl: httpsUrl(payload.rulesUrl),
    imageUrl: httpsUrl(payload.imageUrl),
    sponsor: cleanText(payload.sponsor, 120),
    prizeValue,
    due,
    entryCost,
    entryMethod: cleanText(payload.entryMethod, 400) ?? "Entry method was not stated on the fetched page.",
    limits: {
      countries,
      states,
      minAge: age(limitsIn.minAge),
      maxAge: age(limitsIn.maxAge),
    },
    restrictions,
    redFlags,
    publishedAt: typeof payload.publishedAt === "string" && parseDueDate(payload.publishedAt).proven ? payload.publishedAt : null,
    ...seal,
    evidence: {
      evidenceUrl,
      fetchedAt: now.toISOString(),
      tool,
      schemaChecked: true,
    },
  };
  return { ok: true, contest, warnings };
}
