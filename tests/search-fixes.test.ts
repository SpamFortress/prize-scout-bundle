import { describe, expect, it } from "vitest";
import { endTagLabel, statedEndIso } from "@/domain/dates";
import { observeHtml } from "@/domain/interpret";
import { classifyRenderedPage } from "@/server/addon-check";
import { scanScamWarning } from "@/domain/rules-checklist";
import { braveCallBudget, isGunQuery, isObviousJunk, isPlatformMarketing, isPressWire, isVehicleQuery, searchQueries, synonymSearchQuery, watchedSiteQuery } from "@/domain/search-yield";
import { searchHitRow } from "@/domain/verified-entry";
import { absorbContestCopies, searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-11T15:00:00.000Z");
const FORM = `<form action="/enter"><input name="email"><button type="submit">Enter</button></form>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body>${body}${FORM}</body></html>`;
}

const RULES = `Official rules. Sponsored by American Honda Motor Co., Inc. Sponsor address: 1919 Torrance Blvd, Torrance, CA 90501.
No purchase necessary. A mail-in entry is available.
The sweepstakes begins on August 1, 2026 and ends on November 15, 2026.
Open to legal residents of the United States. Must be 18 years or older. Void in NY, FL, and RI.
Enter to win a Honda CRF450RX. The grand prize has an approximate retail value of $9000.
Odds of winning depend on the number of eligible entries.
Potential winners will be selected in a random drawing and notified by email. To request a winners list, mail a note to the sponsor.
The prize is delivered through a Honda dealer.`;

const FULL = `Official rules. Sponsored by Sample Sponsor LLC. Sponsor address: 1 Prize Road, Boise, ID 83702.
No purchase necessary. A mail-in entry is available.
The sweepstakes begins on January 1, 2026 and ends on March 1, 2027.
Open to legal residents of the United States. Must be 18 years or older.
The grand prize has an approximate retail value of $500.
Odds of winning depend on the number of eligible entries.
Potential winners will be selected in a random drawing and notified by email. To request a winners list, mail a note to the sponsor.`;

