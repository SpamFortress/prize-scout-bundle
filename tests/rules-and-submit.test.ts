import { describe, expect, it } from "vitest";
import { ENTRY_SAMPLES } from "@/app/design-preview/entries-sample";
import { enterCaption, enterMode, sampleFromVerified } from "@/app/design-preview/entries-sample";
import { entryTaxLine } from "@/domain/entry-tax";
import { FEDERAL_2026, federalIncomeTaxCents, formatUsdFromCents } from "@/domain/federal-tax";
import { extractRulesFacts, mailCardLayoutFixture, rulesFactsAreSufficient } from "@/domain/rules-facts";
import { applySubmitResult, practiceSubmitter, SUBMITTER_NEEDS } from "@/domain/submitter";
import { STATE_TAX_SLOTS } from "@/domain/us-states";
import { toVerifiedPracticeRow } from "@/domain/verified-entry";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";
import { observeHtml } from "@/domain/interpret";

const NOW = new Date("2026-11-09T12:00:00Z");

const RULES_HTML = `<!doctype html><html><head><title>Northwind Widget Giveaway</title>
<meta name="description" content="Official widget drawing."></head><body>
<p>No purchase necessary. Open to legal residents of the United States, excluding Idaho. Must be 21 years of age or older. One entry per person per day. Ends March 1, 2027. Approximate retail value of $250. Automated entries are not allowed.</p>
<p>For a mail-in entry, handwrite your name and address on a 3x5 card and mail it to: Prize Fixture, 1 Rules Fixture Road, Boise, ID 00000.</p>
<a href="https://example.com/official-rules">Official Rules</a>
<form action="https://example.com/enter"><input name="email"><button type="submit">Enter</button></form>
</body></html>`;

describe("rules reading", () => {
  it("reads frequency, Idaho, age, the end date, an automation ban, and a mail address", () => {
    const facts = extractRulesFacts(RULES_HTML.replace(/<[^>]+>/g, " "));
    expect(facts.frequency).toBe("daily");
    expect(facts.minAge).toBe(21);
    expect(facts.endDateText).toBe("March 1, 2027");
    expect(facts.excludedStates).toContain("ID");
    expect(facts.excludedStates).not.toContain("NY");
    expect(facts.automationProhibited).toBe(true);
    expect(facts.mailIn?.addressLines.join(" ")).toContain("1 Rules Fixture Road");
    expect(facts.mailIn?.requiredFields).toEqual(expect.arrayContaining(["Name", "Address"]));
    expect(facts.mailIn?.addressLines.join(" ")).not.toMatch(/@/);
    expect(rulesFactsAreSufficient(facts)).toBe(true);
  });

  it("treats the 48 contiguous states as the lower 48 plus D.C., and voids only Alaska and Hawaii", () => {
    const orlando = `The sweepstakes is intended for participants in the forty-eight (48) contiguous United States and Washington D.C. only. Void in Alaska and Hawaii. This sweepstakes is open only to legal United States residents residing in the forty-eight (48) contiguous United States or Washington, D.C.`;
    const facts = extractRulesFacts(orlando);
    expect(facts.includedStates).toContain("ID");
    expect(facts.includedStates).toContain("DC");
    expect(facts.includedStates).not.toContain("AK");
    expect(facts.includedStates).not.toContain("HI");
    expect(facts.excludedStates).toEqual(expect.arrayContaining(["AK", "HI"]));
    expect(facts.excludedStates).not.toContain("ID");
    expect(facts.excludedStates).not.toContain("WA");
    const continental = extractRulesFacts("Open only to residents of the continental United States.");
    expect(continental.includedStates).toContain("ID");
    expect(continental.includedStates).not.toContain("AK");
    const voids = extractRulesFacts("No purchase necessary. Void in Alaska and Hawaii. Open to legal residents of the United States.");
    expect(voids.excludedStates).toEqual(expect.arrayContaining(["AK", "HI"]));
    expect(voids.excludedStates).not.toContain("ID");
    const chevy = "THE SWEEPSTAKES IS OPEN ONLY TO LEGAL RESIDENTS OF THE STATES OF KENTUCKY, ILLINOIS, INDIANA, IOWA, MICHIGAN, MINNESOTA, MISSOURI, MONTANA, NEBRASKA, NORTH DAKOTA, OHIO, PENNSYLVANIA, SOUTH DAKOTA, WEST VIRGINIA, WISCONSIN, AND WYOMING. ALL OTHERS ARE INELIGIBLE TO ENTER AND WILL BE DISQUALIFIED.";
    const closed = extractRulesFacts(chevy);
    expect(closed.includedStates).not.toContain("ID");
    expect(closed.includedStates).toContain("WY");
  });

  it("does not invent a mailing address", () => {
    const facts = extractRulesFacts("No purchase necessary. One entry per person. Ends March 1, 2027.");
    expect(facts.mailIn).toBeNull();
    expect(facts.excludedStates).toEqual([]);
  });

  it("fills the layout card from the stored rules paragraph only", () => {
    const card = mailCardLayoutFixture();
    expect(card?.addressLines[0]).toBe("Prize Scout Fixture");
    expect(card?.requiredFields).toEqual(["Name", "Address", "City", "State", "ZIP code"]);
  });
});

