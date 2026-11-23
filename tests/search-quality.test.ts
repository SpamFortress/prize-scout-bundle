import { describe, expect, it } from "vitest";
import { fetchedPageLabel } from "@/app/design-preview/entries-sample";
import { statedEndIso } from "@/domain/dates";
import { isSponsorshipOnly, prizeMatchesQuery, queryConceptGroups } from "@/domain/result-quality";
import { braveCallBudget, searchQueries } from "@/domain/search-yield";
import { confidenceTier, searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-11T15:00:00.000Z");
const FORM = `<form action="/enter"><input name="email"><button type="submit">Enter</button></form>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body>${body}${FORM}</body></html>`;
}

const RIDE_RED = page(
  "Honda CRF450RX Ride Red and Win Sweepstakes",
  "<p>Official rules. No purchase necessary. Sponsored by American Honda. Enter to win a Honda CRF450RX dirt bike. Must be 18 years or older. Ends November 15, 2026. Void in NY, FL, and RI.</p>",
);

async function search(query: string, results: Array<{ url: string; title: string; description?: string; html?: string; status?: number; type?: string }>) {
  const pages = new Map(results.filter((item) => item.html || item.status).map((item) => [item.url, item]));
  return searchVerifiedGiveaways(query, {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls: 6,
    now: () => NOW,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return Response.json({ web: { results: results.map((item) => ({ url: item.url, title: item.title, description: item.description ?? "" })) } });
      }
      if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
      const hit = pages.get(url);
      if (!hit) return new Response("missing", { status: 404 });
      if (hit.status) return new Response(hit.html ?? "no", { status: hit.status, headers: { "content-type": "text/html" } });
      return new Response(hit.html ?? "", { status: 200, headers: { "content-type": hit.type ?? "text/html" } });
    },
  });
}

describe("verified requires contest signals", () => {
  it("keeps store, how-to, news, marketplace, deals, and the sweepstakes index below a real entry", async () => {
    const real = page("Roblox Gift Card Sweepstakes", "<p>Official rules. No purchase necessary. Sponsored by Roblox. Enter to win a Roblox gift card. Must be 18 years or older. Ends December 31, 2026.</p>");
    const found = await search("gift card", [
      { url: "https://www.roblox.com/gift-cards", title: "Buy Roblox & Robux Gift Cards", html: page("Buy Roblox & Robux Gift Cards", "<p>Add to cart. In stock. Shop Robux.</p>") },
      { url: "https://kickofflabs.com/guide", title: "Giveaway Guide", html: page("Giveaway Guide", "<p>How to run a giveaway for your brand.</p>") },
      { url: "https://www.rafflepress.com/how-to", title: "How to Do a Gift Card Giveaway", html: page("How to Do a Gift Card Giveaway", "<p>Step by step instructions for marketers.</p>") },
      { url: "https://fox8.com/raffle-news", title: "Fox 8 Raffle News", html: page("Fox 8 Raffle News", "<p>A reporter covers a local raffle.</p>") },
      { url: "https://gameflip.com/shop", title: "Gameflip Marketplace", html: page("Gameflip Marketplace", "<p>Buy and sell game items.</p>") },
      { url: "https://www.goodsearch.com/deals", title: "Goodsearch Daily Deals", html: page("Goodsearch Daily Deals", "<p>Coupons and cash back.</p>") },
      { url: "https://www.foodnetwork.com/sweepstakes", title: "Food Network Sweepstakes", description: "Index" },
      { url: "https://www.roblox.com/promotions/gift-card-sweepstakes", title: "Roblox Gift Card Sweepstakes", html: real },
    ]);
    const urls = found.listings.map((row) => row.url);
    expect(urls).toContain("https://www.roblox.com/gift-cards");
    expect(urls).toContain("https://kickofflabs.com/guide");
    expect(urls).toContain("https://www.rafflepress.com/how-to");
    expect(urls).toContain("https://fox8.com/raffle-news");
    expect(urls).toContain("https://gameflip.com/shop");
    expect(urls).toContain("https://www.goodsearch.com/deals");
    expect(urls).toContain("https://www.foodnetwork.com/sweepstakes");
    const realRow = found.listings.find((row) => row.url.includes("/promotions/gift-card-sweepstakes"));
    expect(realRow?.listingGroup).toBe("verified");
    expect(fetchedPageLabel({ liveVerified: true, listingGroup: realRow?.listingGroup })).toMatch(/^Verified page/);
    for (const url of ["roblox.com/gift-cards", "kickofflabs.com", "rafflepress.com", "fox8.com", "gameflip.com", "goodsearch.com", "foodnetwork.com/sweepstakes"]) {
      const row = found.listings.find((item) => item.url.includes(url));
      expect(row?.listingGroup === "directory" || row?.listingGroup === "check").toBe(true);
      expect(fetchedPageLabel({ liveVerified: true, listingGroup: row?.listingGroup })).toMatch(/^Check the page/);
      expect(urls.indexOf(realRow!.url)).toBeLessThan(urls.indexOf(row!.url));
    }
    expect(found.listings.find((row) => row.url.includes("foodnetwork.com"))?.unreadDirectory).toBe(true);
  });
});

