/**
 * Print what a restart would do with a saved add-on checks file.
 * Reads the file and writes nothing. Uses the same function as server startup.
 *
 * Usage: npm run reclassify -- <path-to-addon-checks.json>
 */
import { readFileSync } from "node:fs";
import { reclassifyStoredChecks } from "@/server/addon-check";
import type { AddonCheckRecord } from "@/server/addon-pairing";

function isRow(value: unknown): value is AddonCheckRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AddonCheckRecord>;
  return typeof row.url === "string" && row.url.startsWith("https://");
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run reclassify -- <path-to-addon-checks.json>");
    process.exit(1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.error("The checks file could not be read as JSON.");
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error("The checks file must be a JSON array.");
    process.exit(1);
  }
  for (const row of reclassifyStoredChecks(parsed.filter(isRow))) {
    const group = row.hidden ? `${row.listingGroup} hidden` : row.notContest ? `${row.listingGroup} not-contest` : row.listingGroup;
    console.log([row.url, row.endIso ?? "null", group, row.rulesNote].join("\t"));
  }
}

main();
