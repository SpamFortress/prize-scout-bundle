import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

describe("practice clear controls and audit polish", () => {
  it("confirms remove all and keeps the caption under the pill", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${scout.origin}/practice/entries`, { waitUntil: "networkidle" });
      const header = page.getByRole("banner");
      const headerColor = await header.evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(headerColor).toBe("rgb(255, 255, 255)");
      await page.locator("[data-entries-section=pinned]").getByRole("button", { name: "Reading chair drawing — illustration only", exact: true }).waitFor();
      expect(await page.getByRole("button", { name: "Unpin all", exact: true }).count()).toBe(0);

      await page.getByRole("link", { name: "Saved", exact: true }).click();
      await page.locator("[data-entry-id=demo-illustration-1]").waitFor();
      await page.getByRole("main").getByRole("button", { name: "Remove all", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.locator("[data-entry-id=demo-illustration-1]").waitFor();
      await page.getByRole("main").getByRole("button", { name: "Remove all", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Remove all", exact: true }).click();
      expect(await page.locator("[data-entry-id=demo-illustration-1]").count()).toBe(0);
      await page.getByText("Saved samples cleared").waitFor();

      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto(`${scout.origin}/practice/entries`, { waitUntil: "networkidle" });
      const chair = page.locator("[data-entry-id=chair]");
      const stacked = await chair.evaluate((node) => {
        const pill = node.querySelector("[data-entry-pill]");
        const caption = [...node.querySelectorAll("p")].find((item) => item.textContent?.includes("Prefill"));
        if (!(pill instanceof HTMLElement) || !(caption instanceof HTMLElement)) return null;
        const pillBox = pill.getBoundingClientRect();
        const captionBox = caption.getBoundingClientRect();
        return { pillBottom: pillBox.bottom, captionTop: captionBox.top, captionLeft: captionBox.left, pillLeft: pillBox.left, pillRight: pillBox.right };
      });
      expect(stacked).not.toBeNull();
      expect(stacked!.captionTop).toBeGreaterThanOrEqual(stacked!.pillBottom - 1);
      expect(stacked!.captionLeft).toBeGreaterThanOrEqual(stacked!.pillLeft - 8);
      expect(stacked!.captionLeft).toBeLessThan(stacked!.pillRight);

      const title = chair.locator("[data-hover-target=title]");
      await title.focus();
      const outline = await title.evaluate((node) => {
        const style = getComputedStyle(node);
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
      expect(outline.style).not.toBe("none");
      expect(parseFloat(outline.width)).toBeGreaterThan(0);
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});