describe("bare brand queries", () => {
  it("asks for the brand sweepstakes and giveaway, and keeps power-equipment rules above sponsorships", async () => {
    const queries = searchQueries("Honda");
    expect(queries.some((item) => item.toLowerCase().includes("honda sweepstakes"))).toBe(true);
    expect(queries.some((item) => item.toLowerCase().includes("honda giveaway"))).toBe(true);
    expect(queries.length).toBeLessThanOrEqual(6);
    expect(braveCallBudget("Honda")).toBeLessThanOrEqual(6);
    expect(braveCallBudget("dirt bike")).toBeLessThanOrEqual(6);
    expect(braveCallBudget("Honda dirt bike")).toBeLessThanOrEqual(6);
    const found = await search("Honda", [
      { url: "https://topgolf.com/honda-classic", title: "Topgolf Honda Classic", html: page("Topgolf Honda Classic", "<p>Official rules. Honda sponsors the golf tournament. Must be 18 years or older. Ends December 31, 2026.</p>") },
      { url: "https://www.nhl.com/ducks/rules", title: "Anaheim Ducks Rules", html: page("Anaheim Ducks Rules", "<p>Official rules. Honda is a team sponsor. Must be 18 years or older. Ends December 31, 2026.</p>") },
      { url: "https://www.newyorkjets.com/", title: "New York Jets Homepage", html: page("New York Jets Homepage", "<p>The official site. Honda is a partner.</p>") },
      { url: "https://dealer.honda.com/test-drive", title: "Honda Test Drive to Win", html: page("Honda Test Drive to Win", "<p>Official rules. Test drive a Honda and enter to win. Must be 18 years or older. Ends December 31, 2026.</p>") },
      { url: "https://news.honda.com/technicians", title: "Honda Technician Contest", html: page("Honda Technician Contest", "<p>Technicians competed and Honda announced a winner.</p>") },
      { url: "https://powerequipment.honda.com/rules", title: "Honda Power Equipment Sweepstakes", html: page("Honda Power Equipment Sweepstakes", "<p>Official rules. No purchase necessary. Sponsored by American Honda. Enter to win a Honda generator. Must be 18 years or older. Ends December 31, 2026.</p>") },
    ]);
    const power = found.listings.find((row) => row.url.includes("powerequipment.honda.com"));
    expect(power?.listingGroup).toBe("verified");
    expect(power?.weakMatch).not.toBe(true);
    for (const host of ["topgolf.com", "nhl.com", "newyorkjets.com", "dealer.honda.com", "news.honda.com"]) {
      const row = found.listings.find((item) => item.url.includes(host));
      expect(row).toBeTruthy();
      expect(found.listings.indexOf(power!)).toBeLessThan(found.listings.indexOf(row!));
      expect(row?.listingGroup).not.toBe("verified");
    }
  });
});

