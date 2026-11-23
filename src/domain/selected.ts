import { daysUntil, type DueProof } from "./dates";
import { assessEligibility, type EligibilityProfile } from "./eligibility";
import { stableId, uniqueId } from "./ids";
import { contestIsEntryReady } from "./normalize";
import type { Contest } from "./types";

export interface CheckpointRecord {
  checkpoint: "rules" | "automation";
  status: "pass" | "blocked" | "incomplete";
  checkedAt: string;
  findings: string[];
  submissionAllowed: false;
}

export interface AutofillRequest {
  requestedAt: string;
  observation: "form_prepared";
  status: "not_submitted";
  reason: "connector_not_available";
  nextDue: DueProof;
  submitted: false;
}

export interface SelectedEntry {
  id: string;
  contestId: string;
  contest: Contest;
  selectedAt: string;
  rules: CheckpointRecord | null;
  automation: CheckpointRecord | null;
  nextDue: DueProof;
  autofill: AutofillRequest | null;
}

export interface TrackedEntry {
  id: string;
  contestId: string;
  title: string;
  officialUrl: string;
  source: Contest["source"];
  recordedAt: string;
  observation: "form_prepared";
  nextDue: DueProof;
  sponsorSubmission: "not_submitted";
  submitted: false;
}

/** A fetched official page can be saved before a form is prepared. A directory cannot. */
export function canSaveContest(contest: Contest): boolean {
  return contest.evidence.schemaChecked === true && !contest.hubOnly && contest.readiness !== "hub_only";
}

export interface PreparationEvidence {
  contestId: string;
  rules: CheckpointRecord | null;
  automation: CheckpointRecord | null;
  autofill: AutofillRequest | null;
}

function hasPreparation(entry: Pick<SelectedEntry, "rules" | "automation" | "autofill">): boolean {
  return entry.rules !== null || entry.automation !== null || entry.autofill !== null;
}

/** Checking the box adds the contest to Saved immediately. Entries are not an argument and are not created. */
export function addSavedContest(
  saved: readonly SelectedEntry[],
  preparations: readonly PreparationEvidence[],
  contest: Contest,
  now: Date,
): { ok: true; saved: SelectedEntry[]; preparations: PreparationEvidence[] } | { ok: false; error: string } {
  const created = saveContest(contest, now);
  if (!created.ok) return created;
  if (saved.some((item) => item.contestId === contest.id)) {
    return { ok: true, saved: [...saved], preparations: [...preparations] };
  }
  const prior = preparations.find((item) => item.contestId === contest.id);
  const entry: SelectedEntry = prior
    ? { ...created.entry, rules: prior.rules, automation: prior.automation, autofill: prior.autofill }
    : created.entry;
  return { ok: true, saved: [...saved, entry], preparations: [...preparations] };
}

/** Unchecking removes the bookmark only. Preparation already stored on that bookmark is kept for a later check. */
export function removeSavedContest(
  saved: readonly SelectedEntry[],
  preparations: readonly PreparationEvidence[],
  contestId: string,
): { saved: SelectedEntry[]; preparations: PreparationEvidence[] } {
  const existing = saved.find((item) => item.contestId === contestId);
  const nextPreparations = existing && hasPreparation(existing)
    ? [
        ...preparations.filter((item) => item.contestId !== contestId),
        {
          contestId,
          rules: existing.rules,
          automation: existing.automation,
          autofill: existing.autofill,
        },
      ]
    : [...preparations];
  return {
    saved: saved.filter((item) => item.contestId !== contestId),
    preparations: nextPreparations,
  };
}

export function saveContest(contest: Contest, now: Date): { ok: true; entry: SelectedEntry } | { ok: false; error: string } {
  if (!canSaveContest(contest)) {
    return { ok: false, error: "A directory or unverified page cannot be saved." };
  }
  return {
    ok: true,
    entry: {
      id: stableId(["saved", contest.id]),
      contestId: contest.id,
      contest,
      selectedAt: now.toISOString(),
      rules: null,
      automation: null,
      nextDue: contest.due,
      autofill: null,
    },
  };
}

/** Backwards-compatible name. Saving does not create an entry. */
export const createSelectedEntry = saveContest;

export function runRulesCheckpoint(entry: SelectedEntry, profile: EligibilityProfile, now: Date): SelectedEntry {
  const findings: string[] = [];
  const contest = entry.contest;
  let status: CheckpointRecord["status"] = "pass";
  if (!contestIsEntryReady(contest)) {
    status = "incomplete";
    findings.push("The official form and rules were not both observed on the sponsor page.");
  }
  if (contest.due.proven && (daysUntil(contest.due, now) ?? 0) < 0) {
    status = "blocked";
    findings.push("The stated end date has passed.");
  }
  const eligibility = assessEligibility(contest, profile, now);
  findings.push(...eligibility.reasons);
  if (eligibility.status === "ineligible") status = "blocked";
  else if (eligibility.status === "unknown" && status === "pass") status = "incomplete";
  if (!contest.rulesUrl) {
    status = status === "blocked" ? "blocked" : "incomplete";
    findings.push("No official rules URL was observed.");
  }
  for (const flag of contest.redFlags) findings.push(`Page states: ${flag}`);
  findings.push("Rule check does not submit an entry.");
  return {
    ...entry,
    rules: { checkpoint: "rules", status, checkedAt: now.toISOString(), findings, submissionAllowed: false },
  };
}