describe("vehicle queries", () => {
  it("treats powersports words as vehicle queries and keeps synonyms inside the call budget", () => {
    for (const query of ["ATV", "UTV", "SxS", "side by side", "side-by-side", "dirt bike", "dirtbike", "motorcycle", "motocross", "MX", "off-road", "snowmobile", "jet ski"]) {
      expect(isVehicleQuery(query)).toBe(true);
    }
    expect(isVehicleQuery("kitchen")).toBe(false);
    expect(watchedSiteQuery("dirt bike")).toContain("site:hodsonmotors.com");
    expect(watchedSiteQuery("UTV")).toContain("site:hodsonmotors.com");
    expect(watchedSiteQuery("kitchen")).not.toContain("site:hodsonmotors.com");
    expect(synonymSearchQuery("dirt bike")).toContain("ride red");
    expect(watchedSiteQuery("dirt bike")).toContain("site:powersports.honda.com");
    expect(synonymSearchQuery("dirt bike")).toContain("CRF");
    expect(synonymSearchQuery("dirt bike")).toContain("KTM");
    expect(synonymSearchQuery("dirt bike")).toContain("motorcycle");
    expect(synonymSearchQuery("UTV")).toContain("side by side");
    const queries = searchQueries("dirt bike");
    expect(queries).toHaveLength(6);
    expect(queries.some((item) => item.includes("CRF"))).toBe(true);
    expect(braveCallBudget("dirt bike")).toBe(6);
    expect(braveCallBudget("contest")).toBe(5);
    expect(searchQueries("contest")).toHaveLength(5);
  });

  it("treats a bare brand as its category in the query plan", () => {
    expect(searchQueries("Glock G43X MOS").some((item) => item.includes("site:guns.com"))).toBe(true);
    expect(searchQueries("Glock G43X MOS").some((item) => item.includes("site:guntalk.com"))).toBe(true);
    expect(searchQueries("Honda").some((item) => item.includes("site:powersports.honda.com"))).toBe(true);
    expect(searchQueries("Honda generator").some((item) => item.includes("site:powersports.honda.com"))).toBe(true);
    expect(searchQueries("Royal Caribbean").some((item) => item.includes("site:guns.com"))).toBe(false);
    expect(searchQueries("Carnival").some((item) => item.includes("site:powersports.honda.com"))).toBe(false);
    expect(searchQueries("cash").some((item) => item.includes("site:ramseysolutions.com"))).toBe(true);
    expect(searchQueries("Glock G43X MOS").length).toBeLessThanOrEqual(6);
    expect(searchQueries("Honda").length).toBeLessThanOrEqual(6);
  });

  it("puts gun brands on the live six-request plan", async () => {
    for (const brand of ["Glock", "SIG", "Sig Sauer", "Ruger", "Smith & Wesson", "S&W", "Mossberg", "Springfield"]) {
      expect(isGunQuery(brand), brand).toBe(true);
    }
    expect(isGunQuery("Glock G43X MOS")).toBe(true);
    const plan = searchQueries("Glock G43X MOS");
    expect(plan).toHaveLength(6);
    expect(braveCallBudget("Glock G43X MOS")).toBe(6);
    expect(plan.some((item) => item.includes("site:guns.com") && item.includes("site:guntalk.com"))).toBe(true);
    const sent: string[] = [];
    await searchVerifiedGiveaways("Glock G43X MOS", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 6,
      now: () => new Date("2026-11-12T15:00:00.000Z"),
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          sent.push(new URL(url).searchParams.get("q") ?? "");
          return Response.json({ web: { results: [] } });
        }
        return new Response("missing", { status: 404 });
      },
    });
    expect(sent).toHaveLength(6);
    expect(sent.some((item) => item.includes("site:guns.com"))).toBe(true);
  });

  it("opens one contest when only the snippet looks like a list", async () => {
    const hits = [
      { url: "https://www.example.com/12-truck-giveaways", title: "12 Truck Giveaways", description: "A roundup of truck giveaways." },
      { url: "https://powerequipment.honda.com/official-rules/12-days", title: "Honda Power Equipment 12 Days of Giveaways", description: "list of 12 truck giveaways" },
      { url: "https://www.vikingcruises.com/sweepstakes/2027-8-day-journey", title: "2027 8-day Journey Sweepstakes", description: "list of cruises and 12 truck giveaways" },
      { url: "https://www.united.com/en/us/sweepstakes/1000000-mile", title: "1000000 Mile Sweepstakes", description: "list of sweepstakes" },
    ];
    const fetched: string[] = [];
    const found = await searchVerifiedGiveaways("cruise", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) return Response.json({ web: { results: hits } });
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
        fetched.push(url);
        return new Response("<html><head><title>Contest</title></head><body><p>Details were not on this copy.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(fetched.some((url) => url.includes("12-truck-giveaways"))).toBe(false);
    expect(found.listings.find((row) => row.url.includes("12-truck-giveaways"))?.rulesNote).toMatch(/not opened/);
    expect(fetched.some((url) => url.includes("/official-rules/12-days"))).toBe(true);
    expect(fetched.some((url) => url.includes("8-day-journey"))).toBe(true);
    expect(fetched.some((url) => url.includes("1000000-mile"))).toBe(true);
  });

  it("reads the entry page named by a sponsor rules PDF and keeps one verified row", async () => {
    const entry = "https://powerequipment.honda.com/promotions/twelve-days-of-giveaways";
    const pdf = "https://cdn.powerequipment.honda.com/pe/pdf/twelve-days-rules.pdf";
    const rules = `<!doctype html><html><head><title>12 Days of Giveaways Official Rules</title></head><body><p>NO PURCHASE NECESSARY. Sponsored by American Honda Motor Co., Inc. Enter to win a Honda generator. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 24, 2026. Winners will be selected in a random drawing. Enter at ${entry}.</p></body></html>`;
    const form = `<!doctype html><html><head><title>12 Days of Giveaways</title></head><body><p>NO PURCHASE NECESSARY. Sponsored by American Honda Motor Co., Inc. Enter to win a Honda generator. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 24, 2026. Winners will be selected in a random drawing.</p><form action="/enter"><input type="email" name="email"><button type="submit">Enter</button></form></body></html>`;
    const found = await searchVerifiedGiveaways("Honda", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) return Response.json({ web: { results: [{ url: pdf, title: "12 Days of Giveaways Official Rules", description: "Official rules" }] } });
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
        if (url === pdf) return new Response(rules, { status: 200, headers: { "content-type": "text/html" } });
        if (url === entry) return new Response(form, { status: 200, headers: { "content-type": "text/html" } });
        return new Response("missing", { status: 404 });
      },
    });
    const row = found.listings.find((item) => item.listingGroup === "verified");
    expect(row?.url).toBe(entry);
    expect(row?.endIso).toBe("2026-12-24");
    expect(found.listings.some((item) => /did not treat this as an entry/i.test(item.rulesNote))).toBe(false);
  });

  it("opens the live a4f5929 titles that were skipped as lists", async () => {
    const hits = [
      { url: "https://www.example.com/12-truck-giveaways", title: "12 Truck Giveaways", description: "A roundup." },
      { url: "https://www.vikingcruises.com/ocean/2027-8-day-journey-sweepstakes", title: "2027 8-day Journey Sweepstakes | Viking Cruises", description: "list of cruises" },
      { url: "https://cruises.united.com/promotions/1000000-mile-sweepstakes", title: "1000000 Mile Sweepstakes | United Cruises", description: "list of sweepstakes" },
      { url: "https://cdn.powerequipment.honda.com/pe/12-days-of-giveaways.pdf", title: "12 Days of Giveaways | Honda Power Equipment", description: "12 truck giveaways" },
      { url: "https://cdn.powerequipment.honda.com/pe/share-to-win-official-rules.pdf", title: "Share to WIN Official Rules", description: "list of giveaways" },
    ];
    const fetched: string[] = [];
    const found = await searchVerifiedGiveaways("cruise", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) return Response.json({ web: { results: hits } });
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200, headers: { "content-type": "text/plain" } });
        fetched.push(url);
        return new Response("<html><head><title>Contest</title></head><body><p>Details were not on this copy.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(fetched.some((url) => url.includes("12-truck-giveaways"))).toBe(false);
    expect(found.listings.find((row) => row.url.includes("12-truck-giveaways"))?.rulesNote).toMatch(/This title is a list/);
    expect(found.listings.find((row) => row.url.includes("12-truck-giveaways"))?.placement).toBe("related");
    for (const part of ["8-day-journey", "1000000-mile", "12-days-of-giveaways.pdf", "share-to-win-official-rules.pdf"]) {
      expect(fetched.some((url) => url.includes(part)), part).toBe(true);
      expect(found.listings.find((row) => row.url.includes(part))?.rulesNote ?? "", part).not.toMatch(/This title is a list/);
    }
  });
});

