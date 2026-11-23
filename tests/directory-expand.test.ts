import { describe, expect, it } from "vitest";
import { extractContestLinks } from "@/domain/directory-links";
import { applyLiveFilters, OPEN_LIVE_FILTERS } from "@/domain/live-filters";
import { openSearchQueries, rewriteSearchQuery } from "@/domain/search-yield";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-10T12:00:00Z");
const FORM = `<p>No purchase necessary. Official rules. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p><form action="https://good.example/enter"><input name="email"><button type="submit">Enter</button></form>`;

function html(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body>${body}</body></html>`;
}

function run(query: string, pages: Record<string, string | { status: number; body: string }>, results: Array<{ url: string; title?: string; description?: string }>, maxBraveCalls = 1) {
  const requested: string[] = [];
  const brave: string[] = [];
  const outcome = searchVerifiedGiveaways(query, {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls,
    now: () => NOW,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        brave.push(new URL(url).searchParams.get("q") ?? "");
        return Response.json({ web: { results: results.map((item) => ({ title: item.title ?? "skip", url: item.url, description: item.description ?? "" })) } });
      }
      requested.push(url);
      if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
      const hit = Object.entries(pages)
        .filter(([key]) => url.startsWith(key))
        .sort((left, right) => right[0].length - left[0].length)[0];
      if (!hit) return new Response("missing", { status: 404 });
      const page = hit[1];
      if (typeof page !== "string") return new Response(page.body, { status: page.status, headers: { "content-type": "text/html" } });
      return new Response(page, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  return outcome.then((found) => ({ found, requested, brave }));
}

describe("query rewriting and directories", () => {
  it("appends giveaway sweepstakes only when the query has no contest word", () => {
    expect(openSearchQueries("idaho")).toEqual(["idaho giveaway", "idaho sweepstakes", "idaho contest"]);
    expect(openSearchQueries("truck giveaway")).toEqual(["truck giveaway", "truck giveaway sweepstakes", "truck giveaway contest"]);
    expect(rewriteSearchQuery("idaho")).toBe("idaho giveaway sweepstakes");
    expect(rewriteSearchQuery("contest")).toBe("contest");
    expect(rewriteSearchQuery("giveaways")).toBe("giveaways");
    expect(rewriteSearchQuery("win a car")).toBe("win a car");
  });

  it("drops a dictionary result and a giveaway-ideas page", async () => {
    const { found, requested } = await run("contest", {
      "https://good.example/enter": html("Trip Giveaway", FORM),
    }, [
      { url: "https://www.dictionary.com/browse/contest", title: "contest noun", description: "definition of contest" },
      { url: "https://promo.example/giveaway-ideas", title: "Giveaway ideas for promo products", description: "promotional products" },
      { url: "https://good.example/enter", title: "Trip Giveaway", description: "Enter the trip giveaway" },
    ]);
    expect(found.listings.map((item) => item.url)).toEqual(["https://good.example/enter"]);
    expect(found.dropCounts.dictionary).toBe(1);
    expect(found.dropCounts.promo).toBe(1);
    expect(requested.some((url) => url.includes("dictionary.com"))).toBe(false);
    expect(requested.some((url) => url.includes("promo.example"))).toBe(false);
  });

  it("expands an allowed directory, credits it, and dedupes the contest links", async () => {
    const listing = html(
      "Daily sweepstakes",
      `<a href="https://good.example/enter">Trip Giveaway</a>
<a href="https://good.example/enter">same contest</a>
<a href="https://widget.example/truck">Truck giveaway</a>
<a href="https://www.contestgirl.com/about">About</a>`,
    );
    const { found, requested } = await run("giveaways", {
      "https://www.contestgirl.com/": listing,
      "https://good.example/enter": html("Trip Giveaway", FORM),
      "https://widget.example/truck": html("Truck Giveaway", "<p>Enter this truck giveaway.</p>"),
    }, [{ url: "https://www.contestgirl.com/", title: "Contest Girl", description: "sweepstakes directory" }]);
    expect(found.listings.map((item) => item.url)).toEqual([]);
    expect(requested.some((url) => url.includes("contestgirl.com") || url.includes("good.example") || url.includes("widget.example"))).toBe(false);
    expect(extractContestLinks(listing, "https://www.contestgirl.com/", 8)).toEqual(["https://good.example/enter", "https://widget.example/truck"]);
  });

  it("does not open a directory whose robots.txt disallows the path", async () => {
    const requested: string[] = [];
    const found = await searchVerifiedGiveaways("giveaways", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [{ title: "Blocked", url: "https://blocked.example/daily", description: "" }] } });
        }
        requested.push(url);
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /", { status: 200, headers: { "content-type": "text/plain" } });
        return new Response(html("Should not load", `<a href="https://invented.example/contest">x</a>`), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(found.listings.map((item) => item.url)).toEqual(["https://blocked.example/daily"]);
    expect(found.listings[0]?.endIso).toBeNull();
    expect(found.listings[0]?.prize).toBe("Not stated on a fetched page.");
    expect(found.dropCounts.blocked).toBe(1);
    expect(requested.some((url) => url === "https://blocked.example/daily")).toBe(false);
    expect(JSON.stringify(found.listings)).not.toContain("invented.example");
  });

  it("expands a brand sweepstakes hub into the contests it lists", async () => {
    const hub = html(
      "Sweepstakes",
      `<a href="https://www.discovery.com/sweepstakes/win-a-trip">Win a trip</a><a href="https://www.discovery.com/privacy">Privacy</a>`,
    );
    const { found } = await run("giveaways", {
      "https://www.discovery.com/sweepstakes": hub,
      "https://www.discovery.com/sweepstakes/win-a-trip": html("Win a trip", FORM),
    }, [{ url: "https://www.discovery.com/sweepstakes", title: "Discovery Sweepstakes" }]);
    expect(found.listings.map((item) => item.url)).toEqual(["https://www.discovery.com/sweepstakes"]);
    expect(found.listings[0]?.listingGroup).toBe("directory");
    expect(found.listings[0]?.rulesNote).toBe("Directory listing");
    expect(found.listings[0]?.unreadDirectory).toBe(true);
    expect(found.listings[0]?.endIso).toBeNull();
  });

  it("caps contest page checks after directory links", async () => {
    const links = Array.from({ length: 8 }, (_, index) => `<a href="https://prize${index}.example/enter">Giveaway ${index}</a>`).join("");
    const requested: string[] = [];
    await searchVerifiedGiveaways("giveaways", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({
            web: {
              results: [
                { title: "Contest Girl", url: "https://www.contestgirl.com/", description: "" },
                { title: "Extra", url: "https://extra.example/enter", description: "Extra giveaway" },
                { title: "Later", url: "https://later.example/enter", description: "Later giveaway" },
              ],
            },
          });
        }
        requested.push(url);
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.startsWith("https://www.contestgirl.com/")) return new Response(html("Directory", links), { status: 200, headers: { "content-type": "text/html" } });
        return new Response(html("Giveaway", "<p>Enter this giveaway.</p>"), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const contestFetches = requested.filter((url) => !url.endsWith("/robots.txt") && !url.startsWith("https://www.contestgirl.com/"));
    expect(contestFetches.some((url) => url.startsWith("https://later.example/"))).toBe(true);
    expect(contestFetches.some((url) => url.startsWith("https://extra.example/"))).toBe(true);
  });

  it("keeps a news page that links to an entry and asks Brave for the next offset", async () => {
    const linked = `<!doctype html><html><head><title>Local story</title><meta property="og:type" content="article"></head><body><article><p>Published Monday.</p><a href="https://sponsor.example/enter">Enter the giveaway</a></article></body></html>`;
    const plain = `<!doctype html><html><head><title>Dictionary story</title><meta property="og:type" content="article"></head><body><article><p>No entry here.</p></article></body></html>`;
    const { found } = await run("giveaways", {
      "https://news.example/with-entry": linked,
      "https://news.example/plain": plain,
    }, [
      { url: "https://news.example/with-entry", title: "Local story" },
      { url: "https://news.example/plain", title: "Plain story" },
    ]);
    expect(found.listings.map((item) => item.url)).toEqual(["https://news.example/with-entry", "https://news.example/plain"]);

    const calls: string[] = [];
    const page = await searchVerifiedGiveaways("boots", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 3,
      offset: 20,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/search") || url.hostname.includes("brave")) {
          calls.push(`${url.searchParams.get("q")}|${url.searchParams.get("offset")}`);
          const results = Array.from({ length: 20 }, (_, index) => ({ title: "skip", url: `https://prize${index}.example/enter`, description: "" }));
          return Response.json({ web: { results } });
        }
        if (String(input).endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response("missing", { status: 404 });
      },
    });
    expect(calls).toEqual(["boots giveaway|20", "boots sweepstakes|20", "boots contest|20"]);
    expect(page.nextOffset).toBe(40);
    expect(page.braveCalls).toBe(3);
  });

  it("counts rows hidden by filters and clears back to the full list", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const rows = [
      { eligibility: "United States", end: "2026-11-20", methods: ["free" as const], source: "web" as const, liveVerified: true },
      { eligibility: "Canada only", end: "2027-06-01", methods: ["paid" as const], source: "instagram" as const, liveVerified: true },
    ];
    const filtered = applyLiveFilters(rows, { ...OPEN_LIVE_FILTERS, freeOnly: true, eligibility: true, endsSoon: true, instantWin: false, mailIn: false, daily: false, sources: ["web"] }, now);
    expect(filtered.shown).toHaveLength(1);
    expect(filtered.hidden).toBe(1);
    const cleared = applyLiveFilters(rows, OPEN_LIVE_FILTERS, now);
    expect(cleared.shown).toHaveLength(2);
    expect(cleared.hidden).toBe(0);
  });
});
