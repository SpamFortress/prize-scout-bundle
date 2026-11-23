import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

describe("practice home search", () => {
  it("stays centered for a blank query, then accumulates sample groups without dropping bookmarks", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${scout.origin}/practice`, { waitUntil: "networkidle" });
      await page.locator("[data-practice-home=initial]").waitFor();
      expect(await page.getByRole("banner").getByRole("link", { name: "Prize Scout", exact: true }).count()).toBe(0);
      expect(await page.getByRole("heading", { name: "Prize Scout", exact: true }).evaluate((node) => node.querySelector("a"))).toBeNull();
      expect(await page.getByRole("button", { name: "Add search", exact: true }).count()).toBe(0);
      expect(await page.locator("[data-entry-id]").count()).toBe(0);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByText("A blank search is not run.").waitFor();
      await page.locator("[data-practice-home=initial]").waitFor();

      await page.getByLabel("I want to win…").fill("chair");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.locator("[data-practice-home=results]").waitFor();
      await page.getByText("Search is paused right now").waitFor();
      expect(await page.locator("[data-entry-id]").count()).toBe(0);
      expect(await page.locator("[data-tip-footer]").count()).toBe(0);

      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await page.locator("[data-practice-home=results]").waitFor();
      await page.getByText("Search is paused right now").waitFor();
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});