describe("prize relevance", () => {
  it("demotes a different prize even when the query word appears somewhere else", async () => {
    expect(prizeMatchesQuery("side by side", "Every Child Deserves A Bike", "A bicycle for a child")).toBe(false);
    expect(prizeMatchesQuery("side by side", "Win a Polaris UTV", "")).toBe(true);
    expect(prizeMatchesQuery("video game gift card", "Wagamama Gift Card", "A restaurant gift card")).toBe(false);
    expect(prizeMatchesQuery("video game gift card", "Roblox Gift Card Sweepstakes", "Roblox gift card")).toBe(true);
    expect(prizeMatchesQuery("truck", "Truck Giveaway Free Plan", "A woodworking plan")).toBe(false);
    expect(prizeMatchesQuery("truck", "Win a Ford Truck", "Ford truck")).toBe(true);
    expect(queryConceptGroups("giveaway")).toEqual([]);
    const found = await search("side by side", [
      { url: "https://bikes.example/win", title: "Every Child Deserves A Bike Sweepstakes", html: page("Every Child Deserves A Bike Sweepstakes", "<p>No purchase necessary. Official rules. Enter to win a bicycle. Sponsored by Bike Charity, 1 Wheel Road, Boise, ID 83702. Must be 18 years or older. The sweepstakes begins on January 1, 2026 and ends on December 31, 2026. Winners will be selected in a random drawing. Odds of winning depend on entries. Approximate retail value of $200. The word side appears in the footer.</p>") },
      { url: "https://polaris.example/win", title: "Win a Polaris UTV", html: page("Win a Polaris UTV", "<p>Official rules. No purchase necessary. Sponsored by Polaris. Enter to win a side by side. Must be 18 years or older. Ends December 31, 2026.</p>") },
    ]);
    const utv = found.listings.find((row) => row.url.includes("polaris.example"));
    const bike = found.listings.find((row) => row.url.includes("bikes.example"));
    expect(utv?.listingGroup).toBe("verified");
    expect(bike?.listingGroup).toBe("verified");
    expect(found.listings.indexOf(utv!)).toBeLessThan(found.listings.indexOf(bike!));
    expect(confidenceTier(utv!, NOW)).toBe(1);
    expect(confidenceTier(bike!, NOW)).toBe(1);
  });
});

describe("Ride Red regression", () => {
  it("keeps the CRF450RX page for dirt bike queries when Brave returned it", async () => {
    expect(searchQueries("dirt bike").some((item) => /motocross/i.test(item))).toBe(true);
    expect(searchQueries("Honda dirt bike").length).toBeLessThanOrEqual(6);
    const results = [
      { url: "https://news.example/dirt", title: "Dirt bike race calendar notes", html: page("Dirt bike race calendar notes", "<p>A news roundup. No entry.</p>") },
      { url: "https://powersports.honda.com/crf450rx-rideredandwinsweepstakes", title: "Honda CRF450RX Ride Red and Win Sweepstakes", html: RIDE_RED },
    ];
    for (const query of ["dirt bike", "Honda dirt bike"]) {
      const found = await search(query, results);
      const ride = found.listings.find((row) => row.url.includes("crf450rx-rideredandwinsweepstakes"));
      expect(ride?.listingGroup).toBe("verified");
      expect(ride?.endIso).toBe("2026-11-15");
      expect(found.listings[0]?.url).toBe(ride?.url);
      expect(ride?.rulesUrl).toBeTruthy();
    }
    expect(isSponsorshipOnly("Honda", "Honda Power Equipment Sweepstakes", "Enter to win a Honda generator.")).toBe(false);
  });
});

