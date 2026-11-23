import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { frequencyBucket, matchesFrequency } from "@/app/design-preview/entries-sample";
import { nextResetAt, resetFactFromText } from "@/domain/entry-clock";
import { entryLogRecord } from "@/domain/entry-log";
import { CAP_LINE, alreadyServed, capDay, searchGate } from "@/domain/usage";
import { openBrowserId, sealBrowserId } from "@/server/browser-id";
import { migrateLegacyOwner, ownerCheckCount } from "@/server/legacy-docs";
import { beginSearch } from "@/server/usage-store";
import { writeFsDocument } from "@/server/document-store";

const dirs: string[] = [];

afterEach(() => {
  delete process.env.PRIZE_SCOUT_USAGE_FILE;
  delete process.env.PRIZE_SCOUT_FREE_DAILY_CAP;
  delete process.env.PRIZE_SCOUT_GLOBAL_DAILY_CAP;
  delete process.env.PRIZE_SCOUT_COOKIE_SECRET;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("signed browser id", () => {
  it("rejects a cookie whose signature was edited", async () => {
    process.env.PRIZE_SCOUT_COOKIE_SECRET = "test-cookie-secret";
    const sealed = await sealBrowserId("ab".repeat(16));
    expect(await openBrowserId(sealed)).toBe("ab".repeat(16));
    const flipped = `${sealed.slice(0, -1)}${sealed.endsWith("0") ? "1" : "0"}`;
    expect(await openBrowserId(flipped)).toBeNull();
    expect(await openBrowserId("not-signed")).toBeNull();
  });
});

describe("legacy owner documents", () => {
  it("copies 29 stored checks onto the owner id and leaves the original file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "legacy-"));
    dirs.push(dir);
    const rows = Array.from({ length: 29 }, (_, index) => ({
      url: `https://example.com/row-${index}`,
      title: `Row ${index}`,
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: "Checked by you.",
      endIso: null,
      openRulesUrl: null,
      limits: [],
      checkedAt: "2026-11-16T12:00:00.000Z",
    }));
    writeFsDocument(dir, "addon-checks", JSON.stringify(rows));
    expect(migrateLegacyOwner(dir, "checks")).toBe(true);
    expect(ownerCheckCount(dir)).toBe(29);
    expect(JSON.parse(readFileSync(path.join(dir, "addon-checks.json"), "utf8"))).toHaveLength(29);
    expect(JSON.parse(readFileSync(path.join(dir, "owner-checks.json"), "utf8"))).toHaveLength(29);
    expect(migrateLegacyOwner(dir, "checks")).toBe(false);
  });
});

describe("reset tracking", () => {
  const entered = new Date("2026-11-16T18:00:00.000Z");

  it("uses midnight in the named zone for a calendar reset", () => {
    const fact = resetFactFromText("One entry per day. Ends 11:59 p.m. Mountain Time.");
    expect(fact.kind).toBe("calendar");
    expect(fact.timeZone).toBe("America/Denver");
    const next = nextResetAt(fact, entered);
    expect(next.needsChecking).toBe(false);
    expect(next.at).toBeTruthy();
  });

  it("uses the stated hour count for a rolling reset and does not assume 24", () => {
    const fact = resetFactFromText("Each person may enter once every 12 hours.");
    expect(fact.kind).toBe("rolling");
    expect(fact.rollingHours).toBe(12);
    const next = nextResetAt(fact, entered);
    expect(next.needsChecking).toBe(false);
    expect(next.at).toBe(new Date(entered.getTime() + 12 * 60 * 60 * 1000).toISOString());
  });

  it("flags an unstated reset and uses the later time when both forms are named", () => {
    const silent = resetFactFromText("No purchase necessary. Open to legal residents.");
    expect(silent.kind).toBe("unknown");
    expect(silent.rollingHours).toBeNull();
    expect(nextResetAt(silent, entered).needsChecking).toBe(true);
    expect(nextResetAt(silent, entered).note).toMatch(/Needs checking/);
    const both = resetFactFromText("Enter once per day or every 48 hours. Eastern Time.");
    expect(both.kind).toBe("unknown");
    const later = nextResetAt(both, entered);
    expect(later.needsChecking).toBe(true);
    expect(later.at).toBeTruthy();
    const saved = entryLogRecord({
      sponsor: "Example",
      contestUrl: "https://example.com/enter",
      entryDate: "2026-11-16",
      aliasOrTag: "ada@example.com",
      rulesUrl: null,
      endDate: null,
      resetKind: "unknown",
      resetNote: later.note,
      nextEligible: later.at,
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.record.resetNote).toMatch(/Needs checking/);
  });
});

describe("frequency chip", () => {
  it("uses only a stated clock or limit", () => {
    expect(frequencyBucket({ entryClock: "calendar_day", entryLimit: "" })).toBe("daily");
    expect(frequencyBucket({ entryClock: "weekly", entryLimit: "" })).toBe("weekly");
    expect(frequencyBucket({ entryClock: "once", entryLimit: "" })).toBe("once");
    expect(frequencyBucket({ entryClock: "unstated", entryLimit: "See the rules" })).toBe("unknown");
    expect(matchesFrequency({ entryClock: "unstated", entryLimit: "Once daily" }, "daily")).toBe(true);
    expect(matchesFrequency({ entryClock: "unstated", entryLimit: "See the rules" }, "all")).toBe(true);
  });
});

describe("free search cap", () => {
  it("stops at 10 in the Boise day and does not count a repeated query", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cap-"));
    dirs.push(dir);
    process.env.PRIZE_SCOUT_USAGE_FILE = path.join(dir, "usage.json");
    process.env.PRIZE_SCOUT_FREE_DAILY_CAP = "10";
    const now = new Date("2026-11-09T18:00:00.000Z");
    expect(capDay(now, "America/Boise")).toBe("2026-11-09");
    expect(capDay(new Date("2026-11-09T06:30:00.000Z"), "America/Boise")).toBe("2026-11-08");
    for (let index = 0; index < 10; index += 1) {
      const result = await beginSearch({ anonId: "browser-a", hasKey: true, now, query: `prize-${index}` });
      expect(result.paused).toBe(false);
    }
    const capped = await beginSearch({ anonId: "browser-a", hasKey: true, now, query: "prize-new" });
    expect(capped.paused).toBe(true);
    expect(capped.reason).toBe("cap");
    const other = await beginSearch({ anonId: "browser-b", hasKey: true, now, query: "other" });
    expect(other.paused).toBe(false);
    const repeat = await beginSearch({ anonId: "browser-b", hasKey: true, now, query: "other" });
    expect(repeat.cached).toBe(true);
    expect(repeat.summary.searchesToday).toBe(11);
    expect(searchGate({ hasKey: false, startingCreditUsd: null, braveRequests: 0, costPerRequestUsd: 0.005, searchesByVisitor: 10, cap: 10 }).reason).toBe("cap");
    expect(CAP_LINE).toMatch(/free searches/);
    const snapshot = { salt: "s", startingCreditUsd: null, costPerRequestUsd: null, lowCreditUsd: null, lowAlertSent: false, allTimeSearches: 0, allTimeBraveRequests: 0, days: {}, served: { "2026-11-09": { hash: ["other"] } } };
    expect(alreadyServed(snapshot, "2026-11-09", "hash", "Other")).toBe(true);
  });
});
