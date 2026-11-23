import { describe, expect, it } from "vitest";
import { DIRECTORY_SOURCES, directoryMayExpand } from "@/config/directories";
import { WATCHED_SOURCES, cautionForUrl, presentableSeedFacts, seedCashChoice, watchedDomains, watchedSourceFor } from "@/config/watched-sources";
import { CASH_MENTIONED, CASH_OPTION, SPONSOR_CASH, cashNotesFromChoice, cashNotesFromText } from "@/domain/cash-alternative";
import { enterCaption, sampleFromVerified } from "@/app/design-preview/entries-sample";
import { searchVerifiedGiveaways } from "@/server/giveaway-search";

const NOW = new Date("2026-11-10T12:00:00Z");

describe("verified source seed", () => {
  it("uses the 37 verified shops and leaves unverified names off the list", () => {
    expect(WATCHED_SOURCES).toHaveLength(44);
    expect(WATCHED_SOURCES.every((source) => source.domain.length > 0)).toBe(true);
    const domains = watchedDomains();
    expect(domains).not.toContain("dieselpowergear.com");
    expect(domains.join(" ")).not.toMatch(/davesclassic|dieselbrother/i);
    expect(watchedDomains(WATCHED_SOURCES, "vehicle")).toContain("powersports.honda.com");
    expect(watchedSourceFor("https://powersports.honda.com/crf450rx-rideredandwinsweepstakes")?.prize).toBeNull();
    expect(watchedDomains(WATCHED_SOURCES, "vehicle")).toContain("hodsonmotors.com");
    expect(watchedDomains(WATCHED_SOURCES, "vehicle")).toContain("80eighty.com");
    expect(watchedDomains(WATCHED_SOURCES, "vehicle")).not.toContain("kitchenaid.com");
    expect(watchedDomains(WATCHED_SOURCES, "retail")).toEqual(["hgtv.com", "foodnetwork.com"]);
    expect(watchedSourceFor("https://www.hgtv.com/sweepstakes")?.prize).toBeNull();
    expect(watchedSourceFor("https://www.foodnetwork.com/sweepstakes")?.endDate).toBeNull();
  });

  it("does not treat unconfirmed prize or end-date notes as facts", () => {
    expect(presentableSeedFacts(watchedSourceFor("https://www.80eighty.com/pages/current-dream-car-giveaway")!).prize).toBeNull();
    expect(presentableSeedFacts(watchedSourceFor("https://lgndsupplyco.com/")!).prize).toBeNull();
    expect(presentableSeedFacts(watchedSourceFor("https://717supply.com/pages/giveaway")!).prize).toBeNull();
    const jude = watchedSourceFor("https://www.stjude.org/give/dream-home.html");
    expect(presentableSeedFacts(jude!).prize).toBeNull();
    expect(presentableSeedFacts(jude!).endDate).toBeNull();
    expect(jude?.paidRaffle).toBe(true);
  });

  it("carries the caution labels, including Idaho only for an Idaho profile", () => {
    expect(cautionForUrl("https://tropicaltorque.com/pages/official-rules", null)).toBeNull();
    expect(cautionForUrl("https://www.stjude.org/give/dream-home.html", "ID")).toBe("Paid raffle ticket");
    expect(cautionForUrl("https://winchevy.com/", null)).toBeNull();
    expect(cautionForUrl("https://winchevy.com/", "WA")).toBeNull();
    expect(cautionForUrl("https://www.winchevy.com/enter", "ID")).toBe("Not open in Idaho");
    expect(cautionForUrl("https://www.cleetusmcfarland.com/pages/giveaway-polaris", null)).toBe("Caution: prize vehicles are not street-legal");
    expect(cashNotesFromChoice(seedCashChoice("tropicaltorque.com")).map((note) => note.label)).toEqual([CASH_OPTION, SPONSOR_CASH]);
    expect(cashNotesFromChoice(seedCashChoice("tropicaltorque.com")).every((note) => note.tone !== "positive" || note.label === CASH_OPTION)).toBe(true);
    expect(cashNotesFromChoice(seedCashChoice("hodsonmotors.com"))).toEqual([{ label: CASH_MENTIONED, tone: "neutral" }]);
    expect(cashNotesFromChoice(seedCashChoice("murphysdiesel.com"))).toEqual([{ label: CASH_OPTION, tone: "positive" }]);
    expect(cashNotesFromText("No cash alternative for this giveaway.")).toEqual([]);
    expect(cashNotesFromText("The prize includes the truck plus $10,000 cash.")).toEqual([]);
    expect(cashNotesFromText("Winner may take a cash alternative equal to one-third of the ARV.")).toEqual([{ label: CASH_OPTION, tone: "positive" }]);
    expect(cashNotesFromText("The sponsor may substitute cash if the vehicle cannot be awarded.")).toEqual([{ label: SPONSOR_CASH, tone: "neutral" }]);
    expect(cashNotesFromText("Grand prize or $20,000 cash alternative.")).toEqual([{ label: CASH_MENTIONED, tone: "neutral" }]);
  });

  it("does not expand directories, including the three that are explicitly blocked", () => {
    expect(DIRECTORY_SOURCES).toHaveLength(21);
    expect(directoryMayExpand("https://sweepsdb.com/")).toBe(false);
    expect(DIRECTORY_SOURCES.every((source) => source.expandAllowed === false)).toBe(true);
    expect(directoryMayExpand("https://www.sweepsadvantage.com/")).toBe(false);
    expect(directoryMayExpand("https://www.contestgirl.com/sweepstakes/")).toBe(false);
    expect(directoryMayExpand("https://ilovegiveaways.com/page/2/?sort=new")).toBe(false);
    expect(directoryMayExpand("https://www.discovery.com/sweepstakes")).toBe(false);
  });

  it("labels a fetched St. Jude page as a paid raffle and does not copy a seed end date", async () => {
    const found = await searchVerifiedGiveaways("dream home", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [{ title: "Do not use the seed prize", url: "https://www.stjude.org/give/dream-home.html", description: "1996 Dodge Ram 2500" }] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(
          `<!doctype html><html><head><title>Dream Home</title><meta name="description" content="Dream Home"></head><body><p>Tickets are $100.</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      },
    });
    expect(found.listings).toHaveLength(1);
    const row = found.listings[0]!;
    expect(row.caution).toBe("Paid raffle ticket");
    expect(row.endIso).toBeNull();
    expect(row.prize).not.toMatch(/Dodge|Ram|\$35,000|\$100/);
    expect(row.methods).toEqual(["paid"]);
    expect(row.arvUsd).toBeNull();
    expect(enterCaption(sampleFromVerified(row))).not.toMatch(/^Prefill/);
  });

  it("labels a winner's cash choice from the fetched page, not as a caution", async () => {
    const found = await searchVerifiedGiveaways("boat", {
      apiKey: "test-key",
      searchUrl: "https://api.search.brave.com/res/v1/web/search",
      maxBraveCalls: 1,
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("api.search.brave.com")) {
          return Response.json({ web: { results: [{ title: "skip", url: "https://boats.example/giveaway", description: "snippet" }] } });
        }
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(
          `<!doctype html><html><head><title>Boat Giveaway</title><meta name="description" content="The winner may choose $100,000 cash instead of the boat."></head><body><p>Official rules. No purchase necessary.</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      },
    });
    expect(found.listings[0]?.cashNotes).toEqual([{ label: CASH_OPTION, tone: "positive" }]);
    expect(found.listings[0]?.caution).toBeNull();
  });
});