describe("real retest cases", () => {
  it("does not verify news, archives, or a past contest, and keeps real sponsor pages verified", async () => {
    expect(statedEndIso("This sweepstakes ended in 2011.")).toBe("2011-12-31");
    const truck = page(
      "Win a Ford Truck",
      "<p>No purchase necessary. Official rules. Enter to win a Ford truck. Must be 18 years or older. The sweepstakes begins on January 1, 2026 and ends on December 31, 2026. Sponsored by Ford Motor Company, 1 American Road, Dearborn, MI 48126. Odds of winning depend on entries. Winners will be selected in a random drawing. Approximate retail value of $50,000.</p>",
    );
    const dream = page(
      "Dream Giveaway C30",
      "<p>No purchase necessary. Official rules. Enter to win a 2026 Cadillac. Must be 18 years or older. The sweepstakes begins on January 1, 2026 and ends on December 31, 2026. Sponsored by New Beginning Children's Homes. Odds of winning depend on entries. Winners will be selected in a random drawing. Approximate retail value of $80,000.</p>",
    );
    const found = await search("truck", [
      { url: "https://fox8.com/news/man-wins-truck", title: "Local man wins a new truck", html: page("Local man wins a new truck", "<p>Fox 8 reported that a winner was drawn last week. The truck was awarded Saturday. Read the official rules on the sponsor site.</p><a href=\"https://sponsor.example/rules\">rules</a>") },
      { url: "https://www.moneypantry.com/giveaways", title: "Truck Giveaways", html: page("Truck Giveaways", "<p>We round up giveaways. Click through for details.</p><a href=\"https://sponsor.example/official-rules\">Official Rules</a>") },
      { url: "https://www.dreamgiveaway.com/c30", title: "Dream Giveaway C30", html: dream },
      { url: "https://www.sandals.com/sweepstakes", title: "Sandals Vacation Sweepstakes", html: page("Sandals Vacation Sweepstakes", "<p>No purchase necessary. Official rules. Sponsored by Sandals Resorts. Enter to win a Sandals vacation. Must be 18 years or older. Ends December 31, 2026.</p>") },
      { url: "https://www.kitchenaid.com/giveaway", title: "KitchenAid Stand Mixer Sweepstakes", html: page("KitchenAid Stand Mixer Sweepstakes", "<p>No purchase necessary. Official rules. Sponsored by KitchenAid. Enter to win a KitchenAid stand mixer. Must be 18 years or older. Ends December 31, 2026.</p>") },
      { url: "https://powersports.honda.com/2011-giveaway", title: "2011 Honda CRF Giveaway", html: page("2011 Honda CRF Giveaway", "<p>No purchase necessary. Enter to win a 2011 Honda CRF. This sweepstakes ended in 2011. Must be 18 years or older. Official rules.</p>") },
      { url: "https://ford.example/truck", title: "Win a Ford Truck", html: truck },
    ]);
    const row = (host: string) => found.listings.find((item) => item.url.includes(host));
    expect(row("fox8.com")?.listingGroup).toBe("check");
    expect(row("moneypantry.com")?.listingGroup).toBe("check");
    expect(fetchedPageLabel({ liveVerified: true, listingGroup: row("fox8.com")?.listingGroup })).toMatch(/^Check the page/);
    expect(row("dreamgiveaway.com")?.listingGroup).toBe("verified");
    expect(row("sandals.com")?.listingGroup).toBe("verified");
    expect(row("kitchenaid.com")?.listingGroup).toBe("verified");
    expect(row("ford.example")?.listingGroup).toBe("verified");
    expect(row("powersports.honda.com")?.listingGroup).not.toBe("verified");
    expect(row("powersports.honda.com")?.endIso).toBe("2011-12-31");
    expect(confidenceTier(row("powersports.honda.com")!, NOW)).toBe(4);
    const order = found.listings.map((item) => item.url);
    expect(order.indexOf(row("ford.example")!.url)).toBeLessThan(order.indexOf(row("dreamgiveaway.com")!.url));
    expect(order.indexOf(row("dreamgiveaway.com")!.url)).toBeLessThan(order.indexOf(row("fox8.com")!.url));
    expect(order.indexOf(row("fox8.com")!.url)).toBeLessThan(order.indexOf(row("powersports.honda.com")!.url));
  });

  it("fetches a sponsor page ahead of roundup domains inside the read cap", async () => {
    const roundups = Array.from({ length: 55 }, (_, index) => ({
      url: `https://www.moneypantry.com/giveaway/${index}`,
      title: `Archive ${index}`,
      html: page(`Archive ${index}`, "<p>A list of other people's giveaways.</p>"),
    }));
    const sponsor = {
      url: "https://ford.example/truck",
      title: "Win a Ford Truck",
      html: page("Win a Ford Truck", "<p>No purchase necessary. Official rules. Sponsored by Ford. Enter to win a Ford truck. Must be 18 years or older. Ends December 31, 2026.</p>"),
    };
    const found = await search("truck", [...roundups, sponsor]);
    expect(found.listings.some((row) => row.url === sponsor.url && row.listingGroup === "verified")).toBe(true);
    expect(found.listings.some((row) => row.rulesNote.includes("search stopped before this page"))).toBe(true);
  });
});

