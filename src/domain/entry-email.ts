import { sha256Hex } from "./sha256";

export type EmailChoice = "dedicated" | "fortress" | "personal";

export const PERSONAL_EMAIL_WARNING = "Sweepstakes lists are often sold. Personal email is not the default.";

const PLUS_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "fastmail.com",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "hey.com",
  "yahoo.com",
]);

export function supportsPlusAddressing(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return PLUS_DOMAINS.has(domain);
}

/** Stable for one sponsor. A different sponsor cannot receive the same tag. */
export function sponsorTag(sponsor: string): string {
  const slug = sponsor.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "sponsor";
  return `${slug}${sha256Hex(sponsor.trim().toLowerCase()).slice(0, 6)}`;
}

export function taggedEmail(base: string, sponsor: string, plusRejected = false): { email: string; note: string | null } {
  const trimmed = base.trim();
  if (!trimmed.includes("@")) return { email: trimmed, note: null };
  const plain = untagged(trimmed);
  if (plusRejected) return { email: plain, note: "This form rejects plus addresses, so the untagged address is used." };
  if (!supportsPlusAddressing(plain)) return { email: plain, note: null };
  const [local, domain] = plain.split("@");
  return { email: `${local}+${sponsorTag(sponsor)}@${domain}`, note: null };
}

function untagged(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.split("+")[0]}@${domain}`;
}
