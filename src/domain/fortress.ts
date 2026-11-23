import { coarseMonth, type DueProof } from "./dates";
import { opaqueRef } from "./ids";
import type { Contest, Source } from "./types";

export interface EligibleLinkFields {
  sponsorRedacted: string | null;
  publicUrl: string | null;
  coarseDate: string | null;
  entryMethod: string | null;
  channels: Source[];
  opaqueRef: string;
}

export interface FortressProposal {
  email: {
    protocol: "prize-scout-email-cleanup/v1";
    message_type: "link_proposal";
    status: "proposed";
    connected: false;
    transport: null;
    ownerOptIn: false;
    eligible: EligibleLinkFields;
    personalData: null;
    createdAt: string;
  };
  phone: {
    protocol: "prize-fortress-v1";
    message_type: "PRIZE_FORTRESS_PAIR_REQUEST";
    status: "pending";
    ownerConfirmed: false;
    accepted: false;
    connected: false;
    transport: null;
    personalData: null;
    opaqueRef: string;
    createdAt: string;
  };
  connected: false;
  sent: false;
}

export function redactSponsor(sponsor: string | null): string | null {
  if (!sponsor) return null;
  const cleaned = sponsor
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 120) : null;
}

export function eligibleFromContest(contest: Contest | null, ref: string): EligibleLinkFields {
  if (!contest || contest.hubOnly || contest.readiness !== "form_checked") {
    return {
      sponsorRedacted: null,
      publicUrl: null,
      coarseDate: null,
      entryMethod: null,
      channels: [],
      opaqueRef: ref,
    };
  }
  return {
    sponsorRedacted: redactSponsor(contest.sponsor),
    publicUrl: contest.officialUrl,
    coarseDate: coarseMonth(contest.due as DueProof),
    entryMethod: contest.entryMethod,
    channels: [contest.source],
    opaqueRef: ref,
  };
}

export const FORTRESS_DRAFT_BUTTON = "Prepare unpaired Fortress draft";
export const FORTRESS_DRAFT_READY = "Unpaired draft prepared";

export const FORTRESS_DRAFT_EXPLAIN =
  "This prepares an unpaired draft in this tab only. It does not connect Email Fortress, send email, or opt you out. You must return to Prize Scout chat and give explicit pairing consent there. This app will not mark the draft connected.";

export const FORTRESS_DRAFT_NOTICE =
  "Unpaired draft prepared in this tab. It is not connected and nothing was sent. Return to Prize Scout chat for your explicit pairing consent.";

export const IDENTITY_CHAT_LABEL = "Open Prize Scout";

export const IDENTITY_REMOVAL_ASK =
  "Open Prize Scout and ask: After I authorize a form preparation, hand Fortress only the contest provenance, field types, and opaque refs if that lane is paired and handoff is enabled. Do not ask me to re-enter identity it already holds, and do not send a removal from Prize Scout.";

export const IDENTITY_REMOVAL_GUIDANCE =
  "Prize Scout keeps contest details and prepares a form you authorize. Filling is not an entry. When Email or Phone Fortress is paired, handoff is enabled, and that bot has acknowledged the link, Prize Scout makes a redacted handoff right after that preparation. This app has no Fortress transport, so an unpaired or pending draft is not delivered or acknowledged. Post-contest unsubscribe, removal, and rechecks are Fortress’s job. Prize Scout does not send those letters. Fortress reuses the verified identity it already holds. A pairing link is not permission to monitor mail or calls, and it does not mean every company received every field.";

export const CLEANUP_DISABLED_TEXT = "#4d5156";
export const CLEANUP_DISABLED_BG = "#f8f9fa";

export function cleanupRowState(pairing: FortressPairingState): {
  available: boolean;
  title: string;
  condition: string;
  detail: string;
} {
  const available = lanePermitsHandoff(pairing.email) || lanePermitsHandoff(pairing.phone);
  const detail =
    "A paired Fortress bot handles unsubscribe, removal, and follow-up requests with its existing permissions and owner approval settings. Prize Scout supplies entry evidence and does not send these itself. Pairing does not bypass that approval or guarantee removal.";
  return {
    available,
    title: "Unsubscribe, removal, and follow-up letters",
    condition: available
      ? "Handled by the paired Fortress bot. Prize Scout still does not send these."
      : "Requires connected Fortress bots.",
    detail,
  };
}

