import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const PRIVATE_FIXTURES = existsSync(new URL("./fixtures/retest/vance-ruger.html", import.meta.url));
import { tmpdir } from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as checkPost } from "@/app/api/addon/check/route";
import { GET as tokenGet } from "@/app/api/addon/token/route";
import { classifyRenderedPage } from "@/server/addon-check";
import { getPairingToken, listAddonChecks, resetAddonChecksForTests, saveAddonCheck, setPairingTokenForTests } from "@/server/addon-pairing";

// The reader is a classic script so Chrome can inject it. Node loads that same file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reader = require("../extension/reader.js") as {
  readRenderedDocument: (doc: Document) => { html: string; limits: string[]; title: string };
};

const NOW = new Date("2026-11-16T12:00:00.000Z");
const EXTENSION = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function load(name: string, url: string): JSDOM {
  const html = readFileSync(new URL(`./fixtures/retest/${name}`, import.meta.url), "utf8");
  return new JSDOM(html, { url });
}

function paintEntryForm(dom: JSDOM): void {
  const host = dom.window.document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<form action="/enter"><label>Email<input type="email" name="email"></label><button type="submit">Enter</button></form>`;
  dom.window.document.body.appendChild(host);
  const hidden = dom.window.document.createElement("div");
  const closed = hidden.attachShadow({ mode: "closed" });
  closed.innerHTML = `<form id="closed-secret"><input name="email"></form>`;
  dom.window.document.body.appendChild(hidden);
  const frame = dom.window.document.createElement("iframe");
  Object.defineProperty(frame, "contentDocument", { get: () => null });
  dom.window.document.body.appendChild(frame);
}

const PAGES = [
  ["jetblue-cruise.html", "https://www.jetbluevacations.com/cruises"],
  ["carnival-bcsweeps.html", "https://www.carnival.com/Registration/Promotions/bcsweeps-2026"],
  ["ramsey-cash.html", "https://www.ramseysolutions.com/cash"],
  ["visitorlando-win-a-trip-live.html", "https://www.visitorlando.com/win-a-trip/"],
  ["johnmalecki-milwaukee.html", "https://johnmalecki.com/pages/milwaukeegiveaway"],
] as const;

describe("rendered tab reader", () => {
  it.skipIf(!PRIVATE_FIXTURES)("inlines an open shadow form and reports an unreadable iframe", () => {
    for (const [file, url] of PAGES) {
      const dom = load(file, url);
      paintEntryForm(dom);
      const read = reader.readRenderedDocument(dom.window.document);
      expect(read.html, file).toContain('data-open-shadow="true"');
      expect(read.html, file).toContain('type="email"');
      expect(read.html, file).not.toContain("closed-secret");
      expect(read.limits, file).toContain("cross-origin iframe skipped");
    }
  });

  it.skipIf(!PRIVATE_FIXTURES)("does not verify Gun Talk from the widget alone", () => {
    const dom = load("guntalk-november.html", "https://www.guntalk.com/win");
    const read = reader.readRenderedDocument(dom.window.document);
    const result = classifyRenderedPage(read.html, "https://www.guntalk.com/win", NOW, read.limits);
    expect(result.listingGroup).not.toBe("verified");
    expect(result.openRulesUrl ?? "").not.toContain("/legal");
    expect(result.openRulesUrl ?? result.rulesNote).toMatch(/https:\/\/|widget|not in the page HTML|needs a stated end date|Open the rules page|Official rules not found|Rules are brief/i);
  });
});

describe("rendered page gates", () => {
  it.skipIf(!PRIVATE_FIXTURES)("keeps the Visit Orlando rules page out of Verified and open to Idaho", () => {
    const html = readFileSync(new URL("./fixtures/retest/visitorlando-sweepstakes-rules.html", import.meta.url), "utf8");
    const row = classifyRenderedPage(html, "https://www.visitorlando.com/win-a-trip/sweepstakes-rules/", NOW);
    expect(row.checkedByYou).toBe(true);
    expect(row.listingGroup).toBe("check");
    expect(row.endIso).toBe("2027-01-18");
    expect(row.rulesNote).toBe("Rules found; entry form not found on the page you checked");
    expect(row.rulesNote).not.toBe("Not open in Idaho");
  });

  it("promotes a same-page form and asks before fetching another rules URL", () => {
    const onPage = `<!doctype html><html><head><title>Family Cruise</title></head><body><p>No purchase necessary. Official rules. Sponsored by JetBlue. Enter to win a cruise. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026.</p><form><input type="email" name="email"><button type="submit">Enter</button></form></body></html>`;
    const verified = classifyRenderedPage(onPage, "https://www.jetbluevacations.com/cruises", NOW);
    expect(verified.checkedByYou).toBe(true);
    expect(verified.listingGroup).toBe("verified");
    expect(verified.rulesNote).toBe("Checked by you.");
    const elsewhere = onPage.replace("</p>", '</p><a href="https://www.jetbluevacations.com/rules">Official Rules</a>');
    const ask = classifyRenderedPage(elsewhere, "https://www.jetbluevacations.com/cruises", NOW);
    expect(ask.listingGroup).not.toBe("verified");
    expect(ask.openRulesUrl).toBe("https://www.jetbluevacations.com/rules");
    expect(ask.checkedByYou).toBe(false);
  });
});

describe("checked rows survive a restart", () => {
  const previous = process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE;
  let dir = "";

  afterEach(() => {
    if (previous === undefined) delete process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE;
    else process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE = previous;
    resetAddonChecksForTests();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  function useTempFile(): string {
    dir = mkdtempSync(path.join(tmpdir(), "ps-addon-"));
    const file = path.join(dir, "addon-checks.json");
    process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE = file;
    resetAddonChecksForTests();
    return file;
  }

  it("loads data/addon-checks.json after the in-memory list is cleared", async () => {
    const file = useTempFile();
    saveAddonCheck({
      url: "https://ready.example/enter",
      title: "Ready Giveaway",
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: "Checked by you.",
      endIso: "2026-12-31",
      openRulesUrl: null,
      limits: [],
      checkedAt: "2026-11-16T12:00:00.000Z",
      html: "<!doctype html><html><head><title>Ready Giveaway</title></head><body><p>Ready</p></body></html>",
    });
    expect(readFileSync(file, "utf8")).toContain("https://ready.example/enter");
    resetAddonChecksForTests();
    process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE = file;
    const rows = await listAddonChecks();
    expect(rows.map((row) => row.url)).toEqual(["https://ready.example/enter"]);
    expect(rows[0]?.title).toBe("Ready Giveaway");
    expect(rows[0]?.html).toContain("Ready");
  });

  it("tolerates a missing or corrupt checks file", async () => {
    const file = useTempFile();
    rmSync(file, { force: true });
    expect(await listAddonChecks()).toEqual([]);
    resetAddonChecksForTests();
    process.env.PRIZE_SCOUT_ADDON_CHECKS_FILE = file;
    writeFileSync(file, "{not json");
    expect(await listAddonChecks()).toEqual([]);
  });

  it("asks for a fresh check when an old Idaho note has no page snapshot", async () => {
    const file = useTempFile();
    writeFileSync(file, JSON.stringify([{
      url: "https://www.visitorlando.com/win-a-trip/",
      title: "Win a Trip | Visit Orlando",
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: "Not open in Idaho",
      endIso: "2027-01-18",
      openRulesUrl: null,
      limits: [],
      checkedAt: "2026-11-16T12:00:00.000Z",
    }]));
    const rows = await listAddonChecks();
    expect(rows[0]?.rulesNote).toBe("Re-check needed (saved before the Idaho fix)");
    expect(rows[0]?.endIso).toBe("2027-01-18");
  });

  it.skipIf(!PRIVATE_FIXTURES)("re-applies the Idaho rule to a stored Visit Orlando check without fetching", async () => {
    const file = useTempFile();
    const html = readFileSync(new URL("./fixtures/retest/visitorlando-sweepstakes-rules.html", import.meta.url), "utf8");
    const url = "https://www.visitorlando.com/win-a-trip/sweepstakes-rules/";
    writeFileSync(file, JSON.stringify([{
      url,
      title: "Sweepstakes Rules | Visit Orlando",
      checkedByYou: true,
      listingGroup: "check",
      rulesNote: "Not open in Idaho",
      endIso: "2027-01-18",
      openRulesUrl: null,
      limits: [],
      checkedAt: "2026-11-16T12:00:00.000Z",
      html,
    }]));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const rows = await listAddonChecks();
      const row = rows.find((item) => item.url.includes("sweepstakes-rules"));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(row?.checkedByYou).toBe(true);
      expect(row?.listingGroup).toBe("check");
      expect(row?.endIso).toBe("2027-01-18");
      expect(row?.rulesNote).toBe("Rules found; entry form not found on the page you checked");
      expect(row?.rulesNote).not.toBe("Not open in Idaho");
      expect(row?.html).toContain("forty-eight (48) contiguous United States");
      expect(row?.html).toContain("Void in Alaska and Hawaii");
      expect(readFileSync(file, "utf8")).toContain("Not open in Idaho");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("add-on API", () => {
  it("rejects a website origin and a bad token", async () => {
    setPairingTokenForTests("pair-token");
    const site = await checkPost(new Request("http://127.0.0.1:4317/api/addon/check", {
      method: "POST",
      headers: { origin: "https://evil.example", authorization: "Bearer pair-token", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", html: "<html></html>" }),
    }));
    expect(site.status).toBe(403);
    const wrong = await checkPost(new Request("http://127.0.0.1:4317/api/addon/check", {
      method: "POST",
      headers: { origin: EXTENSION, authorization: "Bearer nope", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", html: "<html></html>" }),
    }));
    expect(wrong.status).toBe(401);
    const missing = await tokenGet(new Request("http://127.0.0.1:4317/api/addon/token", { headers: { origin: "https://evil.example" } }));
    expect(missing.status).toBe(403);
    const shown = await tokenGet(new Request("http://127.0.0.1:4317/api/addon/token", { headers: { origin: "http://127.0.0.1:4317" } }));
    expect(shown.status).toBe(200);
    const body = (await shown.json()) as { token: string };
    expect(body.token).toBe(getPairingToken());
  });
});
