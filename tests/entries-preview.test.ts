import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AFFORD_HEADING, AFFORD_LINK, compareExamples, ENTRY_SAMPLES, EXAMPLE_OPTIONS, illustrativeTax, matchesEntryMethod, parseBudget, SEARCH_DISCLAIMER } from "@/app/design-preview/entries-sample";

describe("sample entries compare and tax illustration", () => {
  it("figures one tax on the combined prize and subtracts the cash award once", () => {
    const tax = illustrativeTax();
    expect(tax.combined).toBe(65_000);
    expect(tax.federalPart).toBe(16_250);
    expect(tax.statePart).toBe(3_250);
    expect(tax.federalPart + tax.statePart).toBe(tax.taxOnCombined);
    expect(tax.taxOnCombined).toBe(19_500);
    expect(tax.afterSubtractingCash).toBe(9_500);
    expect(AFFORD_HEADING).toBe("Can I afford this if I win?");
    expect(AFFORD_LINK).toBe("* If I win: taxes & delivery");
    const copy = readFileSync(path.join(process.cwd(), "src/app/design-preview/entries-preview.tsx"), "utf8");
    expect(copy).toContain("{AFFORD_HEADING}");
    expect(copy).toContain("{AFFORD_LINK}");
    expect(copy).toContain("Estimated additional cash needed");
    expect(copy).toContain("not an exact amount owed");
    expect(copy).toContain("cannot determine a personal tax bill");
    expect(copy).toContain("state not estimated");
    expect(copy).toContain("Sample — not a real estimate");
    expect(copy).not.toContain("Show sample failure");
    expect(copy).not.toContain("3x5");
    expect(SEARCH_DISCLAIMER).toBe("Prize Scout finds giveaways but can't guarantee them. Always read the official rules before entering.");
    expect(copy.match(/data-search-disclaimer/g)).toHaveLength(2);
    expect(copy).toContain("{SEARCH_DISCLAIMER}");
    expect(copy).toContain('data-live-results="list"');
    expect(copy).not.toContain("Verified official page");
  });

  it("marks ties, hides a budget until that mode, and keeps incomplete totals provisional", () => {
    expect(parseBudget("")).toBeNull();
    expect(parseBudget("$12")).toBe(12);
    expect(parseBudget("nope")).toBe("invalid");
    const lowest = compareExamples("lowest", null);
    expect(lowest.rows.find((row) => row.id === "daily")).toMatchObject({ mark: "winner", label: "Lowest cost" });
    const mail = lowest.rows.find((row) => row.id === "mail");
    expect(mail?.mark).toBe("plain");
    expect(mail?.name).toBe("Mail-in · No purchase necessary");
    expect(mail?.detail).toBe("Postage and supplies not included.");
    expect(`${mail?.name} ${mail?.detail} ${mail?.label ?? ""}`).not.toMatch(/\$|all-in/i);
    expect(lowest.rows.find((row) => row.id === "single")?.mark).toBe("provisional");
    const value = compareExamples("value", null);
    expect(value.rows.find((row) => row.id === "two")).toMatchObject({ mark: "winner", label: "Best value per dollar" });
    expect(value.needsBudget).toBe(false);
    const waiting = compareExamples("budget", null);
    expect(waiting.needsBudget).toBe(true);
    expect(waiting.rows).toEqual([]);
    const budget = compareExamples("budget", 12);
    expect(budget.rows.find((row) => row.id === "two")).toMatchObject({ mark: "winner", label: "Most entries within your budget" });
    expect(budget.rows.find((row) => row.id === "three")?.mark).toBe("excluded");
    expect(budget.rows.find((row) => row.id === "single")?.mark).toBe("provisional");
    expect(budget.provisional).toBe(true);
    expect(EXAMPLE_OPTIONS.find((item) => item.id === "two")?.entries).toBe(2);
  });

  it("filters by the current entry button, so a mixed sample is not in Free and Paid at once", () => {
    const ids = (filter: "all" | "free" | "paid") => ENTRY_SAMPLES.filter((item) => matchesEntryMethod(item, filter)).map((item) => item.id);
    expect(ids("all")).toEqual(["chair", "oak", "lamp", "truck"]);
    expect(ids("free")).toEqual(["chair", "oak", "lamp", "truck"]);
    expect(ids("paid")).toEqual([]);
    const truck = ENTRY_SAMPLES.find((item) => item.id === "truck");
    expect(truck).toBeTruthy();
    const used = { ...truck!, freeEntryUsed: true };
    expect(matchesEntryMethod(used, "free")).toBe(false);
    expect(matchesEntryMethod(used, "paid")).toBe(true);
  });

  it("leaves the production Entries page free of this preview", () => {
    const entries = readFileSync(path.join(process.cwd(), "src/app/entries/page.tsx"), "utf8");
    const preview = ["page.tsx", "sample-browse.tsx"]
      .map((name) => readFileSync(path.join(process.cwd(), "src/app/design-preview", name), "utf8"))
      .join("\n");
    expect(entries).toContain("No local entries in this tab.");
    expect(entries).not.toContain("Open sample Entries");
    expect(entries).not.toContain("If I win");
    expect(preview).toContain("Open sample Entries");
    expect(preview).not.toContain("useScout");
  });
});