/**
 * Adapter for filling a free official form from Profile and submitting it.
 * This file is the contract. No submitter module is loaded, and nothing here contacts a sponsor.
 */

export interface SubmitProfile {
  country: string | null;
  state: string | null;
  age: number | null;
  dedicatedEmail: string | null;
}

export interface FreeSubmitRequest {
  officialUrl: string;
  rulesUrl: string | null;
  title: string;
  profile: SubmitProfile;
}

export type FreeSubmitStatus = "entered" | "failed" | "needs_you";

export interface FreeSubmitResult {
  status: FreeSubmitStatus;
  /** True only when the sponsor response confirmed the entry. A click is not confirmation. */
  confirmed: boolean;
  message: string;
}

export interface EntrySubmitter {
  readonly id: string;
  /** Free official forms only. Implementations must refuse payment, checkout, captcha solving, and login bypasses. */
  submitFreeEntry(request: FreeSubmitRequest): Promise<FreeSubmitResult>;
}

/** Name a future package would use. This app does not read the variable and does not load a file. */
export const SUBMITTER_MODULE_ENV = "PRIZE_SCOUT_SUBMITTER_MODULE";

export const SUBMITTER_NEEDS = [
  "A package that exports createSubmitter() and is named by PRIZE_SCOUT_SUBMITTER_MODULE. This app does not load that module.",
  "Profile fields already kept in this tab: country, state, age, and the dedicated email. Missing fields return Needs you.",
  "The official form must already have been fetched. A search snippet is not a form.",
  "Rules must allow automation, and the page must not require a captcha, login, or other verification.",
  "Paid entry, checkout, and card numbers are refused.",
  "Entered is returned only after the sponsor response confirms the submission. A click is not confirmation.",
] as const;

export function practiceSubmitResult(): FreeSubmitResult {
  return {
    status: "needs_you",
    confirmed: false,
    message: "Practice only. No official form was filled, and nothing was submitted.",
  };
}

export function practiceSubmitter(): EntrySubmitter {
  return {
    id: "practice",
    async submitFreeEntry() {
      return practiceSubmitResult();
    },
  };
}

export function disconnectedSubmitter(): EntrySubmitter {
  return {
    id: "not_connected",
    async submitFreeEntry() {
      return {
        status: "failed",
        confirmed: false,
        message: "No entry submitter is connected. Nothing was submitted.",
      };
    },
  };
}

/** Entered is recorded only when the adapter confirms it. An unconfirmed "entered" is treated as Needs you. */
export function applySubmitResult(result: FreeSubmitResult): { markEntered: boolean; label: "Entered" | "Failed" | "Needs you" } {
  if (result.confirmed && result.status === "entered") return { markEntered: true, label: "Entered" };
  if (result.status === "failed") return { markEntered: false, label: "Failed" };
  return { markEntered: false, label: "Needs you" };
}
