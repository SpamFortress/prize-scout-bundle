import { describe, expect, it } from "vitest";
import { enterCaption, sampleFromVerified } from "@/app/design-preview/entries-sample";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-10T12:00:00Z");
const FORM = `<form action="https://good.example/enter"><input name="email"><button type="submit">Enter</button></form>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body>${body}</body></html>`;
}

function run(query: string, pages: Record<string, { status?: number; html?: string }>, results: Array<{ url: string; title: string; description?: string }>) {
  return searchVerifiedGiveaways(query, {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls: 1,
    now: () => NOW,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return Response.json({ web: { results } });
      }
      if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
      const hit = Object.entries(pages)
        .filter(([key]) => url.startsWith(key))
        .sort((left, right) => right[0].length - left[0].length)[0];
      if (!hit) return new Response("missing", { status: 404 });
      if (hit[1].status) return new Response("no", { status: hit[1].status, headers: { "content-type": "text/html" } });
      return new Response(hit[1].html ?? "", { status: 200, headers: { "content-type": "text/html" } });
    },
  });
}

describe("live mislabels", () => {
  it("does not verify a news article or a listicle, and treats sweepsdb as a directory", async () => {
    const news = `<!doctype html><html><head><title>Idaho giveaway draws a crowd</title><meta property="og:type" content="article"></head><body>
<p>Posted by a reporter.</p>${FORM}<a href="https://dailyfly.com/rules">rules</a></body></html>`;
    const list = page("I Found 23 Best Sweepstakes Websites", `${FORM}<a href="https://rafflepress.example/rules">rules</a>`);
    const sponsor = page(
      "Ready Giveaway",
      `<p>No purchase necessary. Official rules. Sponsored by Ready Sponsor. Enter to win a gift card. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p>${FORM}`,
    );
    const found = await run("contest", {
      "https://dailyfly.com/story": { html: news },
      "https://rafflepress.com/best": { html: list },
      "https://sponsor.example/enter": { html: sponsor },
    }, [
      { url: "https://dailyfly.com/story", title: "Idaho giveaway" },
      { url: "https://rafflepress.com/best", title: "I Found 23 Best Sweepstakes Websites" },
      { url: "https://sweepsdb.com/", title: "Sweepstakes database" },
      { url: "https://sponsor.example/enter", title: "Ready Giveaway" },
    ]);
    expect(found.listings.map((item) => item.url)).toEqual([
      "https://sponsor.example/enter",
      "https://rafflepress.com/best",
      "https://dailyfly.com/story",
      "https://sweepsdb.com/",
    ]);
    const directory = found.listings.find((item) => item.url.includes("sweepsdb.com"));
    expect(directory?.unreadDirectory).toBe(true);
    expect(directory?.endIso).toBeNull();
    expect(directory?.prize).toBe("Not stated on a fetched page.");
    expect(enterCaption(sampleFromVerified(found.listings.find((item) => item.url.includes("sponsor.example"))!))).toMatch(/^Prefill/);
  });

  it("drops tool sites, promo catalogs, mystery boxes, game guides, and interviews", async () => {
    const found = await run("giveaways", {
      "https://sponsor.example/enter": {
        html: page("Ready Giveaway", `<p>No purchase necessary. Official rules. Must be 18 or older. One entry per person. Ends December 31, 2026.</p>${FORM}`),
      },
    }, [
      { url: "https://www.random.org/integers/", title: "Random Integer Generator" },
      { url: "https://themusclecarplace.com/hodson-interview", title: "Hodson interview" },
      { url: "https://www.giveaways.com/mystery-boxes", title: "Mystery boxes" },
      { url: "https://pinnaclepromotions.com/giveaway-items", title: "Tradeshow giveaway items" },
      { url: "https://game8.co/games/event", title: "Event guide" },
      { url: "https://sponsor.example/enter", title: "Ready Giveaway" },
    ]);
    expect(found.listings.map((item) => item.url)).toEqual(["https://sponsor.example/enter"]);
    expect(found.dropCounts.junk).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(found.dropCounts)).not.toContain("http");
  });

  it("shows the guns.com giveaway URL when the fetch is blocked and does not invent facts", async () => {
    const found = await run("rifle", {
      "https://www.guns.com/giveaways": { status: 403 },
    }, []);
    const row = found.listings.find((item) => item.url === "https://www.guns.com/giveaways");
    expect(row?.endIso).toBeNull();
    expect(row?.arvUsd).toBeNull();
    expect(row?.prize).toBe("Not stated on a fetched page.");
    expect(row?.ageTag).toBeNull();
    expect(row?.unreadDirectory).toBe(false);
  });

  it("keeps a sponsor giveaway verified when the page also has a byline", async () => {
    const html = `<!doctype html><html><head><title>Gun Giveaway</title><meta property="og:type" content="article"></head><body>
<p>Posted by the editor. No purchase necessary. Official rules. Must be 21 or older. The firearm transfers through a licensed FFL dealer. One entry per person. Ends December 31, 2026.</p>
${FORM.replace("good.example", "gunsandgadgetsdaily.com")}</body></html>`;
    const found = await run("gun", {
      "https://gunsandgadgetsdaily.com/giveaway": { html },
    }, [{ url: "https://gunsandgadgetsdaily.com/giveaway", title: "Gun Giveaway" }]);
    const row = found.listings.find((item) => item.url.includes("gunsandgadgetsdaily.com"));
    expect(row?.ageTag).toBe("21+");
    expect(row?.dealerPickup).toBe(true);
  });

  it("lists gungiveaways.net as a directory and does not read it", async () => {
    const found = await run("gun", {}, [{ url: "https://www.gungiveaways.net/", title: "Gun giveaways" }]);
    expect(found.listings.map((item) => item.url)).toContain("https://www.gungiveaways.net/");
    expect(found.listings.find((item) => item.url.includes("gungiveaways.net"))?.unreadDirectory).toBe(true);
  });

  it("keeps one Store row when a store homepage and its giveaway page both appear", async () => {
    const home = page("ENRFORCE", `<p>Shop the current giveaway.</p>${FORM.replace("good.example", "enrforce.com")}<a href="https://enrforce.com/rules">Official rules</a>`);
    const current = page("Current Giveaway", `<p>1 entry per $1 spent. No purchase necessary. Official rules. Sponsored by ENRFORCE. Enter to win a Ford truck. Ends December 31, 2026.</p>${FORM.replace("good.example", "enrforce.com")}<a href="https://enrforce.com/pages/enrforce-official-rules">Official rules</a>`);
    const found = await run("truck", {
      "https://enrforce.com/": { html: home },
      "https://enrforce.com/pages/current-giveaway": { html: current },
    }, [
      { url: "https://enrforce.com/", title: "ENRFORCE" },
      { url: "https://enrforce.com/pages/current-giveaway", title: "Current Giveaway" },
    ]);
    const rows = found.listings.filter((item) => item.url.includes("enrforce.com"));
    expect(rows.map((item) => item.url)).toEqual(["https://enrforce.com/pages/current-giveaway", "https://enrforce.com/"]);
    expect(rows.find((item) => item.url.includes("current-giveaway"))?.methods).toEqual(["paid"]);
    expect(rows.find((item) => item.url.endsWith("enrforce.com/"))?.listingGroup).toBe("check");
    expect(rows.every((item) => !enterCaption(sampleFromVerified(item)).startsWith("Prefill"))).toBe(true);
  });

  it("treats sweepstakes hubs as directories and a single network rules page as verified", async () => {
    const one = page("Win a Kitchen", `<p>No purchase necessary. Official rules. Sponsored by HGTV. Enter to win a kitchen. Must be 18 or older. One entry per person. Ends December 31, 2026.</p>${FORM.replace("good.example", "www.hgtv.com")}`);
    const found = await run("contest", {
      "https://www.hgtv.com/sweepstakes/win-a-kitchen": { html: one },
    }, [
      { url: "https://www.hgtv.com/sweepstakes", title: "HGTV Sweepstakes" },
      { url: "https://www.foodnetwork.com/sweepstakes", title: "Food Network Sweepstakes" },
      { url: "https://www.sweepstakestoday.com/", title: "Sweepstakes Today" },
      { url: "https://www.wowsweepstakes.com/", title: "Wow Sweepstakes" },
      { url: "https://www.hgtv.com/sweepstakes/win-a-kitchen", title: "Win a Kitchen" },
    ]);
    for (const host of ["hgtv.com/sweepstakes", "foodnetwork.com/sweepstakes", "sweepstakestoday.com", "wowsweepstakes.com"]) {
      const row = found.listings.find((item) => item.url.includes(host) && !item.url.includes("win-a-kitchen"));
      expect(row?.unreadDirectory).toBe(true);
      expect(row?.endIso).toBeNull();
    }
    const kitchen = found.listings.find((item) => item.url.includes("win-a-kitchen"));
    expect(kitchen?.ageTag).toBe("18+");
    expect(enterCaption(sampleFromVerified(kitchen!))).toMatch(/^Prefill/);
  });

  it("drops a word-list dictionary and keeps a Dream Giveaway rules page verified and paid", async () => {
    const dream = `<!doctype html><html><head><title>Dream Giveaway</title><meta property="og:type" content="article"></head><body>
<p>Posted by the charity. No purchase necessary. Official rules. Sponsored by New Beginning Children's Homes. Enter to win a Cadillac. Ends December 31, 2026. A donation is not required.</p>${FORM.replace("good.example", "www.dreamgiveaway.com")}</body></html>`;
    const found = await run("contest", {
      "https://www.dreamgiveaway.com/rules": { html: dream },
    }, [
      { url: "https://www.wordwebonline.com/en/definition/contest", title: "contest", description: "noun verb pronunciation synonyms" },
      { url: "https://www.dreamgiveaway.com/rules", title: "Dream Giveaway" },
    ]);
    expect(found.listings.map((item) => item.url)).toEqual(["https://www.dreamgiveaway.com/rules"]);
    expect(found.dropCounts.dictionary).toBe(1);
    const row = found.listings[0];
    expect(row?.methods).toEqual(["paid"]);
    expect(row?.freeMethodLabel).toBe("Free method available (see rules)");
    expect(enterCaption(sampleFromVerified(row!))).not.toMatch(/^Prefill/);
  });

  it("keeps Brave order, collapses the same URL, caps a domain at two, and drops dictionaries and shopping pages", async () => {
    const giveaway = page("Rifle Giveaway", `<p>No purchase necessary. Official rules. Sponsored by Shop Example. Enter to win a rifle. Must be 18 or older. One entry per person. Ends December 31, 2026.</p>${FORM.replace("good.example", "shop.example")}`);
    const found = await run("contest", {
      "https://shop.example/one": { html: page("One", "<p>A contest note.</p>") },
      "https://shop.example/two": { html: page("Two", "<p>A contest note.</p>") },
      "https://shop.example/three": { html: page("Three", "<p>A contest note.</p>") },
      "https://shop.example/giveaways/rifle": { html: giveaway },
      "https://shop.example/giveaways/pistol": { html: page("Pistol Giveaway", "<p>Enter the pistol giveaway.</p>") },
      "https://alpha.example/a": { html: page("Alpha", "<p>Alpha giveaway.</p>") },
      "https://beta.example/b": { html: page("Beta", "<p>Beta giveaway.</p>") },
    }, [
      { url: "https://alpha.example/a", title: "Alpha" },
      { url: "https://www.shop.example/one/", title: "One" },
      { url: "https://shop.example/one?utm_source=brave", title: "One" },
      { url: "https://beta.example/b", title: "Beta" },
      { url: "https://shop.example/two", title: "Two" },
      { url: "https://shop.example/three", title: "Three" },
      { url: "https://shop.example/giveaways/rifle", title: "Rifle Giveaway" },
      { url: "https://shop.example/giveaways/pistol", title: "Pistol Giveaway" },
      { url: "https://www.law.cornell.edu/wex/contest", title: "contest" },
      { url: "https://dictionary.nolo.com/contest-term.html", title: "Contest Definition" },
      { url: "https://guns.example/glock", title: "Glock 19 For Sale", description: "In stock" },
    ]);
    expect(found.listings.map((item) => item.url)).toEqual([
      "https://shop.example/giveaways/rifle",
      "https://alpha.example/a",
      "https://www.shop.example/one/",
      "https://beta.example/b",
      "https://shop.example/two",
      "https://shop.example/giveaways/pistol",
    ]);
    expect(found.dropCounts.dictionary).toBe(2);
    expect(found.dropCounts.junk).toBeGreaterThanOrEqual(1);
    expect(found.listings.some((item) => /cornell|nolo|for sale/i.test(`${item.url} ${item.title}`))).toBe(false);
  });
});
