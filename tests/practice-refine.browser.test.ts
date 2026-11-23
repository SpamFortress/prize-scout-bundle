import { describe, expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

async function whitespaceBeside(page: Page, id: string): Promise<{ x: number; y: number } | null> {
  return page.locator(`[data-entry-id=${id}]`).evaluate((row) => {
    const title = row.querySelector("[data-hover-target=title]");
    if (!(title instanceof HTMLElement)) return null;
    const rect = title.getBoundingClientRect();
    for (let x = rect.right + 16; x < rect.right + 320; x += 12) {
      const y = rect.top + Math.min(8, Math.max(2, rect.height / 4));
      const el = document.elementFromPoint(x, y);
      if (!el || el.closest("[data-hover-target]") || el.closest("button, a")) continue;
      return { x, y };
    }
    return null;
  });
}

describe("practice hover and front link", () => {
  it("opens details from the title text, not from row whitespace or a scroll", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
      await page.goto(`${scout.origin}/practice/entries`, { waitUntil: "networkidle" });
      const title = page.locator("[data-entry-id=chair] [data-hover-target=title]");
      await title.scrollIntoViewIfNeeded();
      await title.hover();
      await page.waitForTimeout(1100);
      await page.getByRole("heading", { name: "The prize", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("heading", { name: "The prize", exact: true }).waitFor({ state: "hidden" });
      expect(await page.getByRole("button", { name: "Details", exact: true }).count()).toBe(0);
      expect(await page.locator("[data-entry-id=chair]").getByRole("button", { name: /Pin|Unpin/ }).count()).toBe(1);
      expect(await page.getByRole("banner").getByRole("link", { name: "Prize Scout", exact: true }).count()).toBe(1);

      const gap = await whitespaceBeside(page, "chair");
      expect(gap).not.toBeNull();
      await page.mouse.move(gap!.x, gap!.y);
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(1200);
      expect(await page.getByRole("heading", { name: "The prize", exact: true }).count()).toBe(0);

      await title.scrollIntoViewIfNeeded();
      await title.hover();
      await page.mouse.wheel(0, 280);
      await page.waitForTimeout(1200);
      expect(await page.getByRole("heading", { name: "The prize", exact: true }).count()).toBe(0);

      const beside = await page.locator("[data-entry-id=chair] [data-hover-target=title]").evaluate((node) => {
        const style = getComputedStyle(node);
        const rects = [...node.getClientRects()];
        const widest = Math.max(...rects.map((rect) => rect.right));
        const shorter = rects.find((rect) => rect.right < widest - 8);
        return {
          display: style.display,
          paddingRight: style.paddingRight,
          x: shorter ? shorter.right + 8 : 0,
          y: shorter ? shorter.top + shorter.height / 2 : 0,
          wrapped: rects.length > 1,
          hasShorterLine: Boolean(shorter),
        };
      });
      expect(beside.display).toBe("inline");
      expect(beside.paddingRight).toBe("0px");
      expect(beside.wrapped).toBe(true);
      expect(beside.hasShorterLine).toBe(true);
      await page.mouse.move(beside.x, beside.y);
      const hitTitle = await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit?.closest("[data-hover-target=title]"));
      }, beside);
      expect(hitTitle).toBe(false);
      await page.waitForTimeout(1200);
      expect(await page.getByRole("heading", { name: "The prize", exact: true }).count()).toBe(0);
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);

  it("keeps sample requests when the brand opens the front screen, and searches only the current tab", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${scout.origin}/practice`, { waitUntil: "networkidle" });
      await page.getByLabel("I want to win…").fill("chair");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByText("Search is paused right now").waitFor();
      await page.getByRole("banner").getByRole("link", { name: "Prize Scout", exact: true }).click();
      await page.locator("[data-practice-home=initial]").waitFor();
      expect(await page.locator("[data-entry-id]").count()).toBe(0);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByText("A blank search is not run.").waitFor();
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await page.getByText("Search is paused right now").waitFor();

      await page.getByRole("link", { name: "Saved", exact: true }).click();
      await page.getByPlaceholder("Search saved giveaways…").waitFor();
      expect(await page.getByText("Search saved giveaways", { exact: true }).count()).toBe(0);
      expect(await page.locator("[data-entry-count]").count()).toBe(0);
      expect(await page.getByRole("button", { name: /Pin|Unpin/ }).count()).toBeGreaterThan(0);
      await page.getByPlaceholder("Search saved giveaways…").fill("truck");
      expect(await page.locator("[data-entry-id=demo-illustration-1]").count()).toBe(0);
      await page.getByPlaceholder("Search saved giveaways…").fill("furniture");
      await page.locator("[data-entry-id=demo-illustration-1]").waitFor();

      await page.getByRole("link", { name: "Entries", exact: true }).click();
      await page.getByPlaceholder("Search your entries…").waitFor();
      expect(await page.getByText("Search your entries", { exact: true }).count()).toBe(0);
      await page.locator("[data-entry-count=truck]").waitFor();
      await page.getByPlaceholder("Search your entries…").fill("side table");
      expect(await page.locator("[data-entry-id=demo-illustration-4]").count()).toBe(0);
      await page.getByPlaceholder("Search your entries…").fill("truck");
      await page.locator("[data-entry-id=truck]").waitFor();
      expect(await page.locator("[data-entry-id=chair]").count()).toBe(0);

      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await page.getByRole("banner").getByRole("link", { name: "Prize Scout", exact: true }).click();
      await page.locator("[data-practice-home=initial]").waitFor();
      expect(await page.getByRole("navigation", { name: "Primary" }).getByRole("link").allTextContents()).toEqual(["Home", "Saved", "Entries", "Profile", "About"]);
      await page.getByRole("link", { name: "About", exact: true }).click();
      await page.getByRole("heading", { name: "About", exact: true }).waitFor();
      await page.getByRole("banner").getByRole("link", { name: "Prize Scout", exact: true }).click();
      await page.locator("[data-practice-home=initial]").waitFor();
      await page.getByRole("link", { name: "Home", exact: true }).click();
      await page.getByText("Search is paused right now").waitFor();
      expect(await page.locator("[data-entry-id]").count()).toBe(0);
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);

  it("pages the illustration viewer and leaves details open", async () => {
    const scout = await startEphemeralScout();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${scout.origin}/practice/entries`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Enlarge illustration for Reading chair drawing — illustration only" }).click();
      const viewer = page.getByRole("dialog", { name: "Illustration viewer" });
      await viewer.waitFor();
      await page.getByText("1 of 3").waitFor();
      await page.getByRole("button", { name: "Next image", exact: true }).click();
      await page.getByText("2 of 3").waitFor();
      await page.keyboard.press("ArrowRight");
      await page.getByText("3 of 3").waitFor();
      await page.keyboard.press("ArrowLeft");
      await page.getByText("2 of 3").waitFor();
      await page.locator("[data-lightbox=open]").click({ position: { x: 8, y: 8 } });
      await viewer.waitFor({ state: "hidden" });

      await page.locator("[data-entry-id=chair] [data-hover-target=title]").click();
      await page.getByRole("heading", { name: "The prize", exact: true }).waitFor();
      await page.getByRole("button", { name: "Enlarge Square illustration", exact: true }).click();
      await page.getByText("2 of 3").waitFor();
      await page.getByRole("button", { name: "Next image", exact: true }).click();
      await page.getByText("3 of 3").waitFor();
      await page.keyboard.press("Escape");
      await viewer.waitFor({ state: "hidden" });
      await page.getByRole("heading", { name: "The prize", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("heading", { name: "The prize", exact: true }).waitFor({ state: "hidden" });
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});