export function runAutomationCheckpoint(entry: SelectedEntry, now: Date): SelectedEntry {
  const findings = [
    "This build does not submit entries to sponsors.",
    "This build does not solve CAPTCHAs.",
  ];
  let status: CheckpointRecord["status"] = "pass";
  if (!entry.rules || entry.rules.status !== "pass") {
    status = "blocked";
    findings.push("Rule analysis has not passed, so automation stays blocked.");
  }
  const blocking = entry.contest.restrictions.filter((item) =>
    ["no_automation", "purchase_required", "mail_in_only", "skill_required", "social_action_required"].includes(item),
  );
  if (blocking.length > 0) {
    status = "blocked";
    findings.push(`The page states restrictions that block automation: ${blocking.join(", ")}.`);
  }
  return {
    ...entry,
    automation: { checkpoint: "automation", status, checkedAt: now.toISOString(), findings, submissionAllowed: false },
  };
}

export function requestAutofill(entry: SelectedEntry, now: Date): { ok: true; entry: SelectedEntry } | { ok: false; error: string } {
  if (!entry.rules || entry.rules.status !== "pass") {
    return { ok: false, error: "Run the rule check first. Automatic fill was not requested." };
  }
  if (!entry.automation || entry.automation.status !== "pass") {
    return { ok: false, error: "Run the automation check first. It is separate from the rule check. Nothing was submitted." };
  }
  if (!entry.nextDue.proven) {
    return { ok: false, error: "No explicit end date was observed, so there is no next-due proof. Nothing was submitted." };
  }
  if ((daysUntil(entry.nextDue, now) ?? -1) < 0) {
    return { ok: false, error: "The stated end date has passed. Nothing was submitted." };
  }
  return {
    ok: true,
    entry: {
      ...entry,
      autofill: {
        requestedAt: now.toISOString(),
        observation: "form_prepared",
        status: "not_submitted",
        reason: "connector_not_available",
        nextDue: entry.nextDue,
        submitted: false,
      },
    },
  };
}

/**
 * Starts the checks this app can do. It never records an Entries row and never sets submitted.
 * A missing connector stays a handoff: the person can open the official page and take over.
 */
export function beginPermittedFill(
  entry: SelectedEntry,
  profile: EligibilityProfile,
  now: Date,
): { entry: SelectedEntry; message: string; submitted: false } {
  if (entry.autofill?.submitted === false) {
    return {
      entry,
      submitted: false,
      message: "Form prepared, not entered. Prize Scout cannot fully fill this form yet. You can take over on the official page. Nothing was submitted.",
    };
  }
  if (!contestIsEntryReady(entry.contest)) {
    return {
      entry,
      submitted: false,
      message: "A form and official rules were not both observed, so Prize Scout cannot start filling. Nothing was submitted. You can open the page and take over.",
    };
  }
  const ruled = runRulesCheckpoint(entry, profile, now);
  if (!ruled.rules || ruled.rules.status !== "pass") {
    return {
      entry: ruled,
      submitted: false,
      message: "The rule check did not pass, so filling was not requested. Nothing was submitted. You can open the official page and take over.",
    };
  }
  const automated = runAutomationCheckpoint(ruled, now);
  const filled = requestAutofill(automated, now);
  if (!filled.ok) {
    return {
      entry: automated,
      submitted: false,
      message: `${filled.error} You can open the official page and take over.`,
    };
  }
  return {
    entry: filled.entry,
    submitted: false,
    message: "Form prepared, not entered. Prize Scout has no connector to finish the sponsor form. You can take over on the official page. Nothing was submitted.",
  };
}

export function recordLocalEntry(entry: SelectedEntry, now: Date): { ok: true; tracked: TrackedEntry } | { ok: false; error: string } {
  if (!entry.rules || entry.rules.status !== "pass") {
    return { ok: false, error: "A local entry is not recorded until the rule check passes. Nothing was sent to the sponsor." };
  }
  return {
    ok: true,
    tracked: {
      id: stableId(["entry", entry.contestId]),
      contestId: entry.contestId,
      title: entry.contest.title,
      officialUrl: entry.contest.officialUrl,
      source: entry.contest.source,
      recordedAt: now.toISOString(),
      observation: "form_prepared",
      nextDue: entry.nextDue,
      sponsorSubmission: "not_submitted",
      submitted: false,
    },
  };
}

export function newProofId(): string {
  return uniqueId("proof");
}
