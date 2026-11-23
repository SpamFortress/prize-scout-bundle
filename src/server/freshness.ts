import { entryFormGoneNote, entrySectionPresent, needsSponsorRefetch } from "@/domain/verification-checks";
import type { VerifiedPracticeRow } from "@/domain/verified-entry";
import { checkOfficialPage, type CheckDeps } from "./check-page";

/** Fetches the sponsor page again when the stored row is stale or ending soon. Not a search. */
export async function recheckTrackedRow(row: VerifiedPracticeRow, deps: CheckDeps): Promise<VerifiedPracticeRow> {
  if (!needsSponsorRefetch({ url: row.url, lastChecked: row.lastChecked ?? null, endIso: row.endIso }, deps.now())) return row;
  const checkedOn = deps.now().toISOString().slice(0, 10);
  let opened: Awaited<ReturnType<typeof checkOfficialPage>>;
  try {
    opened = await checkOfficialPage(row.url, deps);
  } catch {
    opened = { ok: false, status: 502, message: "The sponsor page could not be fetched." };
  }
  if (row.listingGroup !== "verified") return { ...row, lastChecked: checkedOn };
  if (!opened.ok || !entrySectionPresent(opened.contest)) {
    return {
      ...row,
      lastChecked: checkedOn,
      listingGroup: "check",
      formVerified: false,
      rulesVerified: false,
      rulesNote: entryFormGoneNote(checkedOn),
    };
  }
  return { ...row, lastChecked: checkedOn };
}
