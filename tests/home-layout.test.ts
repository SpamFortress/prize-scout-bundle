import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const home = readFileSync(path.join(process.cwd(), "src/components/search-home.tsx"), "utf8");
const header = readFileSync(path.join(process.cwd(), "src/components/site-header.tsx"), "utf8");
const afterMarker = "return (\n    <main className=\"pt-16 pb-16\">";
const initial = home.slice(home.indexOf("if (!submitted)"), home.indexOf(afterMarker));
const afterSearch = home.slice(home.indexOf(afterMarker));

describe("initial home layout", () => {
  it("shows only the name, placeholder, and search control before submit", () => {
    expect(initial).toContain("Prize Scout");
    expect(initial).toContain('placeholder="I want to win…"');
    expect(initial).toContain("pt-[36vh]");
    expect(initial).toContain("Search");
    for (const clutter of [
      "Start in Prize Scout chat",
      "Check an official page",
      "Save this search",
      "Relevance",
      "Ending soon",
      "Only pages that state this country",
      "Web search is not connected",
      "No official page has been checked",
      "Facebook and Instagram need an authenticated browser",
    ]) {
      expect(initial).not.toContain(clutter);
    }
  });

  it("keeps the same chat request, filters, and page check after search", () => {
    expect(home).toContain("buildChatAsk(query, sources, region)");
    expect(afterSearch).toContain("{ask}");
    expect(afterSearch).toContain("CHAT_URL");
    expect(afterSearch).toContain("CHAT_LINK_LABEL");
    expect(afterSearch).toContain("id=\"chat-ask\"");
    expect(home).toMatch(/\n\s+All\n/);
    expect(home).toContain("aria-label=\"Region bias\"");
    expect(afterSearch).toContain("{filters}");
    expect(home).toContain('aria-label="Official page URL"');
    expect(afterSearch).toContain("checkForm");
    expect(home).not.toContain("Save this search");
    expect(home).not.toContain("scout.saveSearch");
    expect(home).toContain('fetch("/api/evidence/check"');
    expect(home).toContain("onCheck");
    expect(afterSearch).toContain("checkForm");
  });

  it("shows Home immediately before Saved in the visible navigation", () => {
    const order = ["Home", "Saved", "Entries", "Profile", "About"];
    let cursor = 0;
    for (const label of order) {
      const at = header.indexOf(label, cursor);
      expect(at).toBeGreaterThan(cursor - 1);
      cursor = at + label.length;
    }
    expect(header.indexOf('["/", "Home"]')).toBeLessThan(header.indexOf('["/saved", "Saved"]'));
    expect(header).toContain("md:flex");
    expect(header).toContain("md:hidden");
    expect(header).not.toContain(">More<");
    expect(header).not.toContain("Preview");
    expect(header).toContain('"/practice"');
    expect(header).toContain('"/practice/saved"');
    expect(header).toContain('"/practice/entries"');
    expect(header).toContain('"/practice/profile"');
  });
});
