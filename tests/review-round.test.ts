import { describe, expect, it, vi } from "vitest";
import { missingPrizeTerms, queryCategories, queryNamesFamily } from "@/domain/brand-categories";
import { lookalikeSponsorNote, timeshareNote } from "@/domain/result-quality";
import { scanScamWarning } from "@/domain/rules-checklist";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-12T15:00:00.000Z");
const FORM = `<form action="/enter"><input name="email"><button type="submit">Enter</button></form>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p>${FORM}</body></html>`;
}

function search(query: string, hits: Array<{ url: string; title: string; html: string }>, now = NOW) {
  const pages = new Map(hits.map((item) => [item.url, item.html]));
  return searchVerifiedGiveaways(query, {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls: 1,
    now: () => now,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return Response.json({ web: { results: hits.map((item) => ({ url: item.url, title: item.title, description: "" })) } });
      }
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
      const html = pages.get(url);
      if (!html) return new Response("missing", { status: 404 });
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
}

const REAL = `No purchase necessary. Official rules. Sponsored by Sample Sponsor. Enter to win a Honda EU2200i generator. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026. Winners will be selected in a random drawing.`;

describe("review round", () => {
  it("keeps the family cap on for a bare brand and lifts it only for the named family", () => {
    expect(queryNamesFamily("Honda", "generator")).toBe(false);
    expect(queryNamesFamily("Honda", "motorcycle")).toBe(false);
    expect(queryNamesFamily("Honda", "vehicle")).toBe(false);
    expect(queryNamesFamily("Honda generator", "generator")).toBe(true);
    expect(queryNamesFamily("Honda generator", "motorcycle")).toBe(false);
    expect(queryNamesFamily("Honda motorcycle", "motorcycle")).toBe(true);
    expect(queryNamesFamily("Honda motorcycle", "generator")).toBe(false);
  });

  it("does not open a brand host page unless the path or title is one contest or a rules file", async () => {
    const hits = [
      { url: "https://www.honda.com/generators", title: "Honda Generators", html: page("Honda Generators", "Shop generators.") },
      { url: "https://www.honda.com/12-truck-giveaways", title: "12 Truck Giveaways", html: page("12 Truck Giveaways", REAL) },
      { url: "https://hondawin2026.com/", title: "Honda Win 2026", html: page("Honda Win 2026", REAL.replace("generator", "vehicle")) },
      { url: "https://powerequipment.honda.com/promotions/twelve-days-of-giveaways", title: "12 Days of Giveaways", html: page("12 Days of Giveaways", REAL) },
      { url: "https://cdn.powerequipment.honda.com/pe/pdf/twelve-days-of-giveaways-official-rules.pdf", title: "12 Days of Giveaways Official Rules", html: page("12 Days of Giveaways Official Rules", `${REAL} Enter at https://powerequipment.honda.com/promotions/twelve-days-of-giveaways.`) },
    ];
    const fetched: string[] = [];
    const found = await searchVerifiedGiveaways("Honda", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) return Response.json({ web: { results: hits.map((item) => ({ url: item.url, title: item.title, description: "" })) } });
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
        fetched.push(url);
        return new Response(hits.find((item) => item.url === url)?.html ?? "missing", { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(fetched.some((url) => url.includes("/generators"))).toBe(false);
    expect(found.listings.find((row) => row.url.includes("12-truck-giveaways"))?.rulesNote).toMatch(/list/);
    expect(fetched.some((url) => url.includes("hondawin2026.com"))).toBe(true);
    expect(fetched.some((url) => url.includes("twelve-days-of-giveaways") && !url.endsWith(".pdf"))).toBe(true);
    expect(fetched.some((url) => url.endsWith(".pdf"))).toBe(true);
  });

  it("treats G43X and 43X as the same model and does not require MOS", () => {
    expect(missingPrizeTerms("Glock G43X MOS", "Glock 43X Giveaway", "Enter to win a Glock 43X.")).toEqual([]);
    expect(missingPrizeTerms("Glock G43X MOS", "Glock 19 Giveaway", "Enter to win a Glock 19.")).toContain("g43x");
  });

  it("blocks Verified when the rules demand a payment to collect the prize", async () => {
    expect(scanScamWarning("Winners may be required to provide SSN for tax reporting.")).toEqual([]);
    const scam = page("Prize Giveaway", `${REAL} You must pay the shipping to claim the prize.`);
    const found = await search("Honda generator", [{ url: "https://sponsor.example/scam", title: "Prize Giveaway", html: scam }]);
    const row = found.listings[0];
    expect(row?.listingGroup).toBe("check");
    expect(row?.rulesNote).toMatch(/Scam warning/);
    expect(row?.scamPhrases.length).toBeGreaterThan(0);
  });

  it("selects cash for dollar amounts, gift cards, and student loan payoff", () => {
    expect(queryCategories("$10,000")).toContain("cash");
    expect(queryCategories("gift card")).toContain("cash");
    expect(queryCategories("gift cards")).toContain("cash");
    expect(queryCategories("student loan payoff")).toContain("cash");
    expect(queryCategories("Henry")).not.toContain("gun");
    expect(queryCategories("Colt")).not.toContain("gun");
    expect(queryCategories("Henry rifle")).toContain("gun");
    expect(queryCategories("Colt revolver")).toContain("gun");
    expect(queryCategories("FN")).toContain("gun");
    expect(queryCategories("CZ")).toContain("gun");
    expect(queryCategories("SIG")).toContain("gun");
  });

  it("keeps Win a Chevy out of Verified because the rules are not open to Idaho", async () => {
    const rules = "THE SWEEPSTAKES IS OPEN ONLY TO LEGAL RESIDENTS OF THE STATES OF KENTUCKY, ILLINOIS, INDIANA, IOWA, MICHIGAN, MINNESOTA, MISSOURI, MONTANA, NEBRASKA, NORTH DAKOTA, OHIO, PENNSYLVANIA, SOUTH DAKOTA, WEST VIRGINIA, WISCONSIN, AND WYOMING. ALL OTHERS ARE INELIGIBLE TO ENTER AND WILL BE DISQUALIFIED.";
    const html = page("Win a Chevy", `No purchase necessary. Official rules. Sponsored by General Motors LLC. Enter to win a Chevrolet. ${rules} Must be 21 years or older. The sweepstakes ends on December 31, 2026.`);
    const found = await search("truck", [{ url: "https://winchevy.com/", title: "Win a Chevy", html }]);
    const row = found.listings.find((item) => item.url.includes("winchevy.com"));
    expect(row?.listingGroup).toBe("check");
    expect(row?.rulesNote).toBe("Not open in Idaho");
  });

  it("does not verify a lookalike retail sponsor or a timeshare trip", async () => {
    expect(lookalikeSponsorNote("Walmart Giveaway", "Sponsored by Walmart.", "https://prizes.example/walmart")).toBe("Not on Walmart's own site");
    expect(lookalikeSponsorNote("Amazon Gift Card", "Sponsored by Visit Orlando. Enter to win an Amazon gift card.", "https://www.visitorlando.com/win-a-trip/")).toBeNull();
    expect(timeshareNote("Free Vacation", "A 90-minute presentation is required.")).toMatch(/presentation or tour/);
    const tripCopy = "<p>No purchase necessary. Official rules. Sponsored by Example Travel. Enter to win a trip. Open to legal residents of the United States.</p>";
    expect(timeshareNote("Win a Trip", tripCopy)).toBeNull();
    const fake = page("Walmart Giveaway", "No purchase necessary. Official rules. Sponsored by Walmart. Enter to win a television. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026.");
    const trip = page("Free Vacation", "No purchase necessary. Official rules. Sponsored by Sunny Tours. Enter to win a free vacation. A 90-minute timeshare presentation is required. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026.");
    const found = await search("vacation", [
      { url: "https://prizes.example/walmart", title: "Walmart Giveaway", html: fake },
      { url: "https://tours.example/free", title: "Free Vacation", html: trip },
    ]);
    expect(found.listings.find((row) => row.url.includes("walmart"))?.rulesNote).toBe("Not on Walmart's own site");
    expect(found.listings.find((row) => row.url.includes("tours.example"))?.rulesNote).toMatch(/presentation or tour/);
    expect(found.listings.every((row) => row.listingGroup !== "verified")).toBe(true);
  });

  it("marks a watched source Ended when its seed date is today or earlier", async () => {
    const html = page("Current Giveaway", "1 entry per $1 spent. No purchase necessary. Official rules. Sponsored by ENRFORCE. Enter to win a Ford truck. Open to legal residents of the United States who are 18 years or older. Ends December 31, 2026.");
    const found = await search("truck", [{ url: "https://enrforce.com/pages/current-giveaway", title: "Current Giveaway", html }], new Date("2026-11-16T12:00:00.000Z"));
    const row = found.listings.find((item) => item.url.includes("enrforce.com"));
    expect(row?.listingGroup).not.toBe("verified");
    expect(row?.listingGroup).not.toBe("store");
    expect(row?.rulesNote).toBe("This contest has ended.");
  });

  it("reports pages not opened next to the bucket counts", async () => {
    const notes: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message?: unknown) => {
      notes.push(String(message));
    });
    try {
      await search("Honda", [{ url: "https://sponsor.example/one", title: "Honda Win", html: page("Honda Win", REAL) }]);
      const line = notes.find((item) => item.includes("search_yield"));
      const parsed = JSON.parse(line ?? "{}") as { pagesNotOpened: { count: number }; buckets: { verified: number } };
      expect(parsed.pagesNotOpened.count).toBeGreaterThanOrEqual(0);
      expect(parsed.buckets.verified).toBeGreaterThanOrEqual(0);
    } finally {
      spy.mockRestore();
    }
  });
});
