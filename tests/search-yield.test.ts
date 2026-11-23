import { describe, expect, it, vi } from "vitest";
import { enterCaption, entryAction, sampleFromVerified } from "@/app/design-preview/entries-sample";
import { WATCHED_SOURCES } from "@/config/watched-sources";
import { observeHtml } from "@/domain/interpret";
import { FREE_METHOD_LABEL, queryVariants } from "@/domain/search-yield";
import { automaticEntryAllowed } from "@/domain/verified-entry";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-10T12:00:00Z");

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title}"></head><body>${body}</body></html>`;
}

const FORM = `<form action="https://good.example/enter"><input name="email"><button type="submit">Enter</button></form>`;

function search(results: Array<{ url: string; html?: string; status?: number }>, query = "giveaway", maxBraveCalls = 1) {
  const pages = new Map(results.map((item) => [item.url, item]));
  return searchVerifiedGiveaways(query, {
    apiKey: "test-key",
    searchUrl: "https://api.search.brave.com/res/v1/web/search",
    maxBraveCalls,
    now: () => NOW,
    lookupImpl: async () => ["93.184.216.34"],
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) {
        return Response.json({ web: { results: results.map((item) => ({ title: "skip", url: item.url, description: "snippet" })) } });
      }
      if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
      const hit = [...pages.values()].find((item) => url.startsWith(item.url));
      if (!hit) return new Response("missing", { status: 404 });
      if (hit.status) return new Response("no", { status: hit.status });
      return new Response(hit.html ?? "", { status: 200, headers: { "content-type": "text/html" } });
    },
  });
}

