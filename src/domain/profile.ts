import { isCountryCode, isUsState } from "./geo";

export type EmailMode = "dedicated" | "personal" | "fortress";

/** Tab memory only. This object is not written to disk or browser storage. */
export interface SessionProfile {
  country: string | null;
  state: string | null;
  age: number | null;
  emailMode: EmailMode;
  dedicatedEmail: string | null;
  fortressDraftPrepared: boolean;
  fortressConnected: false;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORBIDDEN_KEY = /password|secret|token|ssn|social|card|cvv|cvc|pan|pin|address|street|name|personalemail|phone|birth|dob|government|govtid/i;

export function defaultProfile(): SessionProfile {
  return {
    country: null,
    state: null,
    age: null,
    emailMode: "dedicated",
    dedicatedEmail: null,
    fortressDraftPrepared: false,
    fortressConnected: false,
  };
}

export function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0 && digits.length > 1;
}

export function containsSecret(value: string): string | null {
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(value)) return "A social security number is not accepted.";
  const digits = value.replace(/[ -]/g, "");
  if (/^\d{13,19}$/.test(digits) && luhn(digits)) return "A card number is not accepted.";
  return null;
}

export function profileIsNotSaved(): { saved: false; reason: string } {
  return {
    saved: false,
    reason:
      "Country, state, age, and email stay in this tab's memory only. They are not written to browser storage or the server.",
  };
}

export function updateSessionProfile(
  current: SessionProfile,
  patch: unknown,
): { ok: true; profile: SessionProfile } | { ok: false; errors: string[] } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, errors: ["Profile update was empty."] };
  }
  const body = patch as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_KEY.test(key) || !["country", "state", "age", "emailMode", "dedicatedEmail", "fortressDraftPrepared"].includes(key)) {
      errors.push(`Field ${key} is not accepted.`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const next: SessionProfile = { ...current, fortressConnected: false };

  if ("country" in body) {
    if (body.country === null || body.country === "") next.country = null;
    else if (typeof body.country === "string" && isCountryCode(body.country)) next.country = body.country.toUpperCase();
    else errors.push("Country must be a real ISO code or empty.");
  }
  if ("state" in body) {
    if (body.state === null || body.state === "") next.state = null;
    else if (typeof body.state === "string" && isUsState(body.state)) next.state = body.state.toUpperCase();
    else errors.push("State must be a US postal code or empty.");
  }
  if (next.country !== "US") next.state = null;

  if ("age" in body) {
    if (body.age === null || body.age === "") next.age = null;
    else if (typeof body.age === "number" && Number.isInteger(body.age) && body.age >= 1 && body.age <= 120) {
      next.age = body.age;
    } else errors.push("Age must be a whole number from 1 to 120, or empty.");
  }

  if ("dedicatedEmail" in body) {
    if (body.dedicatedEmail === null || body.dedicatedEmail === "") next.dedicatedEmail = null;
    else if (typeof body.dedicatedEmail !== "string") errors.push("Dedicated email must be text.");
    else {
      const email = body.dedicatedEmail.trim();
      const secret = containsSecret(email);
      if (secret) errors.push(secret);
      else if (!EMAIL.test(email) || email.length > 254) errors.push("Enter an existing dedicated email address, or leave it blank.");
      else next.dedicatedEmail = email;
    }
  }

  if ("emailMode" in body) {
    if (body.emailMode === "dedicated") next.emailMode = "dedicated";
    else if (body.emailMode === "personal") next.emailMode = "personal";
    else if (body.emailMode === "fortress") {
      errors.push("Email Fortress is not connected. An unpaired draft does not turn the link on.");
    } else errors.push("Email choice was not recognized.");
  }

  if ("fortressDraftPrepared" in body) {
    if (body.fortressDraftPrepared === true) next.fortressDraftPrepared = true;
    else errors.push("An unpaired draft cannot be turned into a connection from this form.");
  }

  next.fortressConnected = false;
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, profile: next };
}
