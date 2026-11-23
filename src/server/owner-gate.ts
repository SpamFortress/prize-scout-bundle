import { timingSafeEqual } from "node:crypto";

/** True only when the provided token matches PRIZE_SCOUT_OWNER_TOKEN. An empty expected token never matches. */
export function ownerTokenMatches(provided: string | null | undefined): boolean {
  const expected = process.env.PRIZE_SCOUT_OWNER_TOKEN ?? "";
  const got = provided ?? "";
  if (!expected || !got) return false;
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
