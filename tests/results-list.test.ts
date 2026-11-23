import { describe, expect, it } from "vitest";
import { formatObservedEnd, parseDueDate } from "@/domain/dates";
import { applySelectAll, filterContests, nextShownCount, RESULT_PAGE_SIZE, sortContests, visibleResults } from "@/domain/match";
import { canSaveContest, recordLocalEntry, saveContest } from "@/domain/selected";
import type { Contest, Source } from "@/domain/types";
import { readFileSync } from "node:fs";
import path from "node:path";

function contest(partial: { id: string; source: Source; title: string; cost: Contest["entryCost"]; published: string; end: string | null }): Contest {
  return {
    id: partial.id,
    source: partial.source,
    title: partial.title,
    shortDescription: "Checked page",
    officialUrl: `https://example.com/${partial.id}`,
    rulesUrl: null,
    imageUrl: null,
    sponsor: "Checked sponsor",
    prizeValue: null,
    due: parseDueDate(partial.end),
    entryCost: partial.cost,
    entryMethod: "Observed form",
    limits: { countries: [], states: [], minAge: null, maxAge: null },
    restrictions: [],
    redFlags: [],
    publishedAt: partial.published,
    readiness: "fetched",
    formChecked: false,
    rulesChecked: false,
    hubOnly: false,
    evidence: { evidenceUrl: `https://example.com/${partial.id}`, fetchedAt: partial.published, tool: "evidence.fetch", schemaChecked: true },
  };
}

const stored = [
  contest({ id: "a", source: "web", title: "Alpha", cost: "free", published: "2026-01-01", end: "2026-12-01" }),
  contest({ id: "b", source: "x", title: "Beta", cost: "paid", published: "2026-03-01", end: "2026-11-01" }),
  contest({ id: "c", source: "web", title: "Gamma", cost: "free", published: "2026-02-01", end: "2027-01-01" }),
  contest({ id: "d", source: "facebook", title: "Delta", cost: "unknown", published: "2025-12-01", end: null }),
  contest({ id: "e", source: "instagram", title: "Epsilon", cost: "paid", published: "2026-04-01", end: "2026-10-01" }),
];

