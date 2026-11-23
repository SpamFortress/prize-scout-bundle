import { existsSync, readFileSync } from "node:fs";
const PRIVATE_FIXTURES = existsSync(new URL("./fixtures/retest/vance-ruger.html", import.meta.url));
import { describe, expect, it } from "vitest";
import { formatAddonEnd, statedEndIso } from "@/domain/dates";
import { applyAddonOverlay, enterMode, rulesReading, type EntrySample } from "@/app/design-preview/entries-sample";
import { observeHtml } from "@/domain/interpret";
import { scanScamWarning } from "@/domain/rules-checklist";
import { extractRulesFacts } from "@/domain/rules-facts";
import { enterDestinationNote, stripTrackingParams } from "@/domain/verification-checks";
import { classifyAttachedRules, classifyRenderedPage, mergeCheckedRows, notContestPage, withAddonVersion } from "@/server/addon-check";
import { listAddonChecks, resetAddonChecksForTests, saveAddonCheck, setPairingTokenForTests } from "@/server/addon-pairing";
import { pdfBytesToHtml } from "@/server/pdf-text";

const NOW = new Date("2026-11-16T12:00:00.000Z");

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

describe("owner add-on misreads", () => {
  it("uses the NRA sweepstakes end, not the fast-entry deadline, and keeps Idaho open", () => {
    const html = page(
      "NRA Win This Truck",
      `<p>No purchase necessary. Official rules. Sweepstakes Entry Period begins at 12:01 AM ET on 3/3/26 and ENDS AT 11:59 PM ET ON 1/30/27.</p>
<p>Fast Entry Prize Period 1 deadline 4/20/26.</p>
<p>Open to legal residents of the United States and Washington, D.C. who are 21 years or older and licensed drivers. Void in MN, MT, WA.</p>
<p>Method #1: online entry with a contribution. Method #3: mail a card to the sponsor.</p>
<form action="/Enter"><input type="email" name="email"><button>Contribute</button></form>`,
    );
    expect(statedEndIso(html.replace(/<[^>]+>/g, " "), NOW)).toBe("2027-01-30");
    const facts = extractRulesFacts(html.replace(/<[^>]+>/g, " "));
    expect(facts.excludedStates).toEqual(expect.arrayContaining(["MN", "MT", "WA"]));
    expect(facts.excludedStates).not.toContain("ID");
    const row = classifyRenderedPage(html, "https://trucksweepstakes.nra.org/Enter", NOW);
    expect(row.endIso).toBe("2027-01-30");
    expect(row.rulesNote).not.toBe("This contest has ended.");
    expect(row.rulesNote).toBe("Free entry is by mail (Method #3). Prize Scout does not fill the contribution form.");
    expect(row.listingGroup).not.toBe("verified");
  });

  it("does not treat a winner's Social Security number as a scam or a pre-win form field", () => {
    const text = "At the time Vehicle is delivered, Grand Prize Winner must have a valid driver's license and provide a valid Social Security number.";
    expect(scanScamWarning(text)).toEqual([]);
    const html = page(
      "Hot Wheels Ram Official Rules",
      `<p>No purchase necessary. ${text} Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026. Sponsor: Hot Wheels.</p>`,
    );
    const row = classifyRenderedPage(html, "https://ram.hotwheelssweepstakes.com/rules.aspx", NOW);
    expect(row.rulesNote).not.toMatch(/Scam warning/);
    expect(enterDestinationNote(html, "https://ram.hotwheelssweepstakes.com/rules.aspx")).toBeNull();
    expect(scanScamWarning("Pay the shipping fee before you claim the prize.")).not.toEqual([]);
  });

  it("reads the current AmericanTrucks rules in a hidden dialog and ignores a 2021 date and terms-of-use", () => {
    const html = page(
      "AmericanTrucks Sweepstakes",
      `<p>This giveaway ended December 31, 2021.</p>
<a href="https://www.americantrucks.com/terms-of-use.html">Terms of use</a>
<div role="dialog" aria-modal="true" style="display:none">
<p>2026 $6,000 Mystery Giveaway Official Rules. NO PURCHASE NECESSARY. Open to legal residents of the United States, Washington, D.C. and Canada who are 18 years or older, excluding Florida, New York, Rhode Island and Quebec. Sponsor: Turn 5, Inc. Drawn every week starting 10/19 at 11:59PM EST. The sweepstakes ends on December 31, 2026.</p>
</div>
<form><input type="email" name="email"><button type="submit">Enter</button></form>`,
    );
    const observed = observeHtml(html, "https://www.americantrucks.com/at-sweepstakes.html", NOW);
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    expect(observed.contest.rulesUrl ?? "").not.toMatch(/terms-of-use/);
    expect(statedEndIso(html.replace(/<[^>]+>/g, " "), NOW)).toBe("2026-12-31");
    const facts = extractRulesFacts(html.replace(/<[^>]+>/g, " "));
    expect(facts.excludedStates).toEqual(expect.arrayContaining(["FL", "NY", "RI"]));
    expect(facts.excludedStates).not.toContain("ID");
  });

  it("merges SweepWidget frame text and tags those facts", () => {
    // The reader is a classic script. Node loads that same file.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reader = require("../extension/reader.js") as {
      mergeFrameReads: (reads: Array<{ frameId: number; url: string; result: { title: string; html: string; limits: string[] } }>) => { html: string; limits: string[] };
    };
    const merged = reader.mergeFrameReads([
      { frameId: 0, url: "https://www.guntalk.com/win", result: { title: "Gun Talk", html: page("Gun Talk", "<p>Win</p>"), limits: ["cross-origin iframe skipped"] } },
      {
        frameId: 2,
        url: "https://sweepwidget.com/view/123",
        result: {
          title: "Widget",
          html: "<p>START DATE November 1, 2026 @ 12:00 am END DATE November 30, 2026 @ 11:59 pm. CZ Duty F4.0 - Manual Safety - 9mm Pistol. Black Hills Ammunition MK262 MOD 1-C 77gr 5.56mm Ammo (460rds).</p>",
          limits: [],
        },
      },
    ]);
    expect(merged.limits).not.toContain("cross-origin iframe skipped");
    expect(merged.html).toContain('data-widget-frame="sweepwidget.com"');
    const row = classifyRenderedPage(merged.html, "https://www.guntalk.com/win", NOW);
    expect(row.endIso).toBe("2026-11-30");
    expect(row.widgetFacts).toMatch(/embedded widget/);
  });

  it("classifies extracted PDF rules text without fetching", async () => {
    const bytes = readFileSync(new URL("./fixtures/retest/sample-rules.pdf", import.meta.url));
    const html = await pdfBytesToHtml(new Uint8Array(bytes));
    expect(html.toLowerCase()).toContain("official rules");
    const row = classifyRenderedPage(html, "https://s3.amazonaws.com/wit-challenge-assets-prod/legal/enter-to-win.pdf", NOW);
    expect(row.rulesNote).not.toBe("The page had no title, so no contest recorded.");
    expect(row.endIso).toBe("2026-12-31");
  });

  it("links a rules check to its entry row and ignores a fragment", () => {
    const entryHtml = page("Dream Giveaway", `<p>Enter to win a car.</p><a href="https://dreamgiveaway.com/dg/terms-and-conditions/214">Official Rules</a><form><input type="email" name="email"><button>Enter</button></form>`);
    const rulesHtml = page("Terms", `<p>No purchase necessary. Official rules. Sponsored by Dream Giveaway. Enter to win a car. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026.</p>`);
    const entry = classifyRenderedPage(entryHtml, "https://dreamgiveaway.com/dg/draw/214#ajBbC7sTDxh8zUq", NOW);
    expect(stripTrackingParams(entry.url)).toBe("https://dreamgiveaway.com/dg/draw/214");
    const rules = classifyRenderedPage(rulesHtml, "https://dreamgiveaway.com/dg/terms-and-conditions/214", NOW);
    const merged = mergeCheckedRows([
      { ...entry, url: "https://dreamgiveaway.com/dg/draw/214#ajBbC7sTDxh8zUq", checkedAt: NOW.toISOString(), html: entryHtml, limits: [] },
      { ...rules, checkedAt: NOW.toISOString(), html: rulesHtml, limits: [], rulesNote: "Open the rules page and click Prize Scout again." },
    ]);
    const row = merged.find((item) => item.url.includes("/draw/214"));
    expect(row?.hidden).not.toBe(true);
    expect(row?.endIso).toBe("2026-12-31");
    expect(row?.rulesNote).not.toBe("Open the rules page and click Prize Scout again.");
    expect(merged.find((item) => item.url.includes("terms-and-conditions"))?.hidden).toBe(true);
  });

  it("keeps Idaho eligible for the Hot Wheels Ram rules", () => {
    const html = page(
      "Hot Wheels Ram Official Rules",
      `<p>ENTRY OPEN ONLY TO LEGAL RESIDENTS OF THE 50 UNITED STATES AND THE DISTRICT OF COLUMBIA WHO ARE AT LEAST EIGHTEEN (18) YEARS OF AGE AND HOLD A VALID DRIVERS LICENSE. VOID IN PUERTO RICO, ALL U.S. TERRITORIES, AND WHERE PROHIBITED BY LAW.</p>
<p>The sponsor is Mattel, Inc., El Segundo, CA. The administrator is Ventura Associates, New York, NY.</p>
<p>This sweepstakes is open to legal residents of the 50 United States and the District of Columbia. Void in Puerto Rico and U.S. territories. Intended for viewing within the United States only.</p>
<p>Entry period: 6:00 a.m. PT Sept 14, 2026 to 11:59 p.m. PT Dec 14, 2026. One entry per person per email per day. The entry Website is www.hotwheels.com/ramsweepstakes.</p>`,
    );
    const facts = extractRulesFacts(html.replace(/<[^>]+>/g, " "));
    expect(facts.includedStates).toContain("ID");
    expect(facts.includedStates).toContain("CA");
    expect(facts.includedStates).toContain("NY");
    expect(facts.excludedStates).not.toContain("ID");
    expect(facts.excludedStates).not.toContain("CA");
    expect(facts.excludedStates).not.toContain("NY");
    expect(facts.frequency).toBe("daily");
    const row = classifyRenderedPage(html, "https://ram.hotwheelssweepstakes.com/rules.aspx", NOW);
    expect(row.rulesNote).not.toBe("Not open in Idaho");
    expect(row.endIso).toBe("2026-12-14");
  });

  it("names the missing end date and the Official Rules PDF", () => {
    const html = page(
      "NRA Win This Truck",
      `<p>Enter to win a truck. No purchase necessary.</p><a href="https://trucksweepstakes.nra.org/OfficialRules?fs=True">Official Rules</a><form><input type="email" name="email"><button type="submit">Enter</button></form>`,
    );
    const row = classifyRenderedPage(html, "https://trucksweepstakes.nra.org/Enter", NOW);
    expect(row.endIso).toBeNull();
    expect(row.rulesNote).toBe("End date needs checking. Open the Official Rules (PDF) and click Check this tab.");
    expect(row.rulesNote).not.toContain("still needs a stated end date or rules");
    const preview = classifyRenderedPage(
      page("NRA Win This Truck", `<p>Fast Entry Prize Period 1 deadline 4/20/26. Enter to win a truck. No purchase necessary.</p><a href="https://trucksweepstakes.nra.org/OfficialRules?fs=True">Official Rules</a><form><input type="email" name="email"><button>Enter</button></form>`),
      "https://trucksweepstakes.nra.org/Enter",
      NOW,
    );
    expect(preview.endIso).toBeNull();
    expect(preview.rulesNote).toContain("End date needs checking");
    expect(preview.rulesNote).not.toContain("4/20/26");
    expect(preview.rulesNote).not.toContain("Search preview");
  });

  it("hides terms, privacy, search, and promotions indexes", () => {
    expect(notContestPage("https://sweepwidget.com/docs/terms-of-use-for-contest-participants", "Terms of use")).toBe(true);
    expect(notContestPage("https://sweepwidget.com/privacy", "Privacy policy")).toBe(true);
    expect(notContestPage("https://www.denverbroncos.com/terms-of-use", "Terms of use")).toBe(true);
    expect(notContestPage("https://www.sportsmansoutdoorsuperstore.com/search.cfm?kword=giveaway", "Search")).toBe(true);
    expect(notContestPage("https://powerequipment.honda.com/promotions", "Promotions")).toBe(true);
    expect(notContestPage("https://dreamgiveaway.com/rules", "Rules")).toBe(true);
    expect(notContestPage("https://dreamgiveaway.com/dg/terms-and-conditions/214", "Official Rules")).toBe(false);
    const row = classifyRenderedPage(page("Terms of use", "<p>Platform terms.</p>"), "https://www.denverbroncos.com/terms-of-use", NOW);
    expect(row.notContest).toBe(true);
    expect(row.rulesNote).toBe("Not a contest page");
  });
});

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/retest/${name}`, import.meta.url), "utf8");
}

describe("owner add-on recheck", () => {
  it.skipIf(!PRIVATE_FIXTURES)("uses the Mystery Giveaway rules when the page also has SMS rules", () => {
    const row = classifyRenderedPage(fixture("americantrucks-two-rules.html"), "https://www.americantrucks.com/at-sweepstakes.html", NOW);
    expect(row.endIso).toBe("2026-11-18");
    expect(row.rulesNote).not.toMatch(/open the rules page/i);
    expect(row.rulesNote).not.toBe("Two rule sets on this page; end date needs checking");
  });

  it("does not guess when two rule sets do not match the page title", () => {
    const html = page(
      "Weekly Giveaway",
      `<p>Alpha Contest Official Rules. The sweepstakes ends on December 1, 2026. No purchase necessary.</p>