describe("federal tax", () => {
  it("uses the 2026 single table from Rev. Proc. 2025-32 and does not invent a state rate", () => {
    expect(federalIncomeTaxCents(12_400)).toBe(124_000);
    expect(federalIncomeTaxCents(55_000)).toBe(681_200);
    expect(formatUsdFromCents(681_200)).toBe("$6,812");
    expect(FEDERAL_2026.single.rows[2]).toMatchObject({ notOver: 105_700, base: 5_800, rate: 0.22, over: 50_400 });
    expect(FEDERAL_2026.single.standardDeduction).toBe(16_100);
    expect(STATE_TAX_SLOTS).toHaveLength(51);
    expect(STATE_TAX_SLOTS.every((slot) => slot.officialRate === null && slot.source === null)).toBe(true);
    const line = entryTaxLine({ arvUsd: 55_000, arvKind: "sample", stateChoice: "Idaho" });
    expect(line.short).toBe("Est. federal tax $6,812");
    expect(line.primary).toContain("Federal $6,812");
    expect(line.primary).toContain("Idaho: state not estimated.");
    expect(line.primary).not.toMatch(/\b5%/);
    expect(entryTaxLine({ arvUsd: null, arvKind: "unstated", stateChoice: "sample" }).primary).toContain("Federal tax not estimated");
  });
});

describe("entry caption", () => {
  it("keeps Automatic on practice samples and blocks paid, prohibited, and unverified forms", () => {
    const chair = ENTRY_SAMPLES.find((item) => item.id === "chair");
    expect(chair && enterCaption(chair)).toBe("Prefill · Daily");
    expect(chair && enterMode(chair)).toBe("prefill");
    const observed = observeHtml(RULES_HTML, "https://example.com/enter", NOW);
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    const row = sampleFromVerified(toVerifiedPracticeRow(observed.contest, true, "The official rules page was fetched."));
    expect(enterMode(row)).toBe("prefill");
    expect(enterCaption(row)).toMatch(/^Prefill/);
    const unverified = sampleFromVerified(toVerifiedPracticeRow({ ...observed.contest, rulesFacts: { ...observed.contest.rulesFacts!, automationProhibited: false, automationQuote: null } }, false, "Rules were not verified."));
    expect(enterMode(unverified)).toBe("needs_you");
    expect(enterCaption(unverified)).toBe("Needs you");
  });
});

describe("submitter", () => {
  it("does not confirm a practice click, and ignores an unconfirmed entered status", async () => {
    const result = await practiceSubmitter().submitFreeEntry({
      officialUrl: "https://example.com/enter",
      rulesUrl: null,
      title: "Sample",
      profile: { country: null, state: null, age: null, dedicatedEmail: null },
    });
    expect(result.confirmed).toBe(false);
    expect(applySubmitResult(result).markEntered).toBe(false);
    expect(applySubmitResult({ status: "entered", confirmed: false, message: "no" })).toMatchObject({ markEntered: false, label: "Needs you" });
    expect(applySubmitResult({ status: "entered", confirmed: true, message: "ok" })).toMatchObject({ markEntered: true, label: "Entered" });
    expect(SUBMITTER_NEEDS.join(" ")).toMatch(/PRIZE_SCOUT_SUBMITTER_MODULE/);
    expect(SUBMITTER_NEEDS.join(" ")).toMatch(/sponsor response/);
  });
});

describe("verified search", () => {
  it("returns no listings when the key is missing or the search service returns none", async () => {
    const calls: string[] = [];
    const missing = await searchVerifiedGiveaways("truck", {
      apiKey: undefined,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        calls.push(String(input));
        return new Response("no");
      },
    });
    expect(missing.configured).toBe(false);
    expect(missing.listings).toEqual([]);
    expect(calls).toEqual([]);

    const empty = await searchVerifiedGiveaways("truck", {
      apiKey: "test-key",
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async () => Response.json({ web: { results: [] } }),
    });
    expect(empty.configured).toBe(true);
    expect(empty.listings).toEqual([]);
    expect(empty.message).toMatch(/No listings were added/);
  });

  it("lists only a page that was fetched, and does not copy the search snippet", async () => {
    const found = await searchVerifiedGiveaways("camera", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: { results: [{ title: "Do not use this title", url: "https://example.com/enter", description: "snippet only" }] },
          });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(RULES_HTML, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(found.listings).toHaveLength(1);
    expect(found.listings[0].title).toBe("Northwind Widget Giveaway");
    expect(found.listings[0].title).not.toBe("Do not use this title");
    expect(JSON.stringify(found.listings)).not.toContain("snippet only");
    expect(found.listings[0].automation).toBe("prohibited");
    expect(found.listings[0].eligibility).toContain("Idaho");
  });

  it("keeps a normal official page when another result is larger than the read limit", async () => {
    const good = `<!doctype html><html><head><title>Good Giveaway</title></head><body>
<p>No purchase necessary. Official rules. Sponsored by Good Sponsor. Enter to win a gift card. Open to legal residents of the United States. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p>
<form action="https://good.example/enter"><input name="email"><button type="submit">Enter</button></form>
</body></html>`;
    const oversized = `<!doctype html><html><head><title>Too Big</title></head><body>${"x".repeat(1_100_000)}
<form action="https://big.example/enter"><input name="email"><button type="submit">Enter</button></form>
</body></html>`;
    const found = await searchVerifiedGiveaways("giveaway", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: {
              results: [
                { title: "skip", url: "https://big.example/enter" },
                { title: "skip", url: "https://good.example/enter" },
              ],
            },
          });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.includes("big.example")) return new Response(oversized, { status: 200, headers: { "content-type": "text/html" } });
        if (url.includes("good.example")) return new Response(good, { status: 200, headers: { "content-type": "text/html" } });
        return new Response("missing", { status: 404 });
      },
    });
    expect(found.listings.map((item) => item.title)).toEqual(["Good Giveaway", "Too Big"]);
    expect(enterCaption(sampleFromVerified(found.listings[0]!))).toMatch(/^Prefill/);
  });
});
