import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
const PRIVATE_FIXTURES = existsSync(new URL("./fixtures/retest/vance-ruger.html", import.meta.url));
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chooseOnPageRules } from "@/domain/rules-facts";
import { classifyRenderedPage, mergeCheckedRows } from "@/server/addon-check";

const NOW = new Date("2026-11-16T12:00:00.000Z");

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/retest/${name}`, import.meta.url), "utf8");
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

describe("stored rows keep the 83ae473 decision", () => {
  it("ignores repeated headings, nav, footer, cookies, duplicates, and a rules index", () => {
    const text = `
      Official Rules
      Accept the Official Rules cookie banner.
      Rules
      Spring Jacket Official Rules
      Fall Jacket Official Rules
      LGND Supply Official Rules. No purchase necessary. Open to legal residents of the United States. The sweepstakes ends on November 22, 2026. Sponsor: LGND.
      LGND Supply Official Rules. No purchase necessary. Open to legal residents of the United States. The sweepstakes ends on November 22, 2026. Sponsor: LGND.
    `;
    expect(chooseOnPageRules(text, "LGND Jacket Giveaway", NOW)).toEqual({ ambiguous: false, text: null, title: null });
  });

  it.skipIf(!PRIVATE_FIXTURES)("keeps LGND verified with its end date", () => {
    const row = classifyRenderedPage(fixture("stored/lgnd.html"), "https://lgnd.com/giveaway", NOW);
    expect(row.endIso).toBe("2026-11-22");
    expect(row.listingGroup).toBe("verified");
    expect(row.rulesNote).not.toContain("Two rule sets");
  });

  it.skipIf(!PRIVATE_FIXTURES)("keeps the Visit Orlando rules end date", () => {
    const rules = classifyRenderedPage(fixture("visitorlando-sweepstakes-rules.html"), "https://www.visitorlando.com/win-a-trip/sweepstakes-rules/", NOW);
    expect(rules.endIso).toBe("2027-01-18");
    expect(rules.listingGroup).toBe("check");
    expect(rules.rulesNote).not.toContain("Two rule sets");
    const live = classifyRenderedPage(fixture("visitorlando-win-a-trip-live.html"), "https://www.visitorlando.com/win-a-trip/", NOW);
    expect(live.endIso).toBe("2027-01-18");
    expect(live.listingGroup).toBe("check");
    expect(live.rulesNote).not.toContain("Two rule sets");
  });

  it.skipIf(!PRIVATE_FIXTURES)("keeps the Hot Wheels end date and hides the folded rules page", () => {
    const entryHtml = fixture("stored/hotwheels-entry.html");
    const rulesHtml = fixture("stored/hotwheels-rules.html");
    const entry = classifyRenderedPage(entryHtml, "https://ram.hotwheelssweepstakes.com/", NOW);
    const rules = classifyRenderedPage(rulesHtml, "https://ram.hotwheelssweepstakes.com/rules.aspx", NOW);
    expect(rules.endIso).toBe("2026-12-14");
    expect(rules.rulesNote).not.toContain("Two rule sets");
    const merged = mergeCheckedRows([
      { ...entry, checkedAt: NOW.toISOString(), html: entryHtml, limits: [] },
      { ...rules, checkedAt: NOW.toISOString(), html: rulesHtml, limits: [] },
    ]);
    const row = merged.find((item) => item.url === "https://ram.hotwheelssweepstakes.com");
    expect(row?.endIso).toBe("2026-12-14");
    expect(row?.rulesNote).not.toContain("Two rule sets");
    expect(merged.find((item) => item.url.includes("rules.aspx"))?.hidden).toBe(true);
  });

  it.skipIf(!PRIVATE_FIXTURES)("labels Dream draws as donation drawings and keeps each end date", () => {
    const cases = [
      ["stored/dream-213.html", "https://dreamgiveaway.com/dg/draw/213", "https://dreamgiveaway.com/dg/terms-and-conditions/213", "2026-11-19"],
      ["stored/dream-214.html", "https://dreamgiveaway.com/dg/draw/214", "https://dreamgiveaway.com/dg/terms-and-conditions/214", "2026-11-26"],
      ["dream-215-entry.html", "https://dreamgiveaway.com/dg/draw/215", "https://dreamgiveaway.com/dg/terms-and-conditions/215", "2026-12-03"],
    ] as const;
    for (const [name, entryUrl, rulesUrl, endIso] of cases) {
      const entryHtml = fixture(name);
      const rulesHtml = name.startsWith("dream-215")
        ? fixture("dream-215-rules.html")
        : page("Dream Giveaway Official Rules", `<p>Official rules. ${entryHtml.replace(/<[^>]+>/g, " ")}</p>`);
      const entry = classifyRenderedPage(entryHtml, entryUrl, NOW);
      expect(entry.listingGroup).toBe("check");
      expect(entry.rulesNote).toBe("Donation drawing, free entry method in rules");
      if (entryHtml.includes("ends on")) expect(entry.endIso).toBe(endIso);
      const rules = classifyRenderedPage(rulesHtml, rulesUrl, NOW);
      const merged = mergeCheckedRows([
        { ...entry, checkedAt: NOW.toISOString(), html: entryHtml, limits: [] },
        { ...rules, checkedAt: NOW.toISOString(), html: rulesHtml, limits: [] },
      ]);
      const row = merged.find((item) => item.url === entryUrl);
      expect(row?.endIso).toBe(endIso);
      expect(row?.rulesNote).toBe("Donation drawing, free entry method in rules");
      expect(merged.find((item) => item.url === rulesUrl)?.hidden).toBe(true);
    }
  });

  it.skipIf(!PRIVATE_FIXTURES)("keeps the Malecki end date and the widget entry-form note", () => {
    const entryHtml = fixture("malecki-entry.html");
    const rulesHtml = fixture("malecki-rules.html");
    const merged = mergeCheckedRows([
      { ...classifyRenderedPage(entryHtml, "https://johnmalecki.com/pages/milwaukeegiveaway", NOW), checkedAt: NOW.toISOString(), html: entryHtml, limits: [] },
      { ...classifyRenderedPage(rulesHtml, "https://johnmalecki.com/pages/giveaway-rules-regulations", NOW), checkedAt: NOW.toISOString(), html: rulesHtml, limits: [] },
    ]);
    const row = merged.find((item) => item.url.includes("milwaukeegiveaway"));
    expect(row?.endIso).toBe("2026-11-21");
    expect(row?.listingGroup).toBe("check");
    expect(row?.rulesNote).toContain("Entry form not found (it may be inside a widget; reload the add-on and check again)");
    expect(row?.rulesNote).not.toContain("Two rule sets");
    expect(merged.find((item) => item.url.includes("giveaway-rules-regulations"))?.hidden).toBe(true);
    const archived = classifyRenderedPage(fixture("johnmalecki-rules.html"), "https://johnmalecki.com/pages/giveaway-rules-regulations", NOW);
    expect(archived.endIso).toBe("2026-11-21");
    expect(archived.rulesNote).not.toContain("Two rule sets");
  });

  it.skipIf(!PRIVATE_FIXTURES)("uses the Mystery Giveaway end on American Trucks and leaves a single rules set alone", () => {
    const chosen = classifyRenderedPage(fixture("americantrucks-two-rules.html"), "https://www.americantrucks.com/at-sweepstakes.html", NOW);
    expect(chosen.endIso).toBe("2026-11-18");
    expect(chosen.rulesNote).toContain("2026 $6,000 Mystery Giveaway");
    expect(chosen.rulesNote).not.toContain("Two rule sets");
    expect(chosen.rulesNote).not.toMatch(/open the rules page/i);
    const single = classifyRenderedPage(fixture("americantrucks.html"), "https://www.americantrucks.com/at-sweepstakes.html", NOW);
    expect(single.endIso).toBe("2026-11-18");
    expect(single.rulesNote).not.toContain("Two rule sets");
  });

  it.skipIf(!PRIVATE_FIXTURES)("says Vance has no rules and drops the NRA fast-entry hint", () => {
    const vance = classifyRenderedPage(fixture("vance-ruger.html"), "https://www.vanceoutdoors.com/ruger-sfar", NOW);
    expect(vance.rulesNote).toBe("Official rules not found on this page. End date not stated.");
    expect(vance.endIso).toBeNull();
    expect(vance.listingGroup).toBe("check");
    const nra = classifyRenderedPage(
      page("NRA Win This Truck", `<p>Fast Entry Prize Period 1 deadline 4/20/26. Enter to win a truck. No purchase necessary.</p><a href="https://trucksweepstakes.nra.org/OfficialRules?fs=True">Official Rules</a><form><input type="email" name="email"><button>Enter</button></form>`),
      "https://trucksweepstakes.nra.org/Enter",
      NOW,
    );
    expect(nra.endIso).toBeNull();
    expect(nra.listingGroup).toBe("check");
    expect(nra.rulesNote).not.toContain("4/20/26");
    expect(nra.rulesNote).not.toContain("Search preview");
    expect(nra.rulesNote).not.toContain("Two rule sets");
  });

  it.skipIf(!PRIVATE_FIXTURES)("keeps the paid-entry note on how to enter", () => {
    const row = classifyRenderedPage(fixture("stored/how-to-enter.html"), "https://johnmalecki.com/pages/how-to-enter", NOW);
    expect(row.rulesNote).toBe("Paid entries are not checked by the add-on.");
    expect(row.endIso).toBe("2026-10-26");
    expect(row.listingGroup).toBe("check");
  });

  it.skipIf(!PRIVATE_FIXTURES)("prints a read-only reclassify report", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "reclassify-"));
    const file = path.join(dir, "addon-checks.json");
    const original = JSON.stringify([
      {
        url: "https://lgnd.com/giveaway",
        title: "LGND",
        checkedByYou: true,
        listingGroup: "check",
        rulesNote: "Two rule sets on this page; end date needs checking",
        endIso: null,
        openRulesUrl: null,
        limits: [],
        checkedAt: NOW.toISOString(),
        html: fixture("stored/lgnd.html"),
      },
    ]);
    writeFileSync(file, original);
    const output = execFileSync("npm", ["run", "reclassify", "--", file], { cwd: process.cwd(), encoding: "utf8" });
    expect(output).toContain("https://lgnd.com/giveaway\t2026-11-22\tverified\t");
    expect(readFileSync(file, "utf8")).toBe(original);
  });
});
