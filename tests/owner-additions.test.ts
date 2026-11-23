import { describe, expect, it } from "vitest";
import { entryClockFromText, entryClockLabel, nextEligibleAt } from "@/domain/entry-clock";
import { applyLiveFilters, OPEN_LIVE_FILTERS } from "@/domain/live-filters";
import { extractRulesFacts } from "@/domain/rules-facts";
import { braveCallBudget, isNoReadHost, platformSearchQueries } from "@/domain/search-yield";
import { probeSource, renderHealthReport, type HealthFetch } from "@/domain/source-health";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-10T15:00:00Z");
const FORM = `<form action="https://good.example/enter"><input name="email"><button type="submit">Enter</button></form>`;

const RULES = `Official rules. No purchase necessary. Mail the card to: Prize Scout Fixture, 1 Rules Fixture Road, Boise, ID 83702.
Handwrite your entry on a 3x5 card. One mail-in entry per person.
Entries must be postmarked by December 1, 2026 and received by December 8, 2026.
Enter once per calendar day. This is an instant win.
<a href="https://sponsor.example/winners">Winners list</a>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body>${body}${FORM}</body></html>`;
}

describe("owner additions", () => {
  it("adds at most two platform queries and does not read Woobox or ShortStack", async () => {
    expect(platformSearchQueries("truck").length).toBe(2);
    expect(platformSearchQueries("truck")[0]).toContain("site:gleam.io");
    expect(platformSearchQueries("truck")[0]).toContain("site:sweepwidget.com/c");
    expect(platformSearchQueries("truck")[0]).toContain("site:sweepwidget.com/view");
    expect(platformSearchQueries("truck")[0]).toContain("site:kingsumo.com/g");
    expect(platformSearchQueries("truck")[1]).toContain("site:app.viralsweep.com/sweeps");
    expect(platformSearchQueries("truck")[1]).toContain("site:apps.easypromosapp.com/p");
    expect(platformSearchQueries("truck")[1]).toContain("site:woobox.com");
    expect(platformSearchQueries("truck")[1]).toContain("site:cmpgn.page");
    expect(braveCallBudget("contest")).toBe(5);
    expect(isNoReadHost("https://woobox.com/offer1")).toBe(true);
    expect(isNoReadHost("https://demo.cmpgn.page/abc")).toBe(true);
    expect(isNoReadHost("https://gleam.io/GRq5F/sample")).toBe(false);

    const calls: string[] = [];
    const fetched: string[] = [];
    const found = await searchVerifiedGiveaways("contest", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 6,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          const q = new URL(url).searchParams.get("q") ?? "";
          calls.push(q);
          if (q.includes("site:")) return Response.json({ web: { results: [] } });
          return Response.json({
            web: {
              results: [
                { title: "Woobox", url: "https://woobox.com/offer1", description: "A giveaway" },
                { title: "Gleam list", url: "https://gleam.io/giveaways", description: "Featured" },
                { title: "Gleam campaign", url: "https://gleam.io/GRq5F/sample-giveaway", description: "Enter" },
                { title: "Old tool", url: "https://www.rafflecopter.com/old", description: "Gone" },
              ],
            },
          });
        }
        fetched.push(url);
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.includes("gleam.io/GRq5F")) return new Response(page("Sample giveaway", "<p>No purchase necessary. Official rules. One entry per person.</p>"), { status: 200, headers: { "content-type": "text/html" } });
        return new Response("missing", { status: 404 });
      },
    });
    expect(calls.filter((item) => item.includes("site:gleam.io"))).toHaveLength(1);
    expect(calls.filter((item) => item.includes("site:woobox.com"))).toHaveLength(1);
    expect(calls.length).toBe(5);
    expect(calls.filter((item) => item.includes("site:")).length).toBe(2);
    expect(fetched.some((url) => url.includes("woobox.com") && !url.endsWith("/robots.txt"))).toBe(false);
    expect(fetched.some((url) => url.includes("rafflecopter.com") && !url.endsWith("/robots.txt"))).toBe(false);
    expect(found.listings.find((item) => item.url.includes("woobox.com"))?.rulesNote).toMatch(/does not allow our check/);
    expect(found.listings.find((item) => item.url.includes("rafflecopter.com"))?.rulesNote).toMatch(/shut down on October 1, 2025/);
    const gleamList = found.listings.find((item) => item.url === "https://gleam.io/giveaways");
    expect(gleamList?.unreadDirectory).toBe(true);
    expect(fetched.some((url) => url.includes("gleam.io/giveaways") && !url.endsWith("/robots.txt"))).toBe(false);
    expect(found.listings.find((item) => item.url.includes("GRq5F"))?.title).toBe("Sample giveaway");
    expect(JSON.stringify(found.listings)).not.toMatch(/\blegit\b|Verified official page/i);
  });

  it("copies only the mail-in facts, winners link, and read date that the rules stated", async () => {
    const facts = extractRulesFacts(RULES.replace(/<[^>]+>/g, " "));
    expect(facts.mailAmoe?.cardSize).toMatch(/3x5/i);
    expect(facts.mailAmoe?.postmarkBy).toBe("December 1, 2026");
    expect(facts.mailAmoe?.receivedBy).toBe("December 8, 2026");
    expect(facts.mailAmoe?.addressLines.join(" ")).toMatch(/Boise/);
    expect(facts.mailAmoe?.entryLimit).toMatch(/one mail-in entry per person/i);

    const found = await searchVerifiedGiveaways("contest", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [{ title: "Mail", url: "https://sponsor.example/rules", description: "Rules" }] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(page("Mail rules", RULES), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const row = found.listings[0];
    expect(row?.mailAmoe?.postmarkBy).toBe("December 1, 2026");
    expect(row?.winnersListUrl).toBe("https://sponsor.example/winners");
    expect(row?.rulesReadOn).toBe("2026-11-10");
    expect(row?.instantWin).toBe(true);
    expect(row?.entryClock).toBe("calendar_day");
    expect(`${row?.rulesNote} ${row?.title}`).not.toMatch(/\blegit\b/);
  });

  it("separates a calendar day from 24 hours and schedules the next entry", () => {
    expect(entryClockFromText("Enter once per calendar day.")).toBe("calendar_day");
    expect(entryClockFromText("One entry every 24 hours.")).toBe("rolling_24h");
    expect(entryClockFromText("Enter once per week.")).toBe("weekly");
    expect(entryClockLabel("rolling_24h")).toBe("Once per 24 hours");
    const entered = new Date("2026-11-10T15:00:00Z");
    expect(nextEligibleAt("rolling_24h", entered)?.at.toISOString()).toBe("2026-11-11T15:00:00.000Z");
    expect(nextEligibleAt("once", entered)).toBeNull();
    expect(nextEligibleAt("calendar_day", null)).toBeNull();
  });

  it("keeps the full list until an optional filter is turned on", () => {
    const rows = [
      { eligibility: "United States", end: "2026-12-01", methods: ["free" as const], instantWin: true, mailIn: false, daily: false },
      { eligibility: "United States", end: "2026-11-20", methods: ["free" as const], instantWin: false, mailIn: true, daily: true },
    ];
    expect(applyLiveFilters(rows, OPEN_LIVE_FILTERS, NOW).shown).toHaveLength(2);
    expect(applyLiveFilters(rows, { ...OPEN_LIVE_FILTERS, instantWin: true }, NOW).hidden).toBe(1);
    expect(applyLiveFilters(rows, { ...OPEN_LIVE_FILTERS, mailIn: true }, NOW).shown).toHaveLength(1);
    expect(applyLiveFilters(rows, { ...OPEN_LIVE_FILTERS, daily: true, endsSoon: true }, NOW).shown).toHaveLength(1);
  });

  it("writes a fixture health report without following redirects or solving a wall", async () => {
    const fetchImpl: HealthFetch = async (url) => {
      if (url.endsWith("/robots.txt") && url.includes("directory.example")) return { status: 200, location: null, body: "User-agent: *\nDisallow: /sweepstakes\n" };
      if (url.endsWith("/robots.txt")) return { status: 200, location: null, body: "User-agent: *\nAllow: /\n" };
      if (url.includes("missing.example")) return { status: 404, location: null, body: "no" };
      if (url.includes("moved.example")) return { status: 301, location: "https://moved.example/next", body: "" };
      if (url.includes("walled.example")) return { status: 200, location: null, body: '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>' };
      return { status: 200, location: null, body: "<p>ok</p>" };
    };
    const findings = [
      await probeSource({ name: "Missing", url: "https://missing.example/giveaway", kind: "watched" }, fetchImpl),
      await probeSource({ name: "Moved", url: "https://moved.example/sweepstakes", kind: "watched" }, fetchImpl),
      await probeSource({ name: "Directory", url: "https://directory.example/sweepstakes", kind: "aggregator" }, fetchImpl),
      await probeSource({ name: "Walled", url: "https://walled.example/enter", kind: "watched" }, fetchImpl),
    ];
    const report = renderHealthReport(findings, 0.25);
    expect(report).toContain("HTTP 404");
    expect(report).toContain("301 to https://moved.example/next");
    expect(report).toContain("Disallow: /sweepstakes");
    expect(report).toContain("Cloudflare Turnstile");
    expect(report).toContain("25% of checked directory rows were unread");
    expect(report).toContain("Do not bypass");
    expect(report).not.toMatch(/solved the captcha|followed the redirect/i);
  });
});
