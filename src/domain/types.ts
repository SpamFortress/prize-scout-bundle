import type { DueProof } from "./dates";
import type { EntryClock, RulesZone } from "./entry-clock";
import type { ObservedImage } from "./observations";

export const SOURCES = ["web", "x", "facebook", "instagram"] as const;
export type Source = (typeof SOURCES)[number];

export const RESTRICTIONS = [
  "no_automation",
  "purchase_required",
  "one_entry_per_person",
  "mail_in_only",
  "skill_required",
  "social_action_required",
] as const;
export type Restriction = (typeof RESTRICTIONS)[number];

export type EntryCost = "free" | "paid" | "unknown";
export type Readiness = "hub_only" | "fetched" | "rules_found" | "form_checked";
export type SortKey = "relevance" | "new" | "oldest" | "ending" | "ending-latest";
export type EntryCostFilter = "all" | "free" | "paid";

export interface ExplicitMoney {
  amount: number;
  currency: string;
  explicit: true;
}

export interface ContestLimits {
  countries: string[];
  /** States named as eligible. An empty list means the page did not give an eligible-state list. */
  states: string[];
  /** States the page excludes, such as Idaho. Not the eligible list. */
  excludedStates?: string[];
  minAge: number | null;
  maxAge: number | null;
}

export type RuleFrequency = "daily" | "weekly" | "once" | "unstated";

export interface MailInFacts {
  addressLines: string[];
  requiredFields: string[];
}

/** Mail-in or AMOE facts copied from the rules. Null fields were not on the page. */
export interface MailAmoe {
  addressLines: string[];
  cardSize: string | null;
  postmarkBy: string | null;
  receivedBy: string | null;
  entryLimit: string | null;
}

/** Read from fetched page text. Missing fields stay empty. Nothing here is invented. */
export interface RulesFacts {
  frequency: RuleFrequency;
  frequencyQuote: string | null;
  minAge: number | null;
  ageQuote: string | null;
  endDateText: string | null;
  countries: string[];
  includedStates: string[];
  excludedStates: string[];
  eligibilityQuote: string | null;
  automationProhibited: boolean;
  automationQuote: string | null;
  purchaseRequired: boolean;
  freeEntryStated: boolean;
  mailOffered: boolean;
  mailIn: MailInFacts | null;
  mailAmoe: MailAmoe | null;
  /** Set when the page requires a captcha or a login. Those block automatic entry. */
  verificationBlock: "captcha" | "login" | null;
  /** The rules say the prize transfers through a licensed dealer or FFL. */
  dealerPickup: boolean;
  dealerPickupQuote: string | null;
}

export interface Contest {
  id: string;
  source: Source;
  title: string;
  shortDescription: string;
  /** Prize description copied from a prize/product section. Not rules text. Null when that section was not on the page. */
  pageObservedDetailedDescription?: string | null;
  /** True only when the prize-section extractor stored this text. Older paragraphs are not upgraded. */
  pageObservedDescriptionKind?: "prize" | null;
  pageObservedDescriptionTruncated?: boolean;
  pageObservedDescriptionLimit?: number;
  pageObservedGallery?: ObservedImage[];
  /** gallery: images were inside a prize or product gallery. summary: only the page summary image or a prize figure. */
  pageObservedGalleryKind?: "gallery" | "summary" | null;
  /** First request that checked this page. Later checks do not replace it. */
  checkedDuringRequestId?: string | null;
  /** True when this page was checked before any request was prepared. Later checks do not clear it. */
  checkedWithoutRequest?: boolean;
  officialUrl: string;
  rulesUrl: string | null;
  imageUrl: string | null;
  sponsor: string | null;
  prizeValue: ExplicitMoney | null;
  due: DueProof;
  entryCost: EntryCost;
  entryMethod: string;
  limits: ContestLimits;
  restrictions: Restriction[];
  redFlags: string[];
  publishedAt: string | null;
  readiness: Readiness;
  formChecked: boolean;
  rulesChecked: boolean;
  hubOnly: boolean;
  evidence: {
    evidenceUrl: string;
    fetchedAt: string;
    tool: string;
    schemaChecked: true;
  };
  /** Present when this contest was built by reading HTML. Tool payloads cannot set it. */
  rulesFacts?: RulesFacts;
  /** Giveaway details found in this page's own text. Set only by the HTML reader. */
  contestMarkers?: ContestMarkers;
  /** Set when this page's own text was the rules. Null when this page had no rules text. */
  rulesChecklist?: { found: number; missing: string[]; registrationNote: string | null } | null;
  /** Phrases on this page that ask for a fee, a secret, or a private message to collect a prize. */
  scamPhrases?: string[];
  /** An entry widget was embedded. The form itself was not in the HTML. */
  pageObservedWidget?: boolean;
  /** Entries are earned by buying: per dollar, merch, membership, or an order. */
  pageObservedPurchaseEntry?: boolean;
  /** The page states a free method, including “no purchase necessary” or mail-in. */
  pageObservedFreeMethod?: boolean;
  /** An outbound link looks like an entry, rules, or contest page. */
  pageObservedEntryLink?: boolean;
  winnersListUrl?: string | null;
  entryClock?: EntryClock;
  rulesTimeZone?: RulesZone;
  /** Days after the end date before a cleanup handoff is prepared. Assumed when the rules do not say. */
  winnerNotice?: { days: number; assumed: boolean };
  instantWin?: boolean;
  /** Calendar date the rules text was read. Null when rules were not read. */
  rulesReadOn?: string | null;
}

export interface ContestMarkers {
  noPurchaseNecessary: boolean;
  eligibility: boolean;
  entryPeriod: boolean;
  winnerSelection: boolean;
  odds: boolean;
  prizeValue: boolean;
  sponsor: boolean;
  specificPrize: boolean;
  specificDates: boolean;
  ownEntry: boolean;
  /** How-to, winner story, press release, listicle, or homepage. Never Verified. */
  disqualified: boolean;
  /** Disqualified only because a shop page embeds an entry widget and Add to cart, with no free entry and no end date on that page. */
  shopWidgetOnly: boolean;
}

export interface RuleProof {
  id: string;
  contestId: string;
  checkedAt: string;
  officialUrl: string;
  httpStatus: number | null;
  rulesLinkFound: boolean;
  formFound: boolean;
  hubOnly: boolean;
  ready: boolean;
  notes: string[];
}

export interface EligibilityResult {
  status: "eligible" | "ineligible" | "unknown";
  reasons: string[];
}

export interface ContestView extends Contest {
  eligibility: EligibilityResult;
  relevance: number;
  latestProof: RuleProof | null;
  daysLeft: number | null;
  daysLeftLabel: string;
}

export const CHAT_URL = "grokbot://app/v1/agent?id=local-practice";
export const PREVIEW_URL = "https://example.com/prize-scout-preview";
