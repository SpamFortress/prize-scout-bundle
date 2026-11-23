import { existsSync, readFileSync } from "node:fs";
const PRIVATE_FIXTURES = existsSync(new URL("./fixtures/retest/vance-ruger.html", import.meta.url));
import { describe, expect, it } from "vitest";
import { classifyRenderedPage, missingFactsNote, reclassifyStoredChecks } from "@/server/addon-check";
import type { AddonCheckRecord } from "@/server/addon-pairing";

const NOW = "2026-11-16T12:00:00.000Z";
const EARLIER = "2026-11-01T12:00:00.000Z";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/retest/${name}`, import.meta.url), "utf8");
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

function row(url: string, html: string, extra: Partial<AddonCheckRecord> = {}): AddonCheckRecord {
  return {
    url,
    title: "",
    checkedByYou: true,
    listingGroup: "check",
    rulesNote: "",
    endIso: null,
    openRulesUrl: null,
    limits: [],
    checkedAt: NOW,
    html,
    ...extra,
  };
}

function signature(record: AddonCheckRecord) {
  return {
    url: record.url,
    endIso: record.endIso,
    listingGroup: record.listingGroup,
    rulesNote: record.rulesNote,
    hidden: record.hidden === true,
    notContest: record.notContest === true,
  };
}

function batch(): AddonCheckRecord[] {
  const nraCore = "Entries must be received by 11:59 PM ET on 1/30/27. Fast Entry Prize Period 1 ends at 4/20/26. Mail-in entries must be postmarked by 1/30/27 and received by 2/06/27. ";
  let nraVisible = nraCore;
  while (nraVisible.length < 1607) nraVisible += "toolbar ";
  nraVisible = nraVisible.slice(0, 1607);
  const nraMid = Math.floor(nraVisible.length / 2);
  const nraShell = `<!doctype html><html><head><title>Win This Truck Official Rules</title></head><body><section><p>${nraVisible.slice(0, nraMid)}</p></section><section><p>${nraVisible.slice(nraMid)}</p></section></body></html>`;
  const maleckiRules = `${fixture("malecki-rules.html")}<p>The other sweepstakes ends 10/26/26.</p>`;
  return [
    row("https://www.visitorlando.com/win-a-trip/sweepstakes-rules", page("Old Visit Orlando", "<p>Void in Idaho. The sweepstakes ends on January 18, 2027. No purchase necessary.</p>"), { checkedAt: EARLIER }),
    row("https://www.visitorlando.com/win-a-trip/sweepstakes-rules/", fixture("visitorlando-sweepstakes-rules.html"), { checkedAt: NOW }),
    row("https://johnmalecki.com/pages/giveaway-rules-regulations", maleckiRules),
    row("https://johnmalecki.com/pages/how-to-enter", fixture("stored/how-to-enter.html")),
    row("https://www.americantrucks.com/at-sweepstakes.html", fixture("americantrucks-two-rules.html")),
    row("https://ram.hotwheelssweepstakes.com/", fixture("stored/hotwheels-entry.html"), { openRulesUrl: "https://ram.hotwheelssweepstakes.com/rules.aspx" }),
    row("https://ram.hotwheelssweepstakes.com/rules.aspx", fixture("stored/hotwheels-rules.html")),
    row("https://www.vanceoutdoors.com/ruger-sfar", page("Ruger SFAR Giveaway", `<p>Enter to win a Ruger SFAR. The sweepstakes begins and ends at the specified time in the entry.</p><form><input type="email" name="email"><button>Enter</button></form><p>Marine Service &amp; Repair Sweepstakes Official Rules: No purchase or payment required. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing. Sponsor: Marine Service Co.</p>`), { checkedAt: EARLIER, title: "Ruger SFAR Giveaway", addonVersion: "0.2.0", limits: [] }),
    row("https://www.vanceoutdoors.com/ruger-sfar/", page("Ruger SFAR Giveaway", `<p>Enter to win a Ruger SFAR. The sweepstakes begins and ends at the specified time in the entry.</p><form><input type="email" name="email"><button>Enter</button></form><p>Marine Service &amp; Repair Sweepstakes Official Rules: No purchase or payment required. Open to legal residents of the United States who are 18 years or older. Winners will be selected in a random drawing. Sponsor: Marine Service Co.</p>`), { checkedAt: NOW, title: "Ruger SFAR Giveaway", addonVersion: "0.2.0", limits: [] }),
    row("https://wintruck.nra.org/Enter", page("Win This Truck", `<p>Enter the Win This Truck sweepstakes. Entries must be received by 11:59 PM ET on 1/30/27.</p><form><input type="email" name="email"><button>Enter</button></form>`), { title: "Win This Truck", addonVersion: "0.2.0", limits: [] }),
    row("https://wintruck.nra.org/OfficialRules?fs=True", nraShell, { title: "Win This Truck Official Rules", addonVersion: "0.2.0", limits: [] }),
    row("https://lgnd.com/pages/lgnd-jacket-rules", page("LGND Jacket Giveaway", `<section data-widget-frame="sweepwidget.com"><p>Get 5X entries when you share.</p></section><p>Purchase a hat in the shop.</p><p>No purchase necessary. The sweepstakes ends on November 22, 2026. Sponsor: LGND. Visit lgnd.com.</p><form><input type="email" name="email"><button>Enter</button></form>`), { title: "LGND Jacket Giveaway", listingGroup: "verified", rulesNote: "Checked by you.", status: "VERIFIED", verifiedBy: "user", addonVersion: "0.2.0", limits: [] }),
    row("https://dreamgiveaway.com/rules", page("Dream Giveaway Rules", `<p>NO PURCHASE, CONTRIBUTION, DONATION OR PAYMENT IS NECESSARY. A free entry method visit www.dreamgiveaway.com/rule.</p><a href="/dg/draw/213">213</a><a href="/dg/draw/214">214</a><a href="/dg/draw/215">215</a>`), { title: "Rules", addonVersion: "0.2.0", limits: [] }),
    row("https://dreamgiveaway.com/dg/draw/213", page("Dream Draw 213", `<section data-widget-frame="sweepwidget.com"><p>The sweepstakes ends on November 19, 2026.</p></section>`), { title: "Dream Draw 213", addonVersion: "0.2.0", limits: ["frame not read: https://sweepwidget.com/view/213"] }),
    row("https://dreamgiveaway.com/dg/draw/214", page("Dream Draw 214", `<section data-widget-frame="sweepwidget.com"><p>The sweepstakes ends on November 26, 2026.</p></section>`), { title: "Dream Draw 214", addonVersion: "0.2.0", limits: ["frame not read: https://sweepwidget.com/view/214"] }),
    row("https://dreamgiveaway.com/dg/terms-and-conditions/214", page("Dream 214 Terms", `<p>See https://dreamgiveaway.com/dg/draw/214. The sweepstakes ends on November 26, 2026.</p>`), { title: "Dream Draw 214 Terms", addonVersion: "0.2.0", limits: [] }),
    row("https://dreamgiveaway.com/dg/draw/215", page("Dream Draw 215", `<section data-widget-frame="sweepwidget.com"><p>The sweepstakes ends on December 3, 2026.</p></section>`), { title: "Dream Draw 215", addonVersion: "0.2.0", limits: ["frame not read: https://sweepwidget.com/view/215"] }),
    row("https://johnmalecki.com/pages/milwaukeegiveaway", fixture("malecki-entry.html"), { openRulesUrl: "https://johnmalecki.com/pages/giveaway-rules-regulations" }),
  ];
}

