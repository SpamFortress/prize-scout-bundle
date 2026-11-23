import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

function hydrationLines(logs: string[]): string[] {
  return logs.filter((line) => /hydrat|didn't match|did not match|server rendered/i.test(line));
}

describe("hydration console", () => {
  it("stays quiet on direct loads and on practice tab navigation", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const routes = ["/", "/practice", "/practice/saved", "/practice/entries", "/practice/profile", "/about"];
      for (const route of routes) {
        const page = await browser.newPage();
        const logs: string[] = [];
        page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
        page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));
        await page.goto(`${scout.origin}${route}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        expect(hydrationLines(logs), route).toEqual([]);
        await page.close();
      }
      const page = await browser.newPage();
      const logs: string[] = [];
      page.on("console", (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
      page.on("pageerror", (err) => logs.push(`pageerror: ${err.message}`));
      await page.goto(`${scout.origin}/practice`, { waitUntil: "networkidle" });
      await page.getByRole("link", { name: "Saved", exact: true }).click();
      await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
      await page.getByRole("link", { name: "Entries", exact: true }).click();
      await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
      expect(hydrationLines(logs)).toEqual([]);
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});