import { describe, expect, it } from "vitest";
import { ageTag, restrictionsLine, statedDealerPickup, statedMinAge } from "@/domain/eligibility-tags";
import { extractRulesFacts } from "@/domain/rules-facts";
import { observeHtml } from "@/domain/interpret";
import { toVerifiedPracticeRow } from "@/domain/verified-entry";
import { rulesReading, sampleFromVerified } from "@/app/design-preview/entries-sample";

describe("eligibility tags", () => {
  it("reads a stated minimum age of 18, 19, or 21 and does not invent one", () => {
    expect(statedMinAge("Open to legal residents 18+.").age).toBe(18);
    expect(statedMinAge("Must be 21 or older.").age).toBe(21);
    expect(statedMinAge("Entrants must be 19 years of age or older.").age).toBe(19);
    expect(ageTag(18)).toBe("18+");
    expect(ageTag(19)).toBe("19+");
    expect(ageTag(21)).toBe("21+");
    expect(statedMinAge("Open to people who have reached the age of majority.").age).toBeNull();
    expect(statedMinAge("Adults may enter. No purchase necessary.").age).toBeNull();
    expect(statedMinAge("Prize value $21+ tax.").age).toBeNull();
    expect(statedMinAge("LGND members get 15+ entries a week.").age).toBeNull();
    expect(statedMinAge("This server is 36+ and the club is 80+.").age).toBeNull();
    expect(statedMinAge("gunsandgadgetsdaily readers 50+.").age).toBeNull();
    expect(statedMinAge("Must be at least 15.").age).toBeNull();
    expect(statedMinAge("Players must be at least 18.").age).toBe(18);
    expect(statedMinAge("Age 21 or older.").age).toBe(21);
    expect(statedMinAge("18+ to enter.").age).toBe(18);
    expect(ageTag(null)).toBeNull();
  });

  it("tags dealer pickup only when the rules name a licensed dealer or FFL", () => {
    const ffl = statedDealerPickup("Firearm prizes transfer through a licensed FFL dealer near the winner.");
    expect(ffl.required).toBe(true);
    expect(ffl.quote).toMatch(/FFL/);
    expect(statedDealerPickup("The rifle prize must be picked up at a licensed dealer.").required).toBe(true);
    expect(statedDealerPickup("Win a rifle. No purchase necessary.").required).toBe(false);
    expect(statedDealerPickup("Pick up the truck at the Ford dealer in town.").required).toBe(false);
  });

  it("puts the short tags on a fetched row and the full sentence in Restrictions", () => {
    const html = `<!doctype html><html><head><title>Rifle Giveaway</title><meta name="description" content="Rifle giveaway"></head><body>
<p>No purchase necessary. Official rules. Must be 21 or older. Firearm prizes transfer through a licensed FFL dealer near the winner. One entry per person. Ends December 31, 2026.</p>
<form action="https://guns.example/enter"><input name="email"><button type="submit">Enter</button></form>
</body></html>`;
    const observed = observeHtml(html, "https://guns.example/enter", new Date("2026-11-10T12:00:00Z"));
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    const facts = extractRulesFacts("Must be 21 or older. Firearm prizes transfer through a licensed FFL dealer near the winner.");
    expect(facts.minAge).toBe(21);
    expect(facts.dealerPickup).toBe(true);
    const row = toVerifiedPracticeRow(observed.contest, true, "Rules were on the page.");
    expect(row.ageTag).toBe("21+");
    expect(row.dealerPickup).toBe(true);
    expect(row.restrictionsDetail).toMatch(/21/);
    expect(row.restrictionsDetail).toMatch(/FFL/);
    const reading = rulesReading(sampleFromVerified(row));
    expect(reading.find((line) => line.label === "Restrictions")?.value).toBe(row.restrictionsDetail);
  });

  it("omits both tags when the page does not state them", () => {
    const html = `<!doctype html><html><head><title>Chair Giveaway</title><meta name="description" content="Chair giveaway"></head><body>
<p>No purchase necessary. Official rules. One entry per person. Ends December 31, 2026.</p>
<form action="https://chair.example/enter"><input name="email"><button type="submit">Enter</button></form>
</body></html>`;
    const observed = observeHtml(html, "https://chair.example/enter", new Date("2026-11-10T12:00:00Z"));
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    const row = toVerifiedPracticeRow(observed.contest, true, "Rules were on the page.");
    expect(row.ageTag).toBeNull();
    expect(row.dealerPickup).toBe(false);
    expect(row.restrictionsDetail).toBeNull();
    expect(rulesReading(sampleFromVerified(row)).some((line) => line.label === "Restrictions")).toBe(false);
    expect(restrictionsLine({ age: null, quote: null }, { required: false, quote: null })).toBeNull();
  });
});