describe("obvious junk", () => {
  it("drops reference sites, threads, press wires when a sponsor page exists, and platform marketing", () => {
    expect(isObviousJunk("https://en.wikipedia.org/wiki/Dirt_bike", "Dirt bike", "", "dirt bike")).toBe(true);
    expect(isObviousJunk("https://www.youtube.com/watch?v=1", "video", "", "dirt bike")).toBe(true);
    expect(isObviousJunk("https://www.facebook.com/groups/1", "thread", "", "dirt bike")).toBe(true);
    expect(isObviousJunk("https://www.reddit.com/r/dirtbikes/comments/1", "thread", "", "dirt bike")).toBe(true);
    expect(isObviousJunk("https://crosswordsolver.com/dirt", "Dirt", "", "dirt bike")).toBe(true);
    expect(isPlatformMarketing("https://gleam.io/pricing")).toBe(true);
    expect(isPlatformMarketing("https://gleam.io/blog/how-to")).toBe(true);
    expect(isPlatformMarketing("https://woobox.com/blog/promo")).toBe(true);
    expect(isPlatformMarketing("https://gleam.io/GRq5F/crf-ride-red")).toBe(false);
    expect(isPlatformMarketing("https://gleam.io/giveaways")).toBe(false);
    expect(isObviousJunk("https://races.example/calendar", "2026 dirt bike race calendar", "", "dirt bike")).toBe(true);
    expect(isObviousJunk("https://hope.example/donate", "Donate to a charity", "Send a gift", "dirt bike")).toBe(true);
    expect(isObviousJunk("https://dreamgiveaway.com/win", "Charity giveaway", "Enter to win", "dirt bike")).toBe(false);
    expect(isPressWire("https://www.einpresswire.com/article/1")).toBe(true);
    expect(isPressWire("https://www.prnewswire.com/news/1")).toBe(true);
  });
});

