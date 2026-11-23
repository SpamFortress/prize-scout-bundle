import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

describe("sample profile preview", () => {
  it("shows masked sample fields, an unpaired connection, and one receipt", async () => {
    const scout = await startEphemeralScout();
    expect(scout.origin).not.toContain(":4342");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
      await page.goto(`${scout.origin}/design-preview`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Open sample Profile" }).click();
      await page.getByText("DESIGN PREVIEW — sample Profile.").waitFor();
      const entry = page.locator("[data-profile-section=entry]");
      await entry.getByText("Paid form filling, checkout, and purchase are never filled.").waitFor();
      await entry.getByText("(•••) •••-0199").waitFor();
      await entry.getByRole("button", { name: "Reveal sample value" }).nth(1).click();
      await entry.locator('input[value="(555) 010-0199"]').waitFor();

      const email = page.locator("[data-profile-section=email]");
      await email.getByText("Not connected · Unpaired").waitFor();
      await email.getByRole("button", { name: /Email & Fortress/ }).click();
      await email.getByRole("button", { name: "Connect", exact: true }).click();
      await email.getByText("Preview only—no connection made.").waitFor();
      expect(await email.getByText("Connected", { exact: true }).count()).toBe(0);

      const receipts = page.locator("[data-profile-section=receipts]");
      await receipts.getByRole("button", { name: /Receipts/ }).click();
      await receipts.getByRole("button", { name: /Sample Market/ }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByText("Prize Scout sample receipt").waitFor();
      await dialog.getByText("Not fetched from a mailbox.").waitFor();
      await dialog.getByRole("button", { name: "Record this receipt again" }).click();
      await page.getByText("The spend stays $24. It was not counted twice.").waitFor();
      expect(await receipts.locator("ul button", { hasText: "Sample Market" }).count()).toBe(1);
      await dialog.getByLabel("Associated giveaway").selectOption({ label: "Oak table drawing — illustration only — not saved, not entered" });
      await dialog.getByText("Associated giveaway: Oak table drawing — illustration only").waitFor();
      await page.getByRole("button", { name: "Close receipt" }).click();

      await page.setViewportSize({ width: 390, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});