function channel(hex: string): number {
  const value = Number.parseInt(hex, 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const color = hex.replace("#", "");
    const r = channel(color.slice(0, 2));
    const g = channel(color.slice(2, 4));
    const b = channel(color.slice(4, 6));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lighter = Math.max(lum(foreground), lum(background));
  const darker = Math.min(lum(foreground), lum(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function describeFortressDraft(proposal: FortressProposal): string {
  if (proposal.connected || proposal.email.connected || proposal.phone.connected || proposal.phone.accepted) {
    throw new Error("Fortress draft was labeled as a connection.");
  }
  return `Unpaired draft only. Not a connection. Email ${proposal.email.protocol} ${proposal.email.message_type} is ${proposal.email.status}, connected ${String(proposal.email.connected)}. Phone ${proposal.phone.message_type} is ${proposal.phone.status}, owner confirmed ${String(proposal.phone.ownerConfirmed)}, accepted ${String(proposal.phone.accepted)}.`;
}

export function buildFortressProposal(
  consent: unknown,
  contest: Contest | null,
  now: Date,
): { ok: true; proposal: FortressProposal } | { ok: false; error: string } {
  if (consent !== true) {
    return {
      ok: false,
      error: "No unpaired draft was prepared. Nothing was sent, and Email Fortress was not connected.",
    };
  }
  const ref = opaqueRef();
  const createdAt = now.toISOString();
  const proposal: FortressProposal = {
    email: {
      protocol: "prize-scout-email-cleanup/v1",
      message_type: "link_proposal",
      status: "proposed",
      connected: false,
      transport: null,
      ownerOptIn: false,
      eligible: eligibleFromContest(contest, ref),
      personalData: null,
      createdAt,
    },
    phone: {
      protocol: "prize-fortress-v1",
      message_type: "PRIZE_FORTRESS_PAIR_REQUEST",
      status: "pending",
      ownerConfirmed: false,
      accepted: false,
      connected: false,
      transport: null,
      personalData: null,
      opaqueRef: ref,
      createdAt,
    },
    connected: false,
    sent: false,
  };
  const blob = JSON.stringify(proposal);
  if (blob.includes("@") || blob.includes('"connected":true') || blob.includes('"accepted":true')) {
    return { ok: false, error: "The proposal was refused because it contained a personal detail or a connection flag." };
  }
  if (!redactedPacketIsStrict(proposal)) {
    return { ok: false, error: "The proposal was refused because it was not limited to the redacted handoff." };
  }
  return { ok: true, proposal };
}

const ELIGIBLE_KEYS = ["channels", "coarseDate", "entryMethod", "opaqueRef", "publicUrl", "sponsorRedacted"];
const BANNED_KEYS = new Set([
  "name",
  "fullname",
  "legalname",
  "firstname",
  "lastname",
  "birthdate",
  "dateofbirth",
  "dob",
  "ssn",
  "socialsecurity",
  "governmentid",
  "govtid",
  "password",
  "address",
  "street",
  "postalcode",
  "zip",
  "card",
  "cvv",
  "personalemail",
]);

function collectKeys(value: unknown, found: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, found);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    found.push(key.toLowerCase());
    collectKeys(child, found);
  }
}

export interface FortressLaneState {
  linked: boolean;
  handoffEnabled: boolean;
  recipientAcknowledged: boolean;
}

export interface FortressPairingState {
  email: FortressLaneState;
  phone: FortressLaneState;
}

export function unpairedFortress(): FortressPairingState {
  return {
    email: { linked: false, handoffEnabled: false, recipientAcknowledged: false },
    phone: { linked: false, handoffEnabled: false, recipientAcknowledged: false },
  };
}

export function lanePermitsHandoff(lane: FortressLaneState): boolean {
  return lane.linked === true && lane.handoffEnabled === true && lane.recipientAcknowledged === true;
}

export interface PreparationObservation {
  observation: "form_prepared" | "entered";
  observedAt: string;
  contest: Contest;
  fieldTypes: readonly string[];
  emailSupplied: boolean | "unknown";
  phoneSupplied: boolean | "unknown";
  aliasApproved: boolean;
}

export interface RedactedEntryHandoff {
  observation: "form_prepared" | "entered";
  observedAt: string;
  sponsorRedacted: string | null;
  publicUrl: string;
  coarseDate: string | null;
  entryMethod: string;
  channels: Source[];
  opaqueRef: string;
  fieldTypes: string[];
  emailSupplied: boolean | "unknown";
  phoneSupplied: boolean | "unknown";
  aliasApproved: boolean;
  personalData: null;
  delivered: false;
  acknowledged: false;
  status: "unverified";
}

export type HandoffAttempt =
  | {
      created: false;
      delivered: false;
      acknowledged: false;
      reason: "pairing_not_permitted" | "redaction_refused";
      status: "not_sent";
    }
  | {
      created: true;
      delivered: false;
      acknowledged: false;
      reason: "no_transport_ack";
      status: "unverified";
      lanes: Array<"email" | "phone">;
      handoff: RedactedEntryHandoff;
    };

const FIELD_TYPE = /^(email|phone|name|postal-address|alias|age)$/;

function safeFieldTypes(types: readonly string[]): string[] | null {
  const kept: string[] = [];
  for (const type of types) {
    if (!FIELD_TYPE.test(type) || kept.includes(type)) return null;
    kept.push(type);
  }
  return kept;
}

export function handoffAfterPreparation(pairing: FortressPairingState, prep: PreparationObservation): HandoffAttempt {
  const lanes = (["email", "phone"] as const).filter((lane) => lanePermitsHandoff(pairing[lane]));
  if (lanes.length === 0) {
    return { created: false, delivered: false, acknowledged: false, reason: "pairing_not_permitted", status: "not_sent" };
  }
  const fieldTypes = safeFieldTypes(prep.fieldTypes);
  if (!fieldTypes) {
    return { created: false, delivered: false, acknowledged: false, reason: "redaction_refused", status: "not_sent" };
  }
  const handoff: RedactedEntryHandoff = {
    observation: prep.observation,
    observedAt: prep.observedAt,
    sponsorRedacted: redactSponsor(prep.contest.sponsor),
    publicUrl: prep.contest.officialUrl,
    coarseDate: coarseMonth(prep.contest.due),
    entryMethod: prep.contest.entryMethod,
    channels: [prep.contest.source],
    opaqueRef: opaqueRef(),
    fieldTypes,
    emailSupplied: prep.emailSupplied,
    phoneSupplied: prep.phoneSupplied,
    aliasApproved: prep.aliasApproved === true,
    personalData: null,
    delivered: false,
    acknowledged: false,
    status: "unverified",
  };
  const blob = JSON.stringify(handoff);
  if (blob.includes("@") || /\b\d{3}-\d{2}-\d{4}\b/.test(blob) || /password|card number|\bssn\b/i.test(blob)) {
    return { created: false, delivered: false, acknowledged: false, reason: "redaction_refused", status: "not_sent" };
  }
  return { created: true, delivered: false, acknowledged: false, reason: "no_transport_ack", status: "unverified", lanes, handoff };
}

export function describeHandoffAttempt(attempt: HandoffAttempt): string {
  if (!attempt.created) {
    const why =
      attempt.reason === "redaction_refused"
        ? "The preparation included a value that cannot be put in a redacted handoff."
        : "Pairing is not enabled and acknowledged, so nothing was delivered or acknowledged.";
    return `No Fortress handoff was created. ${why} Post-contest cleanup stays with Fortress.`;
  }
  const observed = attempt.handoff.observation === "form_prepared" ? "Form prepared, not entered." : "Entered status was observed.";
  return `A redacted handoff was prepared for ${attempt.lanes.join(" and ")}. It was not delivered and no receipt was acknowledged, because this app has no Fortress transport. ${observed} Post-contest cleanup stays with Fortress.`;
}

/** Existing @ / connected / accepted checks stay in buildFortressProposal. This adds an allowlist. */
export function redactedPacketIsStrict(proposal: FortressProposal): boolean {
  const eligibleKeys = Object.keys(proposal.email.eligible).sort();
  if (eligibleKeys.join() !== [...ELIGIBLE_KEYS].sort().join()) return false;
  if (proposal.email.personalData !== null || proposal.phone.personalData !== null) return false;
  if (proposal.email.ownerOptIn !== false || proposal.connected !== false || proposal.sent !== false) return false;
  const keys: string[] = [];
  collectKeys(proposal, keys);
  if (keys.some((key) => BANNED_KEYS.has(key))) return false;
  const eligibleBlob = JSON.stringify(proposal.email.eligible);
  if (eligibleBlob.includes("@") || /\b\d{3}-\d{2}-\d{4}\b/.test(eligibleBlob)) return false;
  return true;
}
