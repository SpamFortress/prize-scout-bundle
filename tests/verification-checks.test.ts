import { describe, expect, it } from "vitest";
import { platformSearchQueries, searchQueries } from "@/domain/search-yield";
import {
  enterDestinationNote,
  entryFormGoneNote,
  EXCLUDED_DIRECTORY_HOSTS,
  isExcludedDirectorySource,
  lastCheckedLabel,
  namedSponsors,
  needsSponsorRefetch,
  RULES_DISAGREE_NOTE,
  rulesAndEntryDisagree,
  SPONSOR_NOT_CONFIRMED,
  sponsorIdentityNote,
  sponsorMatchesHost,
  stripTrackingParams,
} from "@/domain/verification-checks";
import { searchHitRow } from "@/domain/verified-entry";
import { recheckTrackedRow } from "@/server/freshness";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-16T15:00:00.000Z");
const FORM = `<form action="/enter"><input type="email" name="email"><button type="submit">Enter</button></form>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

function search(query: string, results: Array<{ url: string; html?: string; title?: string }>, linked: Array<{ url: string; html: string }> = []) {
  const pages = new Map<string, string>();
  for (const item of results) pages.set(item.url, item.html ?? "");
  for (const item of linked) pages.set(item.url, item.html);
  return searchVerifiedGiveaways(query, {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls: 1,
    now: () => NOW,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return Response.json({ web: { results: results.map((item) => ({ title: item.title ?? "skip", url: item.url, description: "" })) } });
      }
      if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
      const html = [...pages.entries()].find(([key]) => url.startsWith(key))?.[1];
      if (html === undefined) return new Response("missing", { status: 404 });
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
}

const READY = `No purchase necessary. Official rules. Sponsored by Ready Sponsor. Enter to win a $500 gift card. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026. Winners will be selected in a random drawing.`;

describe("verification checks", () => {
  it("requires a named sponsor that matches the host or a known vendor", async () => {
    expect(sponsorMatchesHost("American Honda Motor Co., Inc.", "https://hondawin2026.com/")).toBe(true);
    expect(sponsorMatchesHost("Visit Orlando", "https://www.visitorlando.com/win-a-trip/")).toBe(true);
    expect(sponsorMatchesHost("Turn 5, Inc.", "https://www.americantrucks.com/at-sweepstakes.html")).toBe(false);
    expect(namedSponsors('Turn 5, Inc. (&ldquo;Sponsor&rdquo;)')).toEqual(["Turn 5, Inc."]);
    const parent = "Employees of Turn 5, Inc. (\"Sponsor\") are not eligible. To enter, visit http://www.americantrucks.com during the promotion. The prize is $6,000.";
    expect(sponsorIdentityNote({ text: parent, url: "https://www.americantrucks.com/at-sweepstakes.html", prizeUsd: 6000 })).toBeNull();
    expect(sponsorIdentityNote({ text: "Turn 5, Inc. d/b/a AmericanTrucks is the sponsor. No purchase necessary.", url: "https://www.americantrucks.com/win" })).toBeNull();
    expect(sponsorIdentityNote({ text: "AmericanTrucks, a division of Turn 5, Inc. (\"Sponsor\"). No purchase necessary.", url: "https://www.americantrucks.com/win" })).toBeNull();
    expect(sponsorIdentityNote({ text: "Turn 5, Inc. (\"Sponsor\"), operator of americantrucks.com. No purchase necessary.", url: "https://www.americantrucks.com/win" })).toBeNull();
    expect(sponsorIdentityNote({ text: "Sponsor: Turn 5, Inc., 100 Commerce Drive, Malvern, PA 19355. No purchase necessary.", url: "https://www.americantrucks.com/win" })).toBeNull();
    expect(sponsorIdentityNote({ text: "Sponsored by AmericanTrucks. Enter to win a $9,000 truck. Ends December 31, 2026.", url: "https://prizes.example/americantrucks", prizeUsd: 9000 })).toBe(SPONSOR_NOT_CONFIRMED);
    const lookalike = page(
      "AmericanTrucks Giveaway",
      `<p>No purchase necessary. Official rules. Sponsored by AmericanTrucks. Enter to win a $9,000 truck. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026. Winners will be selected in a random drawing.</p>${FORM}`,
    );
    const lookalikeFound = await search("truck", [{ url: "https://prizes.example/americantrucks", title: "AmericanTrucks Giveaway", html: lookalike }]);
    expect(lookalikeFound.listings[0]?.listingGroup).toBe("check");
    expect(lookalikeFound.listings[0]?.rulesNote).toBe(SPONSOR_NOT_CONFIRMED);
    expect(sponsorIdentityNote({ text: "Sponsored by PrizeGrab. Enter to win a $750 Aldi gift card.", url: "https://prizegrab.com/join", prizeUsd: 750 })).toBeNull();
    expect(sponsorIdentityNote({ text: "Sponsored by PremiumCDKeys. Enter to win a game.", url: "https://gleam.io/KnVog/weekly", prizeUsd: 50 })).toBeNull();
    expect(sponsorIdentityNote({ text: READY, url: "https://unlisted-prizes.example/win", prizeUsd: 500 })).toBe(SPONSOR_NOT_CONFIRMED);
    expect(sponsorIdentityNote({ text: "Sponsored by Mystery LLC. Enter to win $8,000 cash.", url: "https://unlisted-prizes.example/win", prizeUsd: 8000 })).toBe(SPONSOR_NOT_CONFIRMED);

    const ready = await search("gift card", [{ url: "https://ready.example/enter", html: page("Ready Giveaway", `${READY}${FORM}`) }]);
    expect(ready.listings[0]?.listingGroup).toBe("verified");
    expect(ready.listings[0]?.lastChecked).toBe("2026-11-16");

    const stranger = await search("giveaway", [{ url: "https://unlisted-prizes.example/win", title: "Ready Giveaway", html: page("Ready Giveaway", `${READY}${FORM}`) }]);
    expect(stranger.listings.map((row) => `${row.listingGroup}: ${row.rulesNote}`)).toEqual([`check: ${SPONSOR_NOT_CONFIRMED}`]);
    expect(stranger.listings[0]?.rulesNote).toBe(SPONSOR_NOT_CONFIRMED);

    const gleam = await search("game", [{
      url: "https://gleam.io/KnVog/weekly-giveaway",
      html: page("Weekly Giveaway", `<p>No purchase necessary. Sponsored by PremiumCDKeys. Enter to win a video game. The sweepstakes ends on December 31, 2026. Must be 18 years or older. Open to legal residents of the United States. Winners will be selected in a random drawing.</p>${FORM}`),
    }]);
    expect(gleam.listings[0]?.listingGroup).toBe("verified");
  });

  it("does not verify when the rules page disagrees, and does not invent a year", async () => {
    expect(rulesAndEntryDisagree(
      "Enter to win a Honda generator. The sweepstakes ends on December 31, 2026.",
      "2026 Generator Giveaway",
      "Enter to win a Honda lawn mower. The sweepstakes ends on January 15, 2024.",
      "2024 Mower Giveaway",
    )).toBe(true);
    expect(rulesAndEntryDisagree(
      "Enter to win a $500 Amazon gift card. The sweepstakes ends on December 31, 2026.",
      "Gift Card Giveaway",
      "Enter to win a $500 Amazon.com gift card. The sweepstakes ends on December 31, 2026.",
      "Gift Card Giveaway",
    )).toBe(false);
    expect(rulesAndEntryDisagree(
      "Enter to win a trip. The sweepstakes ends on October 1.",
      "Trip Giveaway",
      "Enter to win a trip. The sweepstakes ends on October 1, 2027.",
      "Trip Giveaway",
    )).toBe(false);

    const entry = page(
      "2026 Truck Giveaway",
      `<p>No purchase necessary. Sponsored by Truck Co. Enter to win a truck. The sweepstakes ends on December 31, 2026. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing.</p><a href="https://truck.example/official-rules">Official rules</a>${FORM}`,
    );
    const rules = page(
      "2024 Truck Giveaway",
      `<p>No purchase necessary. Sponsored by Truck Co. Enter to win a boat. The sweepstakes ends on January 2, 2024. Open to legal residents of the United States who are 18 years or older.</p>`,
    );
    const found = await search("truck", [{ url: "https://truck.example/enter", html: entry }], [{ url: "https://truck.example/official-rules", html: rules }]);
    expect(found.listings[0]?.listingGroup).toBe("check");
    expect(found.listings[0]?.rulesNote).toBe(RULES_DISAGREE_NOTE);
  });

  it("blocks a bad Enter destination and keeps a post-win tax form", () => {
    const tax = `<p>No purchase necessary. Sponsored by Ready Sponsor. Winners must complete a W-9. A Social Security number is collected for tax reporting after a win.</p>${FORM}`;
    expect(enterDestinationNote(page("Ready", tax), "https://ready.example/enter")).toBeNull();
    expect(enterDestinationNote(page("Ask", `<form><label>SSN</label><input name="ssn"></form>`), "https://ready.example/enter")).toBe("Enter asks for an SSN before a win");
    expect(enterDestinationNote(page("Card", `<form><input name="cardnumber" placeholder="Credit card"></form>`), "https://ready.example/enter")).toBe("Enter asks for a card number before a win");
    expect(enterDestinationNote(page("Bank", `<form><label>Bank account</label><input name="routing"></form>`), "https://ready.example/enter")).toBe("Enter asks for a bank account before a win");
    expect(enterDestinationNote(page("Short", `<a href="https://bit.ly/abc">Enter</a>`), "https://ready.example/win")).toBe("Enter goes through a URL shortener");
    expect(enterDestinationNote(page("Aff", `<form action="https://shareasale.com/r.cfm?u=1"></form>`), "https://ready.example/win")).toBe("Enter goes through an affiliate redirect");
    expect(enterDestinationNote(page("Home", `<a href="https://ready.example/">Enter</a>`), "https://ready.example/win")).toBe("Enter leads to the brand homepage");
    expect(enterDestinationNote(page("Pdf", `<a href="https://ready.example/rules.pdf">Enter</a>`), "https://ready.example/win")).toBe("Enter leads to a PDF");
    expect(enterDestinationNote(page("Won", `<a href="https://ready.example/winners">Enter</a>`), "https://ready.example/win")).toBe("Enter leads to a winners page");
    expect(enterDestinationNote(page("Dir", `<a href="https://www.contestgirl.com/sweeps">Enter</a>`), "https://ready.example/win")).toBe("Enter leads to a sweepstakes directory");
    expect(stripTrackingParams("https://ready.example/enter?utm_source=brave&utm_medium=cpc&id=9")).toBe("https://ready.example/enter?id=9");
  });

  it("keeps a real gift-card sweepstakes and a post-win tax form verified", async () => {
    const gift = page(
      "$750 Aldi Gift Card",
      `<p>Sponsored by PrizeGrab. No purchase necessary. Enter to win a $750 Aldi gift card. Ends December 31, 2026. Open to legal residents who are 18 years or older. Winners will be selected in a random drawing. Winners must submit a W-9. Social Security numbers are used for tax reporting.</p>${FORM}`,
    );
    const found = await search("gift card", [{ url: "https://prizegrab.com/sweepstakes/giftcards/750-aldi/join/3/?utm_source=list", html: gift }]);
    const row = found.listings[0];
    expect(row?.listingGroup).toBe("verified");
    expect(row?.url).toBe("https://prizegrab.com/sweepstakes/giftcards/750-aldi/join/3/");
    expect(row?.rulesNote).not.toBe(SPONSOR_NOT_CONFIRMED);
  });

  it("refetches a stale sponsor page and drops Verified when the form is gone", async () => {
    expect(lastCheckedLabel("2026-11-01")).toBe("Last checked 2026-11-01");
    expect(needsSponsorRefetch({ url: "https://ready.example/enter", lastChecked: "2026-11-16", endIso: "2026-12-31" }, NOW)).toBe(false);
    expect(needsSponsorRefetch({ url: "https://ready.example/enter", lastChecked: "2026-11-09", endIso: "2026-12-31" }, NOW)).toBe(false);
    expect(needsSponsorRefetch({ url: "https://ready.example/enter", lastChecked: "2026-11-08", endIso: "2026-12-31" }, NOW)).toBe(true);
    expect(needsSponsorRefetch({ url: "https://ready.example/enter", lastChecked: "2026-11-14", endIso: "2026-11-18" }, NOW)).toBe(true);
    expect(needsSponsorRefetch({ url: "https://www.contestgirl.com/", lastChecked: "2026-10-01", endIso: "2026-11-17" }, NOW)).toBe(false);

    const base = {
      ...searchHitRow("https://ready.example/enter", "Ready Giveaway", ""),
      listingGroup: "verified" as const,
      formVerified: true,
      rulesVerified: true,
      endIso: "2026-12-31",
      lastChecked: "2026-11-01",
      rulesNote: "The official rules page was fetched.",
    };
    const gone = await recheckTrackedRow(base, {
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(page("Ready Giveaway", "<p>This promotion has been removed.</p>"), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(gone.listingGroup).toBe("check");
    expect(gone.rulesNote).toBe(entryFormGoneNote("2026-11-16"));

    const still = await recheckTrackedRow(base, {
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(page("Ready Giveaway", `<p>${READY}</p>${FORM}`), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(still.listingGroup).toBe("verified");
    expect(still.lastChecked).toBe("2026-11-16");

    const errored = await recheckTrackedRow(base, {
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response("no", { status: 500 });
      },
    });
    expect(errored.listingGroup).toBe("check");
    expect(errored.rulesNote).toBe(entryFormGoneNote("2026-11-16"));
  });

  it("reallocates a platform query toward rules pages and drops directory sources", async () => {
    expect(searchQueries("contest")).toHaveLength(5);
    expect(searchQueries("dirt bike")).toHaveLength(6);
    expect(platformSearchQueries("truck")).toHaveLength(2);
    expect(platformSearchQueries("truck")[0]).toContain("site:gleam.io");
    expect(platformSearchQueries("truck")[1]).toContain("official rules");
    expect(platformSearchQueries("truck")[1]).toContain("inurl:official-rules");
    expect(platformSearchQueries("truck")[1]).toContain("inurl:newsroom");
    expect(platformSearchQueries("truck")[1]).toContain("site:woobox.com");
    for (const domain of EXCLUDED_DIRECTORY_HOSTS) {
      expect(isExcludedDirectorySource(`https://www.${domain}/sweeps`)).toBe(true);
    }
    const found = await search("vacation", [
      { url: "https://www.sweepfeed.com/sweepstakes/category/cash", html: page("SweepFeed", `<p>${READY}</p>${FORM}`) },
      { url: "https://ultracontest.com/contests/win-a-vacation-sweepstakes", html: page("Ultra", `<p>${READY}</p>${FORM}`) },
      { url: "https://ready.example/enter", html: page("Ready Giveaway", `<p>${READY}</p>${FORM}`) },
    ]);
    expect(found.listings.map((row) => row.url)).toEqual(["https://ready.example/enter"]);
  });
});