describe("end dates and scam phrases", () => {
  it("reads a stated end date and does not warn on ordinary winner taxes", () => {
    expect(statedEndIso("Ended October 31, 2026.")).toBe("2026-10-31");
    expect(statedEndIso("Ends 11/15/2026.")).toBe("2026-11-15");
    expect(statedEndIso("ends 11:59 p.m. Eastern Time on November 18, 2026.")).toBe("2026-11-18");
    expect(statedEndIso("This copy ended 5/31/2026.")).toBe("2026-05-31");
    expect(statedEndIso("We're giving away $500 every week through December 20, plus a grand prize.", new Date("2026-11-12T15:00:00.000Z"))).toBe("2026-12-20");
    expect(statedEndIso("The 2025 promotion runs weekly through January 3.", new Date("2026-11-12T15:00:00.000Z"))).toBe("2025-01-03");
    expect(statedEndIso("Giveaway ends July 1, 11:59 PM PST.")).toBeNull();
    expect(statedEndIso("Now through October 1, Food Town is giving away a PlayStation.", new Date("2026-11-16T00:00:00.000Z"))).toBeNull();
    expect(scanScamWarning("Winners may be required to provide SSN for tax reporting.")).toEqual([]);
    expect(scanScamWarning("You must pay the taxes to claim the prize.").length).toBeGreaterThan(0);
    expect(statedEndIso("ends on January 10th, 2027")).toBe("2027-01-10");
    expect(statedEndIso("Ends 11:59pm PST Dec 3rd 2026")).toBe("2026-12-03");
    expect(endTagLabel("2026-10-31", NOW)).toBe("Ended 10/31/2026");
    expect(endTagLabel("2026-11-15", NOW)).toBe("Ends 11/15/2026");
    expect(scanScamWarning("Pay shipping to claim your prize before we send it.")).toEqual(["Pay shipping to claim your prize before we send it."]);
    expect(scanScamWarning("Pay shipping to receive your prize.")).toEqual(["Pay shipping to receive your prize."]);
    expect(scanScamWarning("A processing fee is required to claim the prize.")).toEqual(["A processing fee is required to claim the prize."]);
    expect(scanScamWarning("The winner is responsible for all taxes, title, and registration. The winner must sign a release and waiver.")).toEqual([]);
    expect(scanScamWarning("The winner is responsible for taxes, title, registration, and shipping fees.")).toEqual([]);
    expect(scanScamWarning("Earn 1 entry per $1 spent in the store. No purchase necessary.")).toEqual([]);
  });

  it("drops a past copy when the official page is listed and keeps the copy when it is not", () => {
    const official = { ...searchHitRow("https://dirtbikechannel.com/fall", "Dirt Bike Channel Fall Giveaway", ""), endIso: "2026-11-30" };
    const stale = { ...searchHitRow("https://offerscontest.com/dbc", "Dirt Bike Channel Fall Giveaway", "ended May 31, 2026"), endIso: "2026-05-31" };
    const merged = absorbContestCopies([official, stale]);
    expect(merged.map((row) => row.url)).toEqual(["https://dirtbikechannel.com/fall"]);
    expect(merged[0]?.endIso).toBe("2026-11-30");
    const alone = absorbContestCopies([stale]);
    expect(alone).toHaveLength(1);
    expect(endTagLabel(alone[0]!.endIso ?? "", NOW)).toBe("Ended 05/31/2026");
    const blocked = { ...searchHitRow("https://www.superatv.com/win", "SuperATV Win", ""), sponsorPageBlocked: true, endIso: null };
    const copy = { ...searchHitRow("https://winprizesonline.com/superatv", "SuperATV UTV Giveaway", ""), endIso: "2026-10-31" };
    const filled = absorbContestCopies([blocked, copy]);
    expect(filled.map((row) => row.url)).toEqual(["https://www.superatv.com/win"]);
    expect(filled[0]?.endIso).toBe("2026-10-31");
  });
});

