import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

describe("practice navigation", () => {
  it("keeps the five tabs on sample pages", async () => {
    const scout = await startEphemeralScout();
    expect(scout.origin).not.toContain(":4342");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${scout.origin}/practice`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Prize Scout", exact: true }).waitFor();
      expect(await page.getByRole("button", { name: "Add search", exact: true }).count()).toBe(0);
      await page.getByLabel("I want to win…").fill("side table");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByText("Search is paused right now").waitFor();
      expect(await page.locator("[data-entry-id]").count()).toBe(0);
      const nav = page.getByRole("navigation", { name: "Primary" });
      expect(await nav.getByRole("link").allTextContents()).toEqual(["Home", "Saved", "Entries", "Profile", "About"]);
      await nav.getByRole("link", { name: "Saved", exact: true }).click();
      await page.getByPlaceholder("Search saved giveaways…").waitFor();
      await page.locator("[data-entry-id=demo-illustration-1]").waitFor();
      await nav.getByRole("link", { name: "Entries", exact: true }).click();
      await page.getByRole("heading", { name: "Entries", exact: true }).waitFor();
      expect(await page.locator("[data-entry-id=chair]").getByRole("checkbox").count()).toBe(0);
      expect(await page.locator("[data-entry-id=chair]").getByRole("button", { name: /Pin|Unpin/ }).count()).toBe(1);
      await page.locator("[data-entry-id=truck]").getByRole("button", { name: "Enter", exact: true }).click();
      await page.getByRole("button", { name: "I submitted on the sponsor page" }).click();
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "Paid", exact: true }).click();
      await page.locator("[data-entry-id=truck]").waitFor();
      expect(await page.locator("[data-entry-id=chair]").count()).toBe(0);
      await nav.getByRole("link", { name: "Profile", exact: true }).click();
      await page.getByRole("heading", { name: "Profile", exact: true }).waitFor();
      await page.getByText("Paid form filling, checkout, and purchase are never filled.").waitFor();
      await nav.getByRole("link", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: "Add search", exact: true }).waitFor();
      await page.getByText("Search is paused right now").waitFor();
      expect(page.url()).toContain("/practice");
      expect(page.url()).not.toContain("/practice/saved");
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});