const RULES = `<p>No purchase necessary. Sponsored by the page sponsor. Enter to win a named prize. Must be 18 years or older. The sweepstakes begins on January 1, 2026 and ends on December 31, 2026. Winners will be selected in a random drawing. Odds of winning depend on the number of eligible entries. Approximate retail value of $1,000.</p>`;

function landing(title: string, rulesHref: string, extra = ""): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>
<p>${title}</p>
${extra}
<iframe src="https://gleam.io/abc/widget"></iframe>
<a href="${rulesHref}">Official Rules</a>
</body></html>`;
}

describe("own rules, widgets, and pages that are never verified", () => {
  it("verifies sponsor landings from their own rules and an embedded entry", async () => {
    const rules = (sponsor: string, prize: string) => page(
      "Official Rules",
      RULES.replace("the page sponsor", sponsor).replace("a named prize", prize),
    );
    const cases = [
      ["https://www.dreamgiveaway.com/c30", "Dream Giveaway C30", "https://www.dreamgiveaway.com/c30/rules", "New Beginning Children's Homes", "a 2026 Cadillac"],
      ["https://www.sandals.com/sweepstakes", "Sandals Vacation Sweepstakes", "https://www.sandals.com/official-rules", "Sandals Resorts", "a Sandals vacation"],
      ["https://www.margaritaville.com/cruise", "Margaritaville Cruise Sweepstakes", "https://www.margaritaville.com/official-rules", "Margaritaville", "a 4-night cruise"],
      ["https://www.hollandamerica.com/wof", "Holland America Wheel of Fortune", "https://www.hollandamerica.com/official-rules", "Holland America", "a cruise week"],
      ["https://www.potsandpans.com/pick", "PotsandPans Pick Your Prize", "https://www.potsandpans.com/official-rules", "Pots and Pans", "a cookware set"],
      ["https://maxcash.example/win", "Max Cash Sweepstakes", "https://maxcash.example/official-rules", "Max Cash", "a $5,000 cash prize"],
      ["https://freegobikes.com/win", "Freego Bikes Sweepstakes", "https://freegobikes.com/official-rules", "Freego Bikes", "a Freego electric bike"],
      ["https://expeditionranch.com/win", "Expedition Ranch Sweepstakes", "https://expeditionranch.com/official-rules", "Expedition Ranch", "a ranch weekend"],
      ["https://fetch.com/roblox", "Fetch Roblox Sweepstakes", "https://fetch.com/official-rules", "Fetch", "a Roblox gift card"],
      ["https://powersports.honda.com/crf450rx-rideredandwinsweepstakes", "Ride Red and Win", "https://content.services.honda.com/ride-red-rules.pdf", "American Honda", "a Honda CRF450RX"],
    ] as const;
    const results = cases.flatMap(([url, title, rulesUrl, sponsor, prize]) => [
      { url, title, html: landing(title, rulesUrl) },
      { url: rulesUrl, title: "Official Rules", html: rules(sponsor, prize) },
    ]);
    const found = await search("giveaway", results);
    let read = 0;
    for (const [url] of cases) {
      const row = found.listings.find((item) => item.url === url);
      if (!row || /search stopped before this page/.test(row.rulesNote)) continue;
      read += 1;
      expect(row.listingGroup, url).toBe("verified");
    }
    expect(read).toBeGreaterThan(0);
  });

  it("refuses guides, winner stories, press, listicles, homepages, and a team rules page", async () => {
    const full = "<p>No purchase necessary. Sponsored by Example Co. Enter to win a Honda truck. Must be 18 years or older. Ends December 31, 2026. Winners will be selected in a random drawing. Odds of winning depend on entries. Approximate retail value of $100.</p>";
    const found = await search("Honda", [
      { url: "https://johnmalecki.com/truck-giveaway-free-plan", title: "Truck Giveaway Free Plan", html: page("Truck Giveaway Free Plan", full) },
      { url: "https://www.rafflepress.com/how-to-gift-card", title: "How to Do a Gift Card Giveaway", html: page("How to Do a Gift Card Giveaway", full) },
      { url: "https://kickofflabs.com/giveaway-guide", title: "Giveaway Guide", html: page("Giveaway Guide", full) },
      { url: "https://winprizesonline.com/", title: "WinPrizesOnline", html: page("WinPrizesOnline", full) },
      { url: "https://ultracontest.com/sweepstakes", title: "All Sweepstakes", html: `${page("All Sweepstakes", full)}${Array.from({ length: 6 }, (_, index) => `<a href="https://other${index}.example/giveaway">Giveaway ${index}</a>`).join("")}` },
      { url: "https://bikes.example/every-child", title: "Every Child Deserves A Bike!", html: page("Every Child Deserves A Bike!", "<p>Every child deserves a bike. Join the movement.</p>") },
      { url: "https://slickdeals.net/winner", title: "Slickdeals Winner Announced", html: page("Slickdeals Winner Announced", full) },
      { url: "https://sweepskings.com/casinos", title: "10 Best Casino Sweepstakes", html: page("10 Best Casino Sweepstakes", full) },
      { url: "https://www.nhl.com/ducks/rules", title: "Anaheim Ducks Official Rules", html: page("Anaheim Ducks Official Rules", full.replace("a Honda truck", "a pair of hockey tickets")) },
      { url: "https://investor.columbia.com/press", title: "Columbia Investor Press Release", html: page("Columbia Investor Press Release", full) },
    ]);
    expect(found.listings.some((row) => row.url.includes("ultracontest.com"))).toBe(false);
    for (const host of ["johnmalecki.com", "rafflepress.com", "kickofflabs.com", "winprizesonline.com", "bikes.example", "slickdeals.net", "sweepskings.com", "nhl.com", "columbia.com"]) {
      const row = found.listings.find((item) => item.url.includes(host));
      expect(row?.listingGroup).toBe("check");
    }
    expect(found.listings.find((row) => row.url.includes("nhl.com"))).toBeTruthy();
  });

  it("ranks the official Ride Red page for dirt bike queries when Brave returned it", async () => {
    const noise = Array.from({ length: 20 }, (_, index) => ({
      url: `https://www.moneypantry.com/giveaway/${index}`,
      title: `Archive ${index}`,
      html: page(`Archive ${index}`, "<p>Other giveaways.</p>"),
    }));
    const ride = {
      url: "https://powersports.honda.com/crf450rx-rideredandwinsweepstakes",
      title: "Ride Red and Win",
      html: landing("Ride Red and Win", "https://content.services.honda.com/ride-red-rules.pdf"),
    };
    const rules = {
      url: "https://content.services.honda.com/ride-red-rules.pdf",
      title: "Official Rules",
      html: page("Official Rules", "<p>No purchase necessary. Sponsored by American Honda. Enter to win a Honda CRF450RX. Must be 18 years or older. Ends November 15, 2026. Winners will be selected in a random drawing. Odds of winning depend on entries. Approximate retail value of $9,000.</p>"),
      type: "application/pdf",
    };
    for (const query of ["dirt bike", "Honda dirt bike"]) {
      const found = await search(query, [...noise, ride, rules]);
      const row = found.listings.find((item) => item.url === ride.url);
      expect(row?.listingGroup).toBe("verified");
      expect(found.listings[0]?.url).toBe(ride.url);
    }
  });
});