describe("reclassify batch", () => {
  it.skipIf(!PRIVATE_FIXTURES)("keeps each stored row's own facts and merges only its own rules", () => {
    const rows = reclassifyStoredChecks(batch());
    const byUrl = new Map(rows.map((record) => [record.url, record]));
    const lgnd = byUrl.get("https://lgnd.com/pages/lgnd-jacket-rules");
    expect(lgnd?.endIso).toBe("2026-11-22");
    expect(lgnd?.listingGroup).toBe("verified");
    expect(lgnd?.rulesNote).toBe("Checked by you.");
    expect(lgnd?.status).toBe("VERIFIED");

    const malecki = byUrl.get("https://johnmalecki.com/pages/milwaukeegiveaway");
    expect(malecki?.endIso).toBe("2026-11-21");
    expect(malecki?.rulesNote).toContain("Entry form not found (it may be inside a widget; reload the add-on and check again)");
    expect(byUrl.get("https://johnmalecki.com/pages/giveaway-rules-regulations")?.hidden).toBe(true);

    const howto = byUrl.get("https://johnmalecki.com/pages/how-to-enter");
    expect(howto?.endIso).toBe("2026-10-26");
    expect(howto?.rulesNote).toBe("Paid entries are not checked by the add-on.");

    const trucks = byUrl.get("https://www.americantrucks.com/at-sweepstakes.html");
    expect(trucks?.endIso).toBe("2026-11-18");
    expect(trucks?.rulesNote).toContain("2026 $6,000 Mystery Giveaway");
    expect(trucks?.rulesNote).not.toContain("Two rule sets");

    const wheels = byUrl.get("https://ram.hotwheelssweepstakes.com");
    expect(wheels?.endIso).toBe("2026-12-14");
    expect(wheels?.rulesNote).not.toContain("Donation drawing");
    expect(byUrl.get("https://ram.hotwheelssweepstakes.com/rules.aspx")?.hidden).toBe(true);

    expect(byUrl.get("https://dreamgiveaway.com/dg/draw/213")).toMatchObject({ endIso: "2026-11-19", rulesNote: "Donation drawing, free entry method in rules" });
    expect(byUrl.get("https://dreamgiveaway.com/dg/draw/214")).toMatchObject({ endIso: "2026-11-26", rulesNote: "Donation drawing, free entry method in rules" });
    expect(byUrl.get("https://dreamgiveaway.com/dg/draw/215")).toMatchObject({ endIso: "2026-12-03", rulesNote: "Donation drawing, free entry method in rules" });
    expect(byUrl.get("https://dreamgiveaway.com/dg/terms-and-conditions/214")?.hidden).toBe(true);
    expect(byUrl.get("https://dreamgiveaway.com/rules")?.hidden).toBe(true);

    const enter = byUrl.get("https://wintruck.nra.org/Enter");
    expect(enter?.endIso).toBe("2027-01-30");
    expect(enter?.rulesNote).toBe("Rules page is a viewer; open the PDF rules to confirm the mail method.");
    expect(enter?.rulesNote).not.toContain("Official rules not found");
    expect(enter?.rulesNote).not.toContain("Free entry is by mail");
    expect(enter?.hidden).not.toBe(true);
    expect(byUrl.get("https://wintruck.nra.org/OfficialRules?fs=True")?.hidden).toBe(true);

    const vance = rows.filter((record) => record.url.includes("vanceoutdoors.com"));
    expect(vance).toHaveLength(1);
    expect(vance[0]?.rulesNote).toBe("Official rules not found on this page. End date not stated.");
    expect(vance[0]?.endIso).toBeNull();

    const orlando = rows.filter((record) => record.url.includes("visitorlando.com"));
    expect(orlando).toHaveLength(1);
    expect(orlando[0]?.endIso).toBe("2027-01-18");
    expect(orlando[0]?.rulesNote).toBe("Rules found; entry form not found on the page you checked");
    expect(orlando[0]?.rulesNote).not.toBe("Not open in Idaho");
  });

  it("keeps the NRA received-by date when a folded row is reclassified again", () => {
    const below = `${"Sponsor copy. ".repeat(40)}`;
    const entryHtml = page(
      "NRA WIN THIS TRUCK SWEEPSTAKES",
      `<p>${"Page copy. ".repeat(700)}</p><footer><p>Void in MN, MT, WA and where prohibited by law. Entries must be received by 11:59 PM ET on 1/30/27. To enter online, complete the form.</p><p>${below}</p><p>Mail-in: Entries must be postmarked by 1/30/27 and received by 2/6/27 to be eligible. Fast Entry Prize Period 1 ends at 11:59 PM ET on 4/20/26.</p></footer><a href="https://trucksweepstakes.nra.org/OfficialRules?fs=True">Official Rules</a><form><input type="email" name="email"><button>Enter</button></form>`,
    );
    const shell = `<!doctype html><html><head><title>PDF viewer</title></head><body><section><p>${"toolbar ".repeat(40)}</p></section><section><p>${"toolbar ".repeat(40)}</p></section><footer><p>Entries must be received by 11:59 PM ET on 1/30/27.</p></footer></body></html>`;
    const enter = row("https://trucksweepstakes.nra.org/Enter", entryHtml, { title: "NRA WIN THIS TRUCK SWEEPSTAKES" });
    const rules = row("https://trucksweepstakes.nra.org/OfficialRules?fs=True", shell, { title: "Official Rules" });
    const once = reclassifyStoredChecks([enter, rules]);
    const saved = once.find((record) => record.url === "https://trucksweepstakes.nra.org/Enter");
    expect(saved?.endIso).toBe("2027-01-30");
    expect(saved?.endIso).not.toBe("2027-02-06");
    expect(saved?.endIso).not.toBe("2026-04-20");
    expect(saved?.rulesNote).toBe("Rules page is a viewer; open the PDF rules to confirm the mail method.");
    const shellRow = once.find((record) => record.url.includes("OfficialRules"));
    expect(shellRow?.hidden).toBe(true);
    expect(shellRow?.endIso).toBeNull();
    expect(shellRow?.rulesNote).toBe("Official rules not found on this page. End date not stated.");
    const again = reclassifyStoredChecks(once);
    const kept = again.find((record) => record.url === "https://trucksweepstakes.nra.org/Enter");
    expect(kept?.endIso).toBe("2027-01-30");
    expect(kept?.rulesNote).toBe("Rules page is a viewer; open the PDF rules to confirm the mail method.");
    expect(again.find((record) => record.url.includes("OfficialRules"))?.hidden).toBe(true);
  });

  it.skipIf(!PRIVATE_FIXTURES)("classifies the same urls in either order, and alone when the row does not fold", () => {
    const source = batch();
    const forward = reclassifyStoredChecks(source);
    const backward = reclassifyStoredChecks([...source].reverse());
    const forwardMap = new Map(forward.map((record) => [record.url, signature(record)]));
    const backwardMap = new Map(backward.map((record) => [record.url, signature(record)]));
    expect([...backwardMap.keys()].sort()).toEqual([...forwardMap.keys()].sort());
    for (const [url, fact] of forwardMap) expect(backwardMap.get(url)).toEqual(fact);

    const aloneUrls = [
      "https://lgnd.com/pages/lgnd-jacket-rules",
      "https://johnmalecki.com/pages/how-to-enter",
      "https://www.americantrucks.com/at-sweepstakes.html",
      "https://www.vanceoutdoors.com/ruger-sfar/",
      "https://www.visitorlando.com/win-a-trip/sweepstakes-rules/",
    ];
    for (const url of aloneUrls) {
      const original = source.find((record) => record.url === url);
      const alone = reclassifyStoredChecks(original ? [original] : []);
      expect(alone).toHaveLength(1);
      expect(signature(alone[0])).toEqual(forwardMap.get(alone[0].url));
    }
    expect(source.find((record) => record.url.includes("lgnd.com"))?.rulesNote).toBe("Checked by you.");
  });

  it.skipIf(!PRIVATE_FIXTURES)("reads SweepWidget dates and ignores the Gun Talk footer legal link", () => {
    const html = fixture("stored/guntalk-widget.html");
    const checked = classifyRenderedPage(html, "https://www.guntalk.com/win", new Date(NOW));
    expect(checked.endIso).toBe("2026-11-30");
    expect(checked.openRulesUrl).toBeNull();
    expect(checked.rulesNote).toBe("Rules are brief: dates only. Sponsor and eligibility not stated.");
    const stored = reclassifyStoredChecks([
      row("https://www.guntalk.com/win", html, {
        title: "Gun Talk November 2026 Giveaway | Gun Talk",
        addonVersion: "0.2.1",
        limits: [],
        openRulesUrl: "https://www.guntalk.com/legal",
      }),
    ]);
    expect(stored[0]?.endIso).toBe("2026-11-30");
    expect(stored[0]?.openRulesUrl).toBeNull();
    expect(stored[0]?.rulesNote).toBe("Rules are brief: dates only. Sponsor and eligibility not stated.");
  });

  it("builds the NRA viewer note and the Vance note in one place", () => {
    expect(missingFactsNote({
      endIso: "2027-01-30",
      hasEntry: true,
      rulesFound: false,
      rulesUrl: "https://wintruck.nra.org/Enter",
      pageUrl: "https://wintruck.nra.org/Enter",
      folded: true,
      shell: true,
    })).toBe("Rules page is a viewer; open the PDF rules to confirm the mail method.");
    expect(missingFactsNote({
      endIso: "2027-01-30",
      hasEntry: true,
      rulesFound: false,
      rulesUrl: null,
      folded: true,
    })).not.toMatch(/End date needs checking|Official rules not found/);
    expect(missingFactsNote({
      endIso: null,
      hasEntry: true,
      rulesFound: false,
      rulesUrl: "https://www.vanceoutdoors.com/ruger-sfar",
      pageUrl: "https://www.vanceoutdoors.com/ruger-sfar",
    })).toBe("Official rules not found on this page. End date not stated.");
    const nested = `<p>Entries must be received by 11:59 PM ET on 1/30/27.</p><section data-linked-rules="https://wintruck.nra.org/OfficialRules?fs=True"><section><p>${"toolbar ".repeat(200)}</p></section></section>`;
    const folded = classifyRenderedPage(page("Win This Truck", nested), "https://wintruck.nra.org/Enter", new Date(NOW));
    expect(folded.endIso).toBe("2027-01-30");
    expect(folded.rulesNote).toBe("Rules page is a viewer; open the PDF rules to confirm the mail method.");
    expect(folded.rulesNote).not.toContain("End date needs checking");
  });

  it("does not call distant shop text a purchase entry", () => {
    const html = page("LGND Jacket Giveaway", `<section data-widget-frame="sweepwidget.com"><p>Get 5X entries when you share.</p></section><p>Purchase a hat in the shop.</p><p>No purchase necessary. The sweepstakes ends on November 22, 2026. Sponsor: LGND. Visit lgnd.com.</p><form><input type="email" name="email"><button>Enter</button></form>`);
    const row = classifyRenderedPage(html, "https://lgnd.com/pages/lgnd-jacket-rules", new Date(NOW));
    expect(row.rulesNote).not.toContain("Purchase entries are paid");
    expect(row.endIso).toBe("2026-11-22");
  });
});
