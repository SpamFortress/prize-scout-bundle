import { describe, expect, it } from "vitest";
import { confidenceTier, searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-11T15:00:00.000Z");
const FORM = `<form action="/enter"><input name="email"><button type="submit">Enter</button></form>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}${FORM}</body></html>`;
}

const STRONG = `Official rules. Sponsored by North Sponsor LLC. Sponsor address: 1 Prize Road, Boise, ID 83702.
No purchase necessary. A mail-in entry is available.
The sweepstakes begins on January 1, 2026 and ends on March 1, 2027.
Open to legal residents of the United States. Must be 18 years or older.
Enter to win a branded camera. The grand prize has an approximate retail value of $500.
Odds of winning depend on the number of eligible entries.
Potential winners will be selected in a random drawing and notified by email. To request a winners list, mail a note to the sponsor.`;

describe("confidence ranking", () => {
  it("orders one list by tier and keeps Brave order inside a tier", async () => {
    const results = [
      { url: "https://ended.example/old", title: "Ended Official Giveaway", description: "Closed" },
      { url: "https://news.example/story", title: "Daily story", description: "A news story" },
      { url: "https://scam.example/claim", title: "Shipping Claim Giveaway", description: "Pay to receive" },
      { url: "https://www.sweepsdb.com/", title: "SweepsDB", description: "Directory" },
      { url: "https://www.polaris.com/win", title: "Polaris Win", description: "Official giveaway" },
      { url: "https://north.example/enter", title: "North Full Giveaway", description: "Official rules" },
      { url: "https://partial.example/enter", title: "Partial Giveaway", description: "Shorter rules" },
      { url: "https://south.example/enter", title: "South Full Giveaway", description: "Official rules" },
      { url: "https://old-north.example/enter", title: "North Full Giveaway", description: "Older copy" },
    ];
    const pages = new Map<string, { status?: number; body: string }>([
      ["https://ended.example/old", { body: page("Ended Official Giveaway", `<p>${STRONG.replace("March 1, 2027", "January 1, 2026")}</p>`) }],
      ["https://news.example/story", { body: `<!doctype html><html><head><title>Daily story</title></head><body><article><p>Published Monday.</p></article></body></html>` }],
      ["https://scam.example/claim", { body: page("Shipping Claim Giveaway", `<p>${STRONG} Pay shipping to claim your prize before we send it.</p>`) }],
      ["https://www.polaris.com/win", { status: 403, body: "blocked" }],
      ["https://north.example/enter", { body: page("North Full Giveaway", `<p>${STRONG}</p>`) }],
      ["https://partial.example/enter", { body: page("Partial Giveaway", "<p>Official rules. Sponsored by Partial Example. No purchase necessary. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p>") }],
      ["https://south.example/enter", { body: page("South Full Giveaway", `<p>${STRONG.replace("North Sponsor", "South Sponsor")}</p>`) }],
      ["https://old-north.example/enter", { body: page("North Full Giveaway", `<p>${STRONG.replace("March 1, 2027", "January 1, 2026")}</p>`) }],
    ]);
    const found = await searchVerifiedGiveaways("giveaway", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) return Response.json({ web: { results } });
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        const hit = pages.get(url);
        if (!hit) return new Response("missing", { status: 404 });
        if (hit.status) return new Response(hit.body, { status: hit.status, headers: { "content-type": "text/html" } });
        return new Response(hit.body, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const urls = found.listings.map((row) => row.url);
    expect(urls).toEqual([
      "https://north.example/enter",
      "https://partial.example/enter",
      "https://south.example/enter",
      "https://news.example/story",
      "https://www.polaris.com/win",
      "https://scam.example/claim",
      "https://www.sweepsdb.com/",
      "https://ended.example/old",
    ]);
    const scam = found.listings.find((row) => row.url.includes("scam.example"));
    expect(scam?.listingGroup).toBe("check");
    expect(scam?.rulesNote).toMatch(/Scam warning/);
    expect(urls).not.toContain("https://old-north.example/enter");
    const tiers = found.listings.map((row) => confidenceTier(row, NOW));
    expect(tiers).toEqual([1, 1, 1, 2, 2, 2, 3, 4]);
    expect(scam?.scamPhrases.join(" ")).toMatch(/pay shipping to claim/i);
    expect(found.listings.find((row) => row.url.includes("polaris.com"))?.sponsorPageBlocked).toBe(true);
    expect(found.listings.find((row) => row.url.includes("sweepsdb.com"))?.unreadDirectory).toBe(true);
    expect(found.listings.every((row) => !("tier" in row))).toBe(true);
  });
});
