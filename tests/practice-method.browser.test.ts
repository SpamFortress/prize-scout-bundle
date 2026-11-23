import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

describe("practice method filter and header", () => {
  it("hides a saved paid-only row from Free and keeps a mixed row in both", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const logs: string[] = [];
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.on("console", (msg) => {
        if (msg.type() === "error" || msg.type() === "warning") logs.push(`${msg.type()}: ${msg.text()}`);
      });
      page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));
      await page.goto(`${scout.origin}/practice/entries`, { waitUntil: "networkidle" });
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "Paid", exact: true }).click();
      expect(await page.locator("[data-entry-id=truck]").count()).toBe(0);
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "Free", exact: true }).click();
      const truck = page.locator("[data-entry-id=truck]");
      await truck.getByRole("button", { name: "Enter", exact: true }).waitFor();
      await truck.locator("[data-method-badge=free]").waitFor();
      expect(await truck.locator("[data-method-badge=paid]").count()).toBe(0);
      await truck.getByRole("button", { name: "Enter", exact: true }).click();
      await page.getByRole("button", { name: "I submitted on the sponsor page" }).click();
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "Free", exact: true }).click();
      expect(await page.locator("[data-entry-id=truck]").count()).toBe(0);
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "Paid", exact: true }).click();
      const paidTruck = page.locator("[data-entry-id=truck]");
      await paidTruck.getByRole("button", { name: "Paid", exact: true }).waitFor();
      await paidTruck.getByText("Paid · Manual").waitFor();
      await paidTruck.locator("[data-method-badge=paid]").waitFor();
      expect(await paidTruck.locator("[data-method-badge=free]").count()).toBe(0);
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "All", exact: true }).click();
      await page.locator("[data-entry-id=chair]").locator("[data-method-badge=free]").waitFor();
      await page.getByRole("link", { name: "Saved", exact: true }).click();
      await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "Free", exact: true }).click();
      await page.locator("[data-entry-id=demo-illustration-1]").waitFor();
      await page.getByRole("group", { name: "Entry method" }).getByRole("button", { name: "Paid", exact: true }).click();
      expect(await page.locator("[data-entry-id=demo-illustration-1]").count()).toBe(0);

      await page.getByRole("link", { name: "About", exact: true }).click();
      await page.getByRole("heading", { name: "About", exact: true }).waitFor();
      const header = await page.getByRole("banner").boundingBox();
      const title = await page.getByRole("heading", { name: "About", exact: true }).boundingBox();
      expect(header && title && title.y >= header.y + header.height - 1).toBe(true);
      await page.setViewportSize({ width: 390, height: 800 });
      const narrowTitle = await page.getByRole("heading", { name: "About", exact: true }).boundingBox();
      const narrowHeader = await page.getByRole("banner").boundingBox();
      expect(narrowHeader && narrowTitle && narrowTitle.y >= narrowHeader.y + narrowHeader.height - 1).toBe(true);

      const overlay = await page.evaluate(() => {
        const portal = document.querySelector("nextjs-portal");
        const root = portal?.shadowRoot?.textContent ?? "";
        return root.replace(/\s+/g, " ").slice(0, 500);
      });
      const serious = logs.filter((line) => !/Download the React DevTools/i.test(line));
      expect(serious, `${serious.join("\n")}\n${overlay}`).toEqual([]);
      expect(overlay).not.toMatch(/Issue/);
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});