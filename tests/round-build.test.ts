import { existsSync, readFileSync } from "node:fs";
const PRIVATE_FIXTURES = existsSync(new URL("./fixtures/retest/vance-ruger.html", import.meta.url));
import { describe, expect, it } from "vitest";
import { buildCalendar, foldIcsLine, type CalendarContest } from "@/domain/calendar-ics";
import { prize1099Line, prize1099Threshold } from "@/config/prize-reporting";
import { entryTaxLine } from "@/domain/entry-tax";
import { federalIncomeTaxCents } from "@/domain/federal-tax";
import { fetchRank, searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-16T12:00:00.000Z");
const FORM = `<form action="/enter"><input name="email"><button type="submit">Enter</button></form>`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><p>${body}</p>${FORM}</body></html>`;
}

const OPEN_ORDER = [
  { url: "https://www.honda.com/lawn-mowers", title: "Honda Lawn Mowers", description: "Shop mowers" },
  { url: "https://www.honda.com/generators", title: "Honda Generators", description: "EU2200i generator" },
  { url: "https://cdn.powerequipment.honda.com/pe/pdf/promotions/pe-12-days.pdf", title: "12 Days of Giveaways Official Rules", description: "Official rules" },
  { url: "https://powerequipment.honda.com/promotions/twelve-days-of-giveaways", title: "12 Days of Giveaways", description: "Enter to win a Honda generator" },
  { url: "https://powersports.honda.com/motorcycles", title: "Honda Motorcycles", description: "Street bikes" },
  { url: "https://example.com/best-generators", title: "Best generator guide", description: "How to choose" },
];

describe("1099 threshold", () => {
  it("uses $2,000 for 2026 or later and $600 only for an earlier prize year", () => {
    expect(prize1099Threshold(null)).toBe(2_000);
    expect(prize1099Threshold(2026)).toBe(2_000);
    expect(prize1099Threshold(2027)).toBe(2_000);
    expect(prize1099Threshold(2025)).toBe(600);
    expect(prize1099Line(2026)).toContain("Sponsors issue a 1099 at $2,000");
    expect(prize1099Line(2026)).toContain("Prizes under $2,000 are still taxable income; a 1099 just isn't required.");
    expect(prize1099Line(2025)).toContain("$600");
    expect(prize1099Line(2025)).not.toContain("isn't required");
    const line = entryTaxLine({ arvUsd: 55_000, arvKind: "sample", stateChoice: "Idaho", prizeYear: 2026 });
    expect(line.short).toBe("Est. federal tax $6,812");
    expect(federalIncomeTaxCents(55_000)).toBe(681_200);
    expect(line.reporting).toContain("$2,000");
  });
});

describe("sweeps casino note", () => {
  it("keeps a sweeps-coin casino out of Verified and does not call it a scam", async () => {
    const casino = page("Stake.us Sweeps Coins", "No purchase necessary. Official rules. Sponsored by Stake. Enter to win Sweeps Coins and Gold Coins. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026. Pay the shipping to claim the prize.");
    const coins = page("Challenge Coin Giveaway", "No purchase necessary. Official rules. Sponsored by the Museum. Enter to win a set of commemorative coins. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026.");
    const found = await searchVerifiedGiveaways("coins", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [
            { url: "https://stake.us/sweeps", title: "Stake.us Sweeps Coins", description: "Sweeps Coins" },
            { url: "https://museum.example/coins", title: "Challenge Coin Giveaway", description: "commemorative coins" },
          ] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
        if (url.includes("stake.us")) return new Response(casino, { status: 200, headers: { "content-type": "text/html" } });
        return new Response(coins, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const stake = found.listings.find((row) => row.url.includes("stake.us"));
    const museum = found.listings.find((row) => row.url.includes("museum.example"));
    expect(stake?.listingGroup).not.toBe("verified");
    expect(stake?.rulesNote).toBe("Online casino, not a contest; banned in some states (e.g. NY, OK).");
    expect(stake?.scamPhrases).toEqual([]);
    expect(museum?.listingGroup).toBe("verified");
    expect(museum?.rulesNote).not.toMatch(/casino/i);
  });
});

describe("12 days cdn rules", () => {
  it.skipIf(!PRIVATE_FIXTURES)("names the entry page for the Honda CDN 12 Days PDF", async () => {
    const pdf = "https://cdn.powerequipment.honda.com/pe/pdf/promotions/pe-12-days.pdf";
    const html = readFileSync(new URL("./fixtures/retest/pe-12-days.html", import.meta.url), "utf8");
    const found = await searchVerifiedGiveaways("Honda", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) return Response.json({ web: { results: [{ url: pdf, title: "12 Days of Giveaways Official Rules", description: "Official rules" }] } });
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
        if (url === pdf) return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
        return new Response("missing", { status: 404 });
      },
    });
    const row = found.listings.find((item) => item.url === pdf);
    expect(row?.rulesNote).toBe("Rules found; enter at https://powerequipment.honda.com/promotions/twelve-days-of-giveaways.");
  });
});

describe("open order", () => {
  it("opens generator and rules pages ahead of generic product pages", () => {
    const before = ["twelve-days-of-giveaways", "motorcycles", "lawn-mowers", "generators", "pe-12-days.pdf", "best-generators"];
    const ordered = [...OPEN_ORDER].sort((left, right) => fetchRank(left.url, left.title, left.description, "Honda generator") - fetchRank(right.url, right.title, right.description, "Honda generator"));
    const after = ordered.map((item) => item.url.split("/").pop() ?? item.url);
    expect(before).toEqual(["twelve-days-of-giveaways", "motorcycles", "lawn-mowers", "generators", "pe-12-days.pdf", "best-generators"]);
    expect(after[0]).toBe("twelve-days-of-giveaways");
    expect(after.indexOf("pe-12-days.pdf")).toBeLessThan(after.indexOf("lawn-mowers"));
    expect(after.indexOf("generators")).toBeLessThan(after.indexOf("motorcycles"));
    expect(after.indexOf("lawn-mowers")).toBeLessThan(after.indexOf("best-generators"));
  });
});

describe("pages not opened", () => {
  it("returns the count and the urls on the search result", async () => {
    const found = await searchVerifiedGiveaways("Honda", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [
            { url: "https://www.example.com/12-truck-giveaways", title: "12 Truck Giveaways", description: "A list" },
            { url: "https://sponsor.example/honda", title: "Honda Win", description: "Enter" },
          ] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
        return new Response(page("Honda Win", "No purchase necessary. Official rules. Sponsored by Honda. Enter to win a generator. Open to legal residents of the United States who are 18 years or older. Ends December 31, 2026."), { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(found.pagesNotOpened.count).toBeGreaterThan(0);
    expect(found.pagesNotOpened.pages.some((item) => item.url.includes("12-truck-giveaways") && /not opened/i.test(item.reason))).toBe(true);
  });
});

describe("entry form regression", () => {
  it.skipIf(!PRIVATE_FIXTURES)("keeps the current Malecki and Visit Orlando pages in Needs checking", async () => {
    const malecki = readFileSync(new URL("./fixtures/retest/johnmalecki-milwaukee.html", import.meta.url), "utf8");
    const rules = readFileSync(new URL("./fixtures/retest/johnmalecki-rules.html", import.meta.url), "utf8");
    const orlando = readFileSync(new URL("./fixtures/retest/visitorlando-win-a-trip-live.html", import.meta.url), "utf8");
    const older = readFileSync(new URL("./fixtures/retest/visitorlando-win-a-trip.html", import.meta.url), "utf8");
    const run = (pages: Array<{ url: string; title: string; html: string }>) => searchVerifiedGiveaways("vacation", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const target = String(input);
        if (target.includes("api.search.brave.com")) return Response.json({ web: { results: pages.map((item) => ({ url: item.url, title: item.title, description: "" })) } });
        if (target.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { status: 200 });
        const hit = pages.find((item) => target.startsWith(item.url));
        if (!hit) return new Response("missing", { status: 404 });
        return new Response(hit.html, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    const maleckiResult = await run([
      { url: "https://johnmalecki.com/pages/milwaukeegiveaway", title: "MilwaukeeGiveaway", html: malecki },
      { url: "https://johnmalecki.com/pages/giveaway-rules-regulations", title: "Official Rules", html: rules },
    ]);
    const maleckiRow = maleckiResult.listings.find((row) => row.url.includes("milwaukeegiveaway"));
    expect(maleckiRow?.listingGroup).toBe("check");
    expect(maleckiRow?.rulesNote).toBe("Entry form is not in the page HTML.");
    expect(maleckiRow?.endIso).toBe("2026-11-21");
    const live = await run([{ url: "https://www.visitorlando.com/win-a-trip/", title: "Win a Trip | Visit Orlando", html: orlando }]);
    const liveRow = live.listings[0];
    expect(liveRow?.listingGroup).toBe("check");
    expect(liveRow?.rulesNote).toBe("Entry form is not in the page HTML.");
    expect(liveRow?.endIso).toBe("2027-01-18");
    const saved = await run([{ url: "https://www.visitorlando.com/win-a-trip/", title: "Win a Trip | Visit Orlando", html: older }]);
    expect(saved.listings[0]?.listingGroup).toBe("verified");
  });
});

describe("calendar ics", () => {
  const item: CalendarContest = {
    uid: "twelve-days",
    title: "12 Days, of Giveaways",
    url: "https://powerequipment.honda.com/promotions/twelve-days-of-giveaways",
    endDate: "2026-12-24",
    endTime: null,
    timeZone: null,
    entryClock: "unstated",
    enteredAt: null,
  };

  it("escapes text, folds long lines, and writes an all-day end", () => {
    const ics = buildCalendar([item], NOW);
    expect(ics).toContain("SUMMARY:12 Days\\, of Giveaways ends");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261224");
    expect(ics).toContain("DTEND;VALUE=DATE:20261225");
    expect(ics).toContain("time zone not stated");
    expect(ics).toContain("\r\n");
    const long = foldIcsLine(`DESCRIPTION:${"A".repeat(120)}`);
    expect(long.split("\r\n ").length).toBeGreaterThan(1);
    expect(long.split("\r\n ").every((part) => new TextEncoder().encode(part).length <= 75)).toBe(true);
  });

  it("writes DTSTART with the rules time zone when a clock time is stated", () => {
    const timed: CalendarContest = { ...item, endTime: "23:59:00", timeZone: "America/New_York", entryClock: "calendar_day", enteredAt: new Date("2026-11-16T18:00:00.000Z") };
    const ics = buildCalendar([timed], NOW);
    expect(ics).toContain("DTSTART;TZID=America/New_York:20261224T235900");
    expect(ics).toContain("DTSTART;TZID=America/New_York:");
    expect(ics).toContain("Next entry");
  });
});