<p>Beta Contest Official Rules. The sweepstakes ends on December 20, 2026. No purchase necessary.</p>`,
    );
    const row = classifyRenderedPage(html, "https://example.com/giveaway", NOW);
    expect(row.rulesNote).toBe("Two rule sets on this page; end date needs checking");
    expect(row.endIso).toBeNull();
  });

  it.skipIf(!PRIVATE_FIXTURES)("re-decides a folded Malecki rules page instead of asking for it again", () => {
    const entryHtml = fixture("malecki-entry.html");
    const rulesHtml = fixture("malecki-rules.html");
    const entry = classifyRenderedPage(entryHtml, "https://johnmalecki.com/pages/milwaukeegiveaway", NOW);
    const rules = classifyRenderedPage(rulesHtml, "https://johnmalecki.com/pages/giveaway-rules-regulations", NOW);
    const merged = mergeCheckedRows([
      { ...entry, checkedAt: NOW.toISOString(), html: entryHtml, limits: [] },
      { ...rules, checkedAt: NOW.toISOString(), html: rulesHtml, limits: [] },
    ]);
    const row = merged.find((item) => item.url.includes("milwaukeegiveaway"));
    expect(row?.endIso).toBe("2026-11-21");
    expect(row?.rulesNote).not.toMatch(/open the rules page/i);
    expect(row?.rulesNote).toContain("Entry form not found (it may be inside a widget; reload the add-on and check again)");
    expect(row?.rulesNote).toContain("Purchase entries are paid");
    expect(row?.rulesNote).not.toBe("Not open in Idaho");
    expect(row?.listingGroup).not.toBe("verified");
  });

  it.skipIf(!PRIVATE_FIXTURES)("says the rules were not on the page when there is no rules link", () => {
    const row = classifyRenderedPage(fixture("vance-ruger.html"), "https://www.vanceoutdoors.com/ruger-sfar", NOW);
    expect(row.rulesNote).toBe("Official rules not found on this page. End date not stated.");
    expect(row.listingGroup).not.toBe("verified");
    expect(row.endIso).toBeNull();
  });

  it.skipIf(!PRIVATE_FIXTURES)("lists a page with no rules below a page that has rules", async () => {
    setPairingTokenForTests("sort-token");
    saveAddonCheck({
      url: "https://www.vanceoutdoors.com/ruger-sfar",
      title: "Ruger SFAR",
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: "Official rules not found on this page. End date not stated.",
      endIso: null,
      openRulesUrl: null,
      limits: [],
      checkedAt: NOW.toISOString(),
      html: fixture("vance-ruger.html"),
    });
    saveAddonCheck({
      url: "https://www.americantrucks.com/at-sweepstakes.html",
      title: "Mystery Giveaway",
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: "Checked by you.",
      endIso: "2026-11-18",
      openRulesUrl: null,
      limits: [],
      checkedAt: NOW.toISOString(),
      html: fixture("americantrucks-two-rules.html"),
    });
    const rows = await listAddonChecks();
    const urls = rows.map((row) => row.url);
    expect(urls.indexOf("https://www.americantrucks.com/at-sweepstakes.html")).toBeLessThan(urls.indexOf("https://www.vanceoutdoors.com/ruger-sfar"));
    resetAddonChecksForTests();
  });

  it.skipIf(!PRIVATE_FIXTURES)("classifies pasted NRA rules without fetching the PDF", () => {
    const wrapper = `<html><head><title>OfficialRules</title></head><body><embed type="application/pdf" src="https://trucksweepstakes.nra.org/OfficialRules?fs=True"></body></html>`;
    const row = classifyAttachedRules(
      "https://trucksweepstakes.nra.org/OfficialRules?fs=True",
      wrapper,
      `<article>${fixture("nra-official-rules.txt")}</article>`,
      "pasted",
      NOW,
    );
    expect(row.endIso).toBe("2027-01-30");
    expect(row.rulesNote).toBe("Free entry is by mail (Method #3). Prize Scout does not fill the contribution form.");
    expect(row.rulesNote).not.toBe("Not open in Idaho");
    expect(row.listingGroup).not.toBe("verified");
  });

  it.skipIf(!PRIVATE_FIXTURES)("labels a Dream Giveaway draw as a donation drawing and folds its terms", () => {
    const entryHtml = fixture("dream-215-entry.html");
    const rulesHtml = fixture("dream-215-rules.html");
    const facts = extractRulesFacts(rulesHtml.replace(/<[^>]+>/g, " "));
    expect(facts.excludedStates).not.toContain("ID");
    const entry = classifyRenderedPage(entryHtml, "https://dreamgiveaway.com/dg/draw/215", NOW);
    const rules = classifyRenderedPage(rulesHtml, "https://dreamgiveaway.com/dg/terms-and-conditions/215", NOW);
    const merged = mergeCheckedRows([
      { ...entry, checkedAt: NOW.toISOString(), html: entryHtml, limits: [] },
      { ...rules, checkedAt: NOW.toISOString(), html: rulesHtml, limits: [] },
    ]);
    const row = merged.find((item) => item.url.includes("/draw/215"));
    expect(row?.endIso).toBe("2026-12-03");
    expect(row?.rulesNote).toBe("Donation drawing, free entry method in rules");
    expect(row?.listingGroup).not.toBe("verified");
    expect(merged.find((item) => item.url.includes("terms-and-conditions"))?.hidden).toBe(true);
  });

  it("records an old add-on version and a frame the browser did not read", () => {
    const row = withAddonVersion(
      classifyRenderedPage(page("Gun Talk", "<p>Win</p>"), "https://www.guntalk.com/win", NOW),
      "0.1.0",
    );
    expect(row.addonVersion).toBe("0.1.0");
    expect(row.rulesNote).toContain("Old add-on version: reload it on chrome://extensions");
    const current = withAddonVersion(classifyRenderedPage(page("Gun Talk", "<p>Win</p>"), "https://www.guntalk.com/win", NOW), "0.2.1");
    expect(current.rulesNote).not.toContain("Old add-on version");
    expect(withAddonVersion(current, "0.2.0").rulesNote).not.toContain("Old add-on version");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reader = require("../extension/reader.js") as {
      mergeFrameReads: (reads: Array<{ frameId?: number; url?: string; error?: string; result?: { title: string; html: string; limits: string[]; frameUrl?: string; pdfUrl?: string } }>) => { limits: string[]; pdfUrl: string };
      pdfEmbedUrl: (doc: { querySelector: () => { getAttribute: () => string } | null }, pageUrl: string) => string;
    };
    const merged = reader.mergeFrameReads([
      {
        frameId: 0,
        result: {
          title: "Gun Talk",
          html: page("Gun Talk", '<iframe src="https://embed.sweepwidget.com/view/1"></iframe>'),
          limits: ["cross-origin iframe skipped"],
          frameUrl: "https://www.guntalk.com/win",
          pdfUrl: "",
        },
      },
      { frameId: 4, url: "https://www.sweepwidget.com/view/2", error: "Cannot access contents of url" },
    ]);
    expect(merged.limits).toContain("frame not read: https://embed.sweepwidget.com/view/1");
    expect(merged.limits).toContain("frame not read: https://www.sweepwidget.com/view/2");
    expect(reader.pdfEmbedUrl(
      { querySelector: () => ({ getAttribute: () => "https://trucksweepstakes.nra.org/OfficialRules?fs=True" }) },
      "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html",
    )).toBe("https://trucksweepstakes.nra.org/OfficialRules?fs=True");
  });
});

describe("OVRLND paid listing with a free mail-in method", () => {
  const listingUrl = "https://ovrlnd.com/pages/1986-toyota-pickup-xtracab-4wd-dlx";
  const rulesUrl = "https://ovrlnd.com/pages/toyota-rules";
  const listingHtml = page(
    "1986 Toyota Pickup Xtracab 4WD DLX",
    `<p>Ends 11:59pm PST Dec 3rd 2026</p><p>Orders also earn an entry with every purchase from the shop.</p><a href="${rulesUrl}">Sweepstakes</a><form><input type="email" name="email"><button>Enter</button></form>`,
  );
  const rulesHtml = page(
    "1986 Toyota Pickup Xtracab Official Rules",
    "<p>NO PURCHASE OR PAYMENT OF MONEY IS NECESSARY TO ENTER OR WIN. A mail-in entry is available. The sweepstakes ends at 11:59:59 p.m. ET on December 3, 2026.</p>",
  );

  it("keeps the paid note until the same-domain rules page is folded", () => {
    const alone = classifyRenderedPage(listingHtml, listingUrl, NOW);
    expect(alone.endIso).toBe("2026-12-03");
    expect(alone.rulesNote).toBe("Paid entries are not checked by the add-on.");
    expect(alone.listingGroup).toBe("check");
    const merged = mergeCheckedRows([
      { ...alone, checkedAt: NOW.toISOString(), html: listingHtml, limits: [] },
      { ...classifyRenderedPage(rulesHtml, rulesUrl, NOW), checkedAt: NOW.toISOString(), html: rulesHtml, limits: [] },
    ]);
    const row = merged.find((item) => item.url === listingUrl);
    expect(row?.endIso).toBe("2026-12-03");
    expect(row?.rulesNote).toBe("Paid entries; free mail-in method in rules");
    expect(row?.listingGroup).toBe("check");
    expect(row?.rulesNote).not.toMatch(/free entry$/i);
    expect(merged.find((item) => item.url === rulesUrl)?.hidden).toBe(true);
  });

  it("shows the extracted end date on a paid add-on row", () => {
    expect(formatAddonEnd("2026-12-03")).toBe("Ends Dec 3, 2026");
    const popup = readFileSync("extension/popup.js", "utf8");
    const manifest = readFileSync("extension/manifest.json", "utf8");
    expect(popup).toContain('const ADDON_VERSION = "0.2.2"');
    expect(manifest).toContain('"version": "0.2.2"');
    expect(popup.indexOf("endDateLine")).toBeLessThan(popup.indexOf('link.textContent = "Open rules"'));
    const sample = {
      id: "ovrlnd",
      title: "1986 Toyota Pickup",
      status: "",
      end: "",
      countText: "",
      countKind: "estimated" as const,
      spend: null,
      entryLimit: "",
      eligibility: "",
      prize: "",
      history: [],
      url: listingUrl,
      delivery: "",
      kind: "daily-open" as const,
      methods: ["free"] as Array<"free" | "paid">,
      liveVerified: true,
      rulesVerified: true,
      formVerified: true,
    } satisfies EntrySample;
    const overlaid = applyAddonOverlay(sample, {
      checkedByYou: false,
      listingGroup: "check",
      rulesNote: "Paid entries; free mail-in method in rules",
      endIso: "2026-12-03",
      openRulesUrl: rulesUrl,
      addonVersion: "0.2.2",
    });
    expect(overlaid.addonChecked).toBe(true);
    expect(overlaid.end).toBe("2026-12-03");
    expect(overlaid.purchaseEntry).toBe(true);
    expect(overlaid.methods).toEqual(["paid"]);
    expect(enterMode(overlaid)).toBe("needs_you");
    expect(rulesReading(overlaid).find((line) => line.label === "End date")?.value).toBe("Ends Dec 3, 2026");
    expect(rulesReading(overlaid).find((line) => line.label === "Open rules")?.value).toBe(rulesUrl);
  });
});
