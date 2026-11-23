import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

async function pillCenters(row: import("playwright").Locator) {
  return row.evaluate((node) => {
    const pill = node.querySelector("[data-entry-pill]");
    const compare = [...node.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Compare");
    if (!(pill instanceof HTMLElement) || !(compare instanceof HTMLElement)) return null;
    const pillBox = pill.getBoundingClientRect();
    const compareBox = compare.getBoundingClientRect();
    return { pill: pillBox.top + pillBox.height / 2, compare: compareBox.top + compareBox.height / 2 };
  });
}

describe("entry pill alignment", () => {
  it("keeps the entry pill on the same center line as Compare", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${scout.origin}/practice/entries`, { waitUntil: "networkidle" });
      const chair = page.locator("[data-entry-id=chair]");
      const chairCenters = await pillCenters(chair);
      expect(chairCenters).not.toBeNull();
      expect(Math.abs(chairCenters!.pill - chairCenters!.compare)).toBeLessThanOrEqual(1);
      const truck = page.locator("[data-entry-id=truck]");
      await truck.getByRole("button", { name: "Enter", exact: true }).click();
      await page.getByRole("button", { name: "I submitted on the sponsor page" }).click();
      await truck.getByRole("button", { name: "Paid", exact: true }).waitFor();
      const truckCenters = await pillCenters(truck);
      expect(truckCenters).not.toBeNull();
      expect(Math.abs(truckCenters!.pill - truckCenters!.compare)).toBeLessThanOrEqual(1);
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});