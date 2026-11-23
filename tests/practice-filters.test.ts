import { describe, expect, it } from "vitest";
import { PRACTICE_REGIONS, PRACTICE_ROWS, SHOW_PRACTICE_REGION, addPracticeSearch, commitPracticeSearch, currentEntrySide, entryAction, filterPracticeRows, matchesEntryMethod, parkPracticeSearch, rowsForPracticeGroups, summarizePracticeGroups } from "@/app/design-preview/entries-sample";
import { STATE_TAX_SLOTS } from "@/domain/us-states";

const allSources = ["web", "x", "facebook", "instagram"] as const;

describe("practice sample filters", () => {
  it("keeps each tab's base set, and does not treat a save as an entry", () => {
    const home = filterPracticeRows(PRACTICE_ROWS, { scope: "home", savedIds: ["demo-illustration-1"], query: "", sources: allSources, method: "all", order: "newest" });
    const saved = filterPracticeRows(PRACTICE_ROWS, { scope: "saved", savedIds: ["demo-illustration-1"], query: "", sources: allSources, method: "all", order: "newest" });
    const entries = filterPracticeRows(PRACTICE_ROWS, { scope: "entries", savedIds: ["demo-illustration-1"], query: "", sources: allSources, method: "all", order: "newest" });
    expect(home.some((item) => item.id === "demo-illustration-4")).toBe(true);
    expect(saved.map((item) => item.id)).toEqual(["demo-illustration-1"]);
    expect(entries.some((item) => item.id === "truck")).toBe(true);
    expect(entries.some((item) => item.id === "demo-illustration-1")).toBe(false);
    expect(entries.some((item) => item.tracked === false)).toBe(false);
  });

  it("filters sources, methods, and the sample query independently", () => {
    const instagram = filterPracticeRows(PRACTICE_ROWS, { scope: "home", savedIds: [], query: "", sources: ["instagram"], method: "all", order: "newest" });
    expect(instagram.map((item) => item.id)).toEqual(["demo-illustration-4"]);
    const paid = filterPracticeRows(PRACTICE_ROWS, { scope: "home", savedIds: [], query: "", sources: allSources, method: "paid", order: "newest" });
    expect(paid.map((item) => item.id)).toEqual(["demo-illustration-5"]);
    const free = filterPracticeRows(PRACTICE_ROWS, { scope: "entries", savedIds: [], query: "", sources: allSources, method: "free", order: "oldest" });
    expect(free.some((item) => item.id === "truck")).toBe(true);
    expect(free.some((item) => item.id === "demo-illustration-5")).toBe(false);
    const query = filterPracticeRows(PRACTICE_ROWS, { scope: "home", savedIds: [], query: "field truck", sources: allSources, method: "all", order: "newest" });
    expect(query.map((item) => item.id)).toEqual(["truck"]);
  });

  it("keeps a blank search from opening a group, then accumulates and dedupes", () => {
    expect(commitPracticeSearch([], "   ", "sample-request-1")).toBeNull();
    const first = commitPracticeSearch([], "chair", "sample-request-1");
    expect(first?.map((group) => group.query)).toEqual(["chair"]);
    const added = addPracticeSearch(first ?? []);
    expect(added.cleared).toBe(true);
    expect(added.groups[0]?.active).toBe(false);
    const second = commitPracticeSearch(added.groups, "illustration", "sample-request-2");
    expect(second?.map((group) => group.query)).toEqual(["chair", "illustration"]);
    const shown = rowsForPracticeGroups(PRACTICE_ROWS, second ?? [], {
      savedIds: ["chair"],
      sources: allSources,
      method: "all",
      order: "newest",
      region: "US",
    });
    const ids = shown.flatMap((group) => group.rows.map((row) => row.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(shown[1]?.hiddenAsDuplicate).toBe(false);
    expect(shown[0]?.rows.some((row) => row.id === "chair")).toBe(true);
    expect(shown[1]?.rows.some((row) => row.id === "chair")).toBe(false);
    const canada = filterPracticeRows(PRACTICE_ROWS, { scope: "home", savedIds: [], query: "", sources: allSources, method: "all", order: "newest", region: "CA" });
    expect(canada).toEqual([]);
  });

  it("parks the open request without dropping it, and tab queries stay inside that tab", () => {
    const parked = parkPracticeSearch(commitPracticeSearch([], "chair", "sample-request-1") ?? []);
    expect(parked.map((group) => group.query)).toEqual(["chair"]);
    expect(parked.every((group) => group.active === false)).toBe(true);
    const next = commitPracticeSearch(parked, "table", "sample-request-2");
    expect(next?.map((group) => group.query)).toEqual(["chair", "table"]);
    const saved = filterPracticeRows(PRACTICE_ROWS, { scope: "saved", savedIds: ["demo-illustration-1"], query: "truck", sources: allSources, method: "all", order: "newest" });
    expect(saved).toEqual([]);
    const entries = filterPracticeRows(PRACTICE_ROWS, { scope: "entries", savedIds: [], query: "side table", sources: allSources, method: "all", order: "newest" });
    expect(entries).toEqual([]);
  });

  it("filters by the current button, and a used free entry moves a mixed sample to Paid", () => {
    const truck = PRACTICE_ROWS.find((item) => item.id === "truck")!;
    const savedIds = ["demo-illustration-5", "chair", "truck"];
    const free = filterPracticeRows(PRACTICE_ROWS, { scope: "saved", savedIds, query: "", sources: allSources, method: "free", order: "newest" });
    const paid = filterPracticeRows(PRACTICE_ROWS, { scope: "saved", savedIds, query: "", sources: allSources, method: "paid", order: "newest" });
    expect(free.map((item) => item.id).sort()).toEqual(["chair", "truck"]);
    expect(paid.map((item) => item.id)).toEqual(["demo-illustration-5"]);
    const used = PRACTICE_ROWS.map((item) => (item.id === "truck" ? { ...item, freeEntryUsed: true } : item));
    const freeAfter = filterPracticeRows(used, { scope: "saved", savedIds, query: "", sources: allSources, method: "free", order: "newest" });
    const paidAfter = filterPracticeRows(used, { scope: "saved", savedIds, query: "", sources: allSources, method: "paid", order: "newest" });
    expect(freeAfter.map((item) => item.id)).toEqual(["chair"]);
    expect(paidAfter.map((item) => item.id).sort()).toEqual(["demo-illustration-5", "truck"]);
    expect(entryAction(truck)).toBe("enter");
    expect(entryAction({ ...truck, freeEntryUsed: true })).toBe("paid");
    const daily = PRACTICE_ROWS.find((item) => item.id === "chair")!;
    const dailyAfter = { ...daily, methods: ["free", "paid"] as Array<"free" | "paid">, freeEntryUsed: true };
    expect(entryAction(dailyAfter)).toBe("tomorrow");
    expect(currentEntrySide(dailyAfter)).toBe("free");
    expect(matchesEntryMethod(dailyAfter, "paid")).toBe(false);
    expect(matchesEntryMethod(dailyAfter, "free")).toBe(true);
    const onceFree = PRACTICE_ROWS.find((item) => item.id === "demo-illustration-4")!;
    const onceUsed = { ...onceFree, freeEntryUsed: true };
    expect(entryAction(onceUsed)).toBe("done");
    expect(currentEntrySide(onceUsed)).toBe("free");
    expect(matchesEntryMethod(onceUsed, "paid")).toBe(false);
    expect(matchesEntryMethod(onceUsed, "free")).toBe(true);
    expect(PRACTICE_REGIONS.map((region) => region.code)).toEqual(["US"]);
    expect(STATE_TAX_SLOTS).toHaveLength(51);
    expect(STATE_TAX_SLOTS.every((slot) => slot.officialRate === null)).toBe(true);
    expect(STATE_TAX_SLOTS.some((slot) => slot.code === "DC")).toBe(true);
    expect(SHOW_PRACTICE_REGION).toBe(false);
    expect(entryAction(PRACTICE_ROWS.find((item) => item.id === "chair")!)).toBe("enter");
    expect(entryAction(PRACTICE_ROWS.find((item) => item.id === "truck")!)).toBe("enter");
    expect(entryAction(PRACTICE_ROWS.find((item) => item.id === "lamp")!)).toBe("tomorrow");
    expect(entryAction(PRACTICE_ROWS.find((item) => item.id === "oak")!)).toBe("done");
    expect(entryAction(PRACTICE_ROWS.find((item) => item.id === "demo-illustration-5")!)).toBe("paid");
    const summary = summarizePracticeGroups([
      { group: { query: "table" }, rows: [{ id: "oak" }], hiddenAsDuplicate: false },
      { group: { query: "gun" }, rows: [], hiddenAsDuplicate: false },
      { group: { query: "truck" }, rows: [], hiddenAsDuplicate: true },
      { group: { query: "car" }, rows: [], hiddenAsDuplicate: false },
    ]);
    expect(summary.withRows.map((group) => group.group.query)).toEqual(["table"]);
    expect(summary.noMatches).toEqual(["gun", "car"]);
    expect(summary.alreadyListed).toEqual(["truck"]);
  });
});