describe("stored result filters and pages", () => {
  const base = { query: "", region: "US", strictRegion: false, sources: ["web", "x", "facebook", "instagram"] as Source[] };

  it("filters free and paid evidence without treating unknown as either", () => {
    const free = filterContests(stored, { ...base, entryCost: "free" }).map((item) => item.contest.id);
    const paid = filterContests(stored, { ...base, entryCost: "paid" }).map((item) => item.contest.id);
    expect(free).toEqual(["a", "c"]);
    expect(paid).toEqual(["b", "e"]);
    expect(filterContests(stored, { ...base, sources: ["web"] }).map((item) => item.contest.id)).toEqual(["a", "c"]);
  });

  it("sorts newest, oldest, and ending order on stored dates", () => {
    const rows = filterContests(stored, base);
    const now = new Date("2026-06-01T00:00:00Z");
    expect(sortContests(rows, "new", now).map((item) => item.contest.id)).toEqual(["e", "b", "c", "a", "d"]);
    expect(sortContests(rows, "oldest", now).map((item) => item.contest.id)).toEqual(["d", "a", "c", "b", "e"]);
    expect(sortContests(rows, "ending", now).map((item) => item.contest.id)[0]).toBe("e");
    expect(sortContests(rows, "ending-latest", now).map((item) => item.contest.id)[0]).toBe("c");
    expect(sortContests(rows, "ending", now).map((item) => item.contest.id).at(-1)).toBe("d");
  });

  it("pages only the already filtered list and stops when exhausted", () => {
    const ids = ["a", "b", "c", "d", "e"];
    expect(visibleResults(ids, RESULT_PAGE_SIZE)).toEqual(["a", "b", "c", "d"]);
    const more = nextShownCount(ids.length, RESULT_PAGE_SIZE);
    expect(more).toBe(5);
    expect(visibleResults(ids, more ?? 0)).toEqual(ids);
    expect(nextShownCount(ids.length, more ?? 0)).toBeNull();
    expect(nextShownCount(0, RESULT_PAGE_SIZE)).toBeNull();
  });

  it("formats an observed end date and leaves an unstated date blank", () => {
    const asOf = new Date("2027-01-10T12:00:00Z");
    expect(formatObservedEnd(parseDueDate("2027-01-26"), asOf)).toEqual({
      dateLine: "Ends 01/26/2027",
      relativeLine: "16 days left",
    });
    expect(formatObservedEnd(parseDueDate("2027-01-10T15:00:00Z"), asOf)).toEqual({
      dateLine: "Ends 01/10/2027 15:00 UTC",
      relativeLine: "Ends today",
    });
    expect(formatObservedEnd(parseDueDate(null), asOf)).toEqual({
      dateLine: "End date not stated",
      relativeLine: null,
    });
    const home = readFileSync(path.join(process.cwd(), "src/components/search-home.tsx"), "utf8");
    expect(home).toContain("Added:");
    expect(home).toContain('"Soon"');
    expect(home).toContain('"Later"');
    expect(home).not.toContain("Ending latest");
    expect(home).not.toContain("Closing latest");
    expect(home).not.toContain("01/10/2027");
    expect(home).toContain("formatObservedEnd(contest.due, new Date())");
  });

  it("saves a checked page without creating an entry and ignores hidden rows", () => {
    const page = stored[0];
    const directory = { ...page, id: "dir", hubOnly: true, readiness: "hub_only" as const };
    expect(canSaveContest(directory)).toBe(false);
    expect(saveContest(directory, new Date("2026-11-06T00:00:00Z")).ok).toBe(false);
    const saved = saveContest({ ...page, formChecked: false, rulesChecked: false, readiness: "fetched" }, new Date("2026-11-06T00:00:00Z"));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.entry.autofill).toBeNull();
    expect(recordLocalEntry(saved.entry, new Date("2026-11-06T00:00:00Z")).ok).toBe(false);
    const afterSave = applySelectAll(["visible-a", "visible-b"], ["hidden-kept", "visible-a"], true);
    expect(afterSave).toEqual(expect.arrayContaining(["hidden-kept", "visible-a", "visible-b"]));
    expect(applySelectAll(["visible-a", "visible-b"], afterSave, false)).toEqual(["hidden-kept"]);
  });

  it("keeps sample listings out of the production search screen", () => {
    const home = readFileSync(path.join(process.cwd(), "src/components/search-home.tsx"), "utf8");
    const preview = ["page.tsx", "sample-browse.tsx", "sample-data.ts"]
      .map((name) => readFileSync(path.join(process.cwd(), "src/app/design-preview", name), "utf8"))
      .join("\n");
    expect(home).not.toContain("demo-illustration");
    expect(home).toContain('aria-label="Save all visible contests"');
    expect(preview).not.toContain("useScout");
    expect(preview).toContain("Sample checkbox. Not saved.");
    expect(preview).toContain(">All</span>");
    expect(home).toContain(">All</span>");
    expect(home).not.toContain("DESIGN PREVIEW");
    expect(preview).toContain("DESIGN PREVIEW — sample listings, not live search results. Sample dates as of 01/10/2027.");
    expect(preview).toContain('end: "2027-01-26"');
    expect(preview).toContain("Furniture collection — illustration only");
  });

  it("places the save checkbox outside and to the left of the thumbnail", () => {
    const row = readFileSync(path.join(process.cwd(), "src/components/result-row.tsx"), "utf8");
    const saveAt = row.indexOf("data-result-save");
    const thumbRenderAt = row.indexOf("{thumb}");
    expect(saveAt).toBeGreaterThan(-1);
    expect(thumbRenderAt).toBeGreaterThan(saveAt);
    expect(row).toContain('className="flex h-[120px] shrink-0 items-center"');
    expect(row).not.toContain("absolute inset-0");
    expect(row).not.toContain("absolute inset-x-0");
    const thumbBlock = row.slice(row.indexOf("const thumbVisual"), row.indexOf("return ("));
    expect(thumbBlock).not.toContain("absolute");
  });
});
