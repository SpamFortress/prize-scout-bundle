import { describe, expect, it } from "vitest";
import { scanRulesChecklist, scanScamWarning } from "@/domain/rules-checklist";
import { isRetailQuery, watchedSiteQuery } from "@/domain/search-yield";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-10T12:00:00Z");
const FORM = `<form action="https://rules.example/enter"><input name="email"><button type="submit">Enter</button></form>`;

const FULL = `Official rules. Sponsored by Acme Cookware, LLC. Sponsor address: 1 Prize Road, Boise, ID 83702.
No purchase necessary. A mail-in entry is available.
The sweepstakes begins on January 1, 2026 and ends on March 1, 2026.
Open to legal residents of the United States. Must be 18 years or older.
The grand prize has an approximate retail value of $500.
Odds of winning depend on the number of eligible entries.
Potential winners will be selected in a random drawing and notified by email. To request a winners list, mail a note to the sponsor.
This sweepstakes is bonded and registered in New York and Florida.`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body><p>${body}</p>${FORM}</body></html>`;
}

function run(results: Array<{ url: string; title: string; html: string }>) {
  return searchVerifiedGiveaways("contest", {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls: 1,
    now: () => NOW,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) return Response.json({ web: { results } });
      if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
      const hit = results.find((item) => url.startsWith(item.url));
      if (!hit) return new Response("missing", { status: 404 });
      return new Response(hit.html, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
}

describe("rules checklist", () => {
  it("counts a complete rules page as 7 of 7 and keeps the bond note", () => {
    const scan = scanRulesChecklist(FULL);
    expect(scan.found).toBe(7);
    expect(scan.missing).toEqual([]);
    expect(scan.registrationNote).toMatch(/bonded and registered in New York and Florida/i);
  });

  it("names a missing sponsor address and does not call the page legit", () => {
    const scan = scanRulesChecklist(FULL.replace("Sponsor address: 1 Prize Road, Boise, ID 83702.", ""));
    expect(scan.found).toBe(6);
    expect(scan.missing).toContain("No sponsor address found");
    expect(JSON.stringify(scan)).not.toMatch(/legit|verified/i);
  });

  it("flags a pay-shipping claim and does not flag a store purchase entry", () => {
    expect(scanScamWarning("Pay shipping to claim your prize before we send it.")).toEqual(["Pay shipping to claim your prize before we send it."]);
    expect(scanScamWarning("Earn 1 entry per $1 spent in the store. No purchase necessary.")).toEqual([]);
  });

  it("labels fetched pages from fixtures and skips an unread directory", async () => {
    const found = await run([
      { url: "https://full.example/rules", title: "Full rules", html: page("Full rules", FULL) },
      { url: "https://missing.example/rules", title: "Missing address", html: page("Missing address", FULL.replace("Sponsor address: 1 Prize Road, Boise, ID 83702.", "")) },
      { url: "https://norules.example/enter", title: "No rules", html: page("No rules", "Enter the drawing. One entry per person.") },
      { url: "https://scam.example/claim", title: "Shipping claim", html: page("Shipping claim", "Official rules. Pay shipping to claim your prize.") },
      { url: "https://store.example/giveaway", title: "Store giveaway", html: page("Store giveaway", "Official rules. 1 entry per $1 spent. No purchase necessary.") },
      { url: "https://www.sweepsdb.com/", title: "SweepsDB", html: page("SweepsDB", FULL) },
    ]);
    const full = found.listings.find((item) => item.url.includes("full.example"));
    const missing = found.listings.find((item) => item.url.includes("missing.example"));
    const none = found.listings.find((item) => item.url.includes("norules.example"));
    const scam = found.listings.find((item) => item.url.includes("scam.example"));
    const store = found.listings.find((item) => item.url.includes("store.example"));
    const directory = found.listings.find((item) => item.url.includes("sweepsdb.com"));
    expect(full?.rulesFoundCount).toBe(7);
    expect(full?.rulesRegistrationNote).toMatch(/New York and Florida/i);
    expect(missing?.rulesFoundCount).toBe(6);
    expect(missing?.rulesMissing).toContain("No sponsor address found");
    expect(none?.rulesFoundCount).toBeNull();
    expect(scam?.scamPhrases.join(" ")).toMatch(/pay shipping to claim/i);
    expect(store?.methods).toEqual(["paid"]);
    expect(store?.purchaseEntry).toBe(true);
    expect(store?.scamPhrases).toEqual([]);
    expect(directory?.rulesScanSkipped).toBe(true);
    expect(directory?.unreadDirectory).toBe(true);
    expect(JSON.stringify(found.listings)).not.toMatch(/legit giveaway|verified official/i);
  });

  it("adds a retail site booster for a kitchen query and not for a truck query", () => {
    expect(isRetailQuery("kitchen")).toBe(true);
    expect(isRetailQuery("gift card giveaway")).toBe(true);
    expect(isRetailQuery("pots and pans")).toBe(true);
    const retail = watchedSiteQuery("kitchen");
    expect(retail).toContain("site:hgtv.com");
    expect(retail).toContain("site:foodnetwork.com");
    expect(retail).not.toContain("williams-sonoma");
    expect(watchedSiteQuery("truck giveaway")).not.toContain("site:hgtv.com");
  });
});