describe("search yield", () => {
  it("does not throw when an image alt has an unpaired surrogate", async () => {
    const html = page(
      "Surrogate Giveaway",
      `<p>No purchase necessary. Official rules. Sponsored by Good Sponsor. Enter to win a gift card. Open to legal residents of the United States. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p>
<h2>Prize</h2><img alt="prize ${String.fromCharCode(0xd800)}" src="https://good.example/prize.jpg">
${FORM}`,
    );
    const observed = observeHtml(html, "https://good.example/enter", NOW);
    expect(observed.ok).toBe(true);
    const found = await search([{ url: "https://good.example/enter", html }]);
    expect(found.listings.map((item) => item.title)).toEqual(["Surrogate Giveaway"]);
    expect(enterCaption(sampleFromVerified(found.listings[0]!))).toMatch(/^Prefill/);
  });

  it("shows a widget page as unverified and keeps a complete official page verified", async () => {
    const widget = page("Truck Giveaway", `<p>Enter the truck giveaway.</p><iframe src="https://gleam.io/abc/widget"></iframe>`);
    const ready = page(
      "Ready Giveaway",
      `<p>No purchase necessary. Official rules. Sponsored by Ready Sponsor. Enter to win a truck. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p>${FORM}`,
    );
    const found = await search([
      { url: "https://widget.example/enter", html: widget },
      { url: "https://ready.example/enter", html: ready },
    ]);
    const widgetRow = found.listings.find((item) => item.title === "Truck Giveaway");
    const readyRow = found.listings.find((item) => item.title === "Ready Giveaway");
    expect(found.listings.map((item) => item.title)).toEqual(["Ready Giveaway", "Truck Giveaway"]);
    expect(enterCaption(sampleFromVerified(widgetRow!))).toBe("Needs you");
    expect(enterCaption(sampleFromVerified(readyRow!))).toMatch(/^Prefill/);
    expect(found.listings.map((item) => item.title)).toContain("Truck Giveaway");
    expect(JSON.stringify(found.dropCounts)).not.toContain("http");
    expect(JSON.stringify(found.dropCounts)).not.toContain("test-key");
  });

  it("shows a news article and a listicle, and marks a paid lottery as paid", async () => {
    const news = `<!doctype html><html><head><title>Daily story</title><meta property="og:type" content="article"><meta name="description" content="A news story"></head><body><article><p>Published Monday.</p></article></body></html>`;
    const list = page("10 best giveaways this month", "<p>A roundup of contests.</p>");
    const lottery = page(
      "Idaho Lottery Raffle",
      `<p>Buy a ticket for the raffle.</p><a href="https://lottery.example/rules">Official rules</a>${FORM.replace("good.example", "lottery.example")}`,
    );
    const found = await search([
      { url: "https://news.example/story", html: news },
      { url: "https://list.example/roundup", html: list },
      { url: "https://lottery.example/enter", html: lottery },
    ]);
    expect(found.listings.map((item) => item.title)).toEqual(["Daily story", "10 best giveaways this month", "Idaho Lottery Raffle"]);
    expect(found.listings.find((item) => item.title === "Idaho Lottery Raffle")?.methods).toEqual(["paid"]);
    expect(enterCaption(sampleFromVerified(found.listings.find((item) => item.title === "Idaho Lottery Raffle")!))).not.toMatch(/^Prefill/);
  });

  it("dedupes extra Brave queries and stops at the call budget", async () => {
    const calls: string[] = [];
    const html = page(
      "Ready Giveaway",
      `<p>No purchase necessary. Official rules. Must be 18 years or older. One entry per person. Ends December 31, 2026.</p>${FORM}`,
    );
    const found = await searchVerifiedGiveaways("cash", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 3,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          calls.push(new URL(url).searchParams.get("q") ?? "");
          return Response.json({ web: { results: [{ title: "skip", url: "https://ready.example/enter", description: "snippet" }] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(queryVariants("cash")).toEqual(["cash", "cash sweepstakes official rules", "cash giveaway enter"]);
    expect(calls).toEqual(["cash giveaway", "cash sweepstakes", "cash contest"]);
    expect(calls.some((item) => item.includes("site:"))).toBe(false);
    expect(found.listings).toHaveLength(1);
    expect(found.braveCalls).toBe(3);

    calls.length = 0;
    const limited = await searchVerifiedGiveaways("truck", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          calls.push("brave");
          return Response.json({ web: { results: [] } });
        }
        return new Response("missing", { status: 404 });
      },
    });
    expect(limited.braveCalls).toBe(1);
    expect(calls).toEqual(["brave"]);
  });

  it("keeps a per-dollar store page and a membership page as paid, and logs raw against kept", async () => {
    const links = Array.from({ length: 9 }, (_, index) => `<a href="https://cdn${index}.example/a">shop</a>`).join("");
    const perDollar = `<!doctype html><html><head><title>Current Giveaway</title><meta property="og:type" content="article"></head><body><article><p>Earn 1 entry per $1 spent in the store.</p>${links}</article></body></html>`;
    const membership = page("Supply Giveaway", "<p>Merch or membership entries. No purchase necessary.</p>");
    const notes: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message) => {
      notes.push(String(message));
    });
    try {
      const found = await search([
        { url: "https://enrforce.example/pages/current-giveaway", html: perDollar },
        { url: "https://lgnd.example/giveaway", html: membership },
      ]);
      const dollar = found.listings.find((item) => item.title === "Current Giveaway");
      const member = found.listings.find((item) => item.title === "Supply Giveaway");
      expect(dollar?.methods).toEqual(["paid"]);
      expect(dollar?.freeMethodLabel).toBeNull();
      expect(dollar?.purchaseEntry).toBe(true);
      expect(member?.methods).toEqual(["paid"]);
      expect(member?.freeMethodLabel).toBe(FREE_METHOD_LABEL);
      for (const row of [dollar, member]) {
        const sample = sampleFromVerified(row!);
        expect(entryAction(sample)).toBe("paid");
        expect(enterCaption(sample)).not.toMatch(/^Prefill/);
        expect(automaticEntryAllowed(row!)).toBe(false);
      }
      const line = notes.find((item) => item.includes("search_yield"));
      expect(line).toBeTruthy();
      const parsed = JSON.parse(line ?? "{}") as { raw: number; kept: number };
      expect(parsed.raw).toBeGreaterThanOrEqual(parsed.kept);
      expect(parsed.kept).toBe(found.listings.length);
      expect(line).not.toMatch(/https?:/);
      expect(line).not.toContain("test-key");
    } finally {
      spy.mockRestore();
    }
  });

  it("queries watched vehicle sites once and lists only a page Brave returned and the fetch verified", async () => {
    expect(WATCHED_SOURCES.find((source) => source.name === "80Eighty")?.domain).toBe("80eighty.com");
    expect(WATCHED_SOURCES.some((source) => /dave's classic trucks|diesel brothers/i.test(source.name))).toBe(false);
    const calls: string[] = [];
    const html = page(
      "Dream Car Giveaway",
      "<article><p>NO PURCHASE NECESSARY. Orders earn entries.</p><a href=\"/pages/current-giveaway\">Current giveaway</a><a href=\"/pages/winners\">Winners</a></article>",
    );
    const found = await searchVerifiedGiveaways("truck giveaways", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 4,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          const asked = new URL(url).searchParams.get("q") ?? "";
          calls.push(asked);
          if (asked.includes("site:")) {
            return Response.json({
              web: {
                results: [
                  { title: "skip", url: "https://80eighty.com/pages/dream-car-giveaway", description: "snippet" },
                  { title: "skip", url: "https://hodsonmotors.com/giveaway", description: "snippet" },
                ],
              },
            });
          }
          return Response.json({ web: { results: [] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        if (url.startsWith("https://80eighty.com/")) return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
        return new Response("missing", { status: 404 });
      },
    });
    const siteCalls = calls.filter((item) => item.includes("site:"));
    expect(siteCalls).toHaveLength(1);
    expect(siteCalls[0]).toContain("site:80eighty.com");
    expect(siteCalls[0]).toContain("site:hodsonmotors.com");
    expect(siteCalls[0]).not.toContain("davesclassic");
    expect(siteCalls[0]).not.toContain("dieselpowergear");
    expect(siteCalls[0]).not.toContain("dieselbrothers");
    expect(found.listings.map((item) => item.url).sort()).toEqual(["https://80eighty.com/pages/dream-car-giveaway", "https://hodsonmotors.com/giveaway"]);
    const eighty = found.listings.find((item) => item.url.includes("80eighty.com"));
    expect(eighty?.methods).toEqual(["paid"]);
    expect(eighty?.freeMethodLabel).toBe(FREE_METHOD_LABEL);
    expect(eighty?.purchaseEntry).toBe(true);
    expect(automaticEntryAllowed(eighty!)).toBe(false);
    expect(enterCaption(sampleFromVerified(eighty!))).not.toMatch(/^Prefill/);
    const hodson = found.listings.find((item) => item.url.includes("hodsonmotors.com"));
    expect(hodson?.endIso).toBeNull();
    expect(hodson?.prize).toBe("Not stated on a fetched page.");
  });
});