describe("search fixtures", () => {
  it("keeps a press wire when it is the only page", async () => {
    const found = await searchVerifiedGiveaways("dirt bike", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [{ url: "https://www.prnewswire.com/news/honda-crf", title: "Honda CRF release", description: "A sweepstakes announcement." }] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(page("Honda CRF release", "<p>A sweepstakes announcement. No purchase necessary.</p>"), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(found.listings.map((row) => row.url)).toContain("https://www.prnewswire.com/news/honda-crf");
  });

  it("ranks the Honda and Elite pages, follows rules links, and marks a blocked sponsor ended", async () => {
    const results = [
      { url: "https://en.wikipedia.org/wiki/Dirt_bike", title: "Dirt bike", description: "Encyclopedia" },
      { url: "https://www.youtube.com/watch?v=dirt", title: "Dirt bike video", description: "A thread" },
      { url: "https://powersports.honda.com/crf450rx-rideredandwinsweepstakes", title: "Honda CRF450RX Ride Red Sweepstakes", description: "Ride Red and Win" },
      { url: "https://www.elitemotofactory.com/officialrules", title: "Elite Moto Factory Official Rules", description: "Paid entry and mail-in" },
      { url: "https://www.sweepsdb.com/", title: "SweepsDB", description: "Directory" },
      { url: "https://www.einpresswire.com/article/honda-crf", title: "Honda CRF press release", description: "Wire copy" },
      { url: "https://gleam.io/pricing", title: "Gleam pricing", description: "Plans" },
      { url: "https://gleam.io/GRq5F/crf-ride-red", title: "CRF campaign", description: "Campaign" },
      { url: "https://www.superatv.com/win", title: "SuperATV Win", description: "SuperATV UTV giveaway" },
      { url: "https://winprizesonline.com/superatv", title: "SuperATV UTV Giveaway", description: "Aggregator copy" },
      { url: "https://www.blueribboncoalition.org/giveaway", title: "BlueRibbon Coalition Giveaway", description: "Enter" },
      { url: "https://dirtbikechannel.com/fall", title: "Dirt Bike Channel Fall Giveaway", description: "Fall giveaway" },
      { url: "https://offerscontest.com/dbc", title: "Dirt Bike Channel Fall Giveaway", description: "Old copy" },
      { url: "https://rufftuff.com/giveaway", title: "Ruff Tuff Giveaway", description: "Official rules" },
      { url: "https://www.facebook.com/groups/dirtbike/posts/1", title: "Facebook thread", description: "Discussion" },
      { url: "https://www.reddit.com/r/dirtbikes/comments/1", title: "Reddit thread", description: "Discussion" },
      { url: "https://races.example/calendar", title: "2026 dirt bike race calendar", description: "Upcoming races" },
      { url: "https://hope.example/donate", title: "Donate to a charity", description: "Send a gift" },
      { url: "https://www.thesaurus.com/browse/dirt", title: "Dirt", description: "Synonyms" },
    ];
    const pages = new Map<string, { status?: number; body: string; type?: string }>([
      ["https://powersports.honda.com/crf450rx-rideredandwinsweepstakes", { body: page("Honda CRF450RX Ride Red Sweepstakes", `<p>Enter the CRF450RX Ride Red and Win Sweepstakes.</p><a href="https://content.services.honda.com/crf450rx-rules.pdf">Official Rules</a>`) }],
      ["https://content.services.honda.com/crf450rx-rules.pdf", { body: RULES, type: "application/pdf" }],
      ["https://www.elitemotofactory.com/officialrules", { body: page("Elite Moto Factory Official Rules", "<p>Official rules. Paid entry is $75. A mail-in alternate method of entry is available. No purchase necessary. Must be 18 years or older. Ends February 24, 2027.</p>") }],
      ["https://gleam.io/GRq5F/crf-ride-red", { body: page("CRF campaign", "<p>No purchase necessary. Official rules. One entry per person.</p>") }],
      ["https://www.superatv.com/win", { status: 403, body: "blocked" }],
      ["https://winprizesonline.com/superatv", { body: page("SuperATV UTV Giveaway", "<p>Ended October 31, 2026. Copy of the SuperATV contest.</p>") }],
      ["https://www.blueribboncoalition.org/giveaway", { body: page("BlueRibbon Coalition Giveaway", `<p>Enter the drawing.</p><a href="https://www.blueribboncoalition.org/official-rules">Official Rules</a>`) }],
      ["https://www.blueribboncoalition.org/official-rules", { body: page("BlueRibbon Coalition Official Rules", `<p>${FULL}</p>`) }],
      ["https://dirtbikechannel.com/fall", { body: page("Dirt Bike Channel Fall Giveaway", `<p>Must be 18 years or older.</p><a href="https://bit.ly/DBCFall2026">Rules</a>`) }],
      ["https://bit.ly/DBCFall2026", { body: page("Dirt Bike Channel Rules", `<p>${FULL}</p>`) }],
      ["https://offerscontest.com/dbc", { body: page("Dirt Bike Channel Fall Giveaway", "<p>This copy ended May 31, 2026.</p>") }],
      ["https://rufftuff.com/giveaway", { body: page("Ruff Tuff Giveaway", "<p>Official rules. The winner is responsible for all taxes, title, and registration. The winner must sign a release and waiver. No purchase necessary. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p>") }],
    ]);
    const found = await searchVerifiedGiveaways("dirt bike", {
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
        return new Response(hit.body, { status: 200, headers: { "content-type": hit.type ?? "text/html" } });
      },
    });
    const urls = found.listings.map((row) => row.url);
    const honda = found.listings.find((row) => row.url.includes("powersports.honda.com"));
    const elite = found.listings.find((row) => row.url.includes("elitemotofactory.com"));
    const directory = found.listings.find((row) => row.url.includes("sweepsdb.com"));
    const superatv = found.listings.find((row) => row.url.includes("superatv.com"));
    const blue = found.listings.find((row) => row.url.includes("blueribboncoalition.org/giveaway"));
    const dbc = found.listings.find((row) => row.url.includes("dirtbikechannel.com"));
    const ruff = found.listings.find((row) => row.url.includes("rufftuff.com"));
    expect(honda?.endIso).toBe("2026-11-15");
    expect(honda?.ageTag).toBe("18+");
    expect(honda?.excludedStates).toEqual(expect.arrayContaining(["NY", "FL", "RI"]));
    expect(honda?.rulesFoundCount).toBeGreaterThan(0);
    expect(elite?.methods).toContain("paid");
    expect(elite?.freeMethodLabel).toMatch(/Free method/i);
    expect(elite?.endIso).toBe("2027-02-24");
    expect(elite?.ageTag).toBe("18+");
    expect(urls.indexOf(honda!.url)).toBeLessThan(urls.indexOf(directory!.url));
    expect(directory?.unreadDirectory).toBe(true);
    expect(blue?.rulesFoundCount).toBe(7);
    expect(dbc?.rulesFoundCount).toBeNull();
    expect(superatv?.endIso).toBe("2026-10-31");
    expect(superatv?.sponsorPageBlocked).toBe(true);
    expect(endTagLabel(superatv!.endIso!, NOW)).toBe("Ended 10/31/2026");
    expect(ruff?.scamPhrases).toEqual([]);
    expect(urls.some((url) => url.includes("gleam.io/GRq5F"))).toBe(true);
    for (const gone of ["wikipedia.org", "youtube.com", "facebook.com", "reddit.com", "einpresswire.com", "gleam.io/pricing", "races.example", "hope.example", "thesaurus.com", "winprizesonline.com", "offerscontest.com"]) {
      expect(urls.some((url) => url.includes(gone))).toBe(false);
    }
  });
});

const TOYOTA_URL = "https://ovrlnd.com/pages/1986-toyota-pickup-xtracab-4wd-dlx";

function toyotaPage(rulesHref: string): string {
  return page(
    "1986 Toyota Pickup Xtracab 4WD DLX",
    `<p>Enter to win the 1986 Toyota Pickup Xtracab 4WD DLX. No purchase necessary. Ends 11:59pm PST Dec 3rd 2026.</p><a href="${rulesHref}">Sweepstakes</a>`,
  );
}

describe("on-page end dates and same-domain rules", () => {
  it("keeps the calendar day in the stated zone and does not verify the product page", () => {
    const html = toyotaPage("https://ovrlnd.com/pages/toyota-rules");
    const observed = observeHtml(html, TOYOTA_URL, NOW);
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    expect(observed.contest.due.proven && observed.contest.due.isoDate).toBe("2026-12-03");
    expect(observed.contest.rulesTimeZone?.iana).toBe("America/Los_Angeles");
    const row = classifyRenderedPage(html, TOYOTA_URL, NOW);
    expect(row.endIso).toBe("2026-12-03");
    expect(row.listingGroup).not.toBe("verified");
    expect(row.openRulesUrl).toBe("https://ovrlnd.com/pages/toyota-rules");
  });

  it("opens a same-domain rules page inside the page budget and folds it only when it names this contest", async () => {
    const calls: string[] = [];
    const rules = page(
      "1986 Toyota Pickup Xtracab Official Rules",
      "<p>No purchase necessary. The 1986 Toyota Pickup Xtracab sweepstakes ends December 3, 2026. Open to legal residents of the United States. Must be 18 years or older. Sponsor: Overland. One entry per person.</p>",
    );
    const found = await searchVerifiedGiveaways("toyota pickup", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: {
              results: [
                { url: TOYOTA_URL, title: "1986 Toyota Pickup Xtracab Giveaway", description: "Ends 11:59pm PST Dec 3rd 2026" },
                { url: "https://example.com/city-notes", title: "City notes", description: "A local story" },
              ],
            },
          });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url === TOYOTA_URL) return new Response(toyotaPage("https://ovrlnd.com/pages/toyota-rules"), { status: 200, headers: { "content-type": "text/html" } });
        if (url === "https://ovrlnd.com/pages/toyota-rules") return new Response(rules, { status: 200, headers: { "content-type": "text/html" } });
        return new Response("unrelated", { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const opened = calls.filter((url) => !url.includes("api.search.brave.com") && !url.endsWith("/robots.txt"));
    expect(calls.filter((url) => url.includes("api.search.brave.com"))).toHaveLength(1);
    expect(opened[0]).toBe(TOYOTA_URL);
    expect(opened.indexOf("https://ovrlnd.com/pages/toyota-rules")).toBeGreaterThan(opened.indexOf(TOYOTA_URL));
    expect(opened).not.toContain("https://example.com/city-notes");
    const row = found.listings.find((item) => item.url === TOYOTA_URL);
    expect(row?.endIso).toBe("2026-12-03");
    expect(row?.rulesTimeZone.iana).toBe("America/Los_Angeles");
    expect(row?.ageTag).toBe("18+");
    expect(row?.rulesNote).toBe("Sponsor not confirmed");
    expect(row?.listingGroup).not.toBe("verified");
  });

  it("does not fold a shared rules page or a rules page that names a different contest", async () => {
    async function run(rulesUrl: string, rulesHtml: string) {
      return searchVerifiedGiveaways("toyota pickup", {
        apiKey: "test-key",
        searchUrl: "https://api.search.brave.com/res/v1/web/search",
        maxBraveCalls: 1,
        now: () => NOW,
        lookupImpl: async () => ["93.184.216.34"],
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("api.search.brave.com")) {
            return Response.json({ web: { results: [{ url: TOYOTA_URL, title: "1986 Toyota Pickup Xtracab Giveaway", description: "Sweepstakes" }] } });
          }
          if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
          if (url === TOYOTA_URL) return new Response(toyotaPage(rulesUrl), { status: 200, headers: { "content-type": "text/html" } });
          if (url === rulesUrl) return new Response(rulesHtml, { status: 200, headers: { "content-type": "text/html" } });
          return new Response("missing", { status: 404 });
        },
      });
    }
    const shared = await run(
      "https://ovrlnd.com/pages/sweeprules",
      page("Store rules", "<p>The 1986 Toyota Pickup Xtracab sweepstakes ends December 3, 2026. The Milwaukee tool giveaway ends November 21, 2026. No purchase necessary.</p>"),
    );
    const sharedRow = shared.listings.find((item) => item.url === TOYOTA_URL);
    expect(sharedRow?.endIso).toBe("2026-12-03");
    expect(sharedRow?.listingGroup).not.toBe("verified");
    expect(sharedRow?.rulesNote).toBe("The rules link is a shared page, so it was not folded in.");
    const other = await run(
      "https://ovrlnd.com/pages/sweeprules",
      page("Store rules", "<p>The Milwaukee tool giveaway ends November 21, 2026. No purchase necessary. Open to legal residents of the United States.</p>"),
    );
    const otherRow = other.listings.find((item) => item.url === TOYOTA_URL);
    expect(otherRow?.endIso).toBe("2026-12-03");
    expect(otherRow?.listingGroup).not.toBe("verified");
    expect(otherRow?.rulesNote).toBe("The rules page does not name this contest, so it was not folded in.");
  });
});
