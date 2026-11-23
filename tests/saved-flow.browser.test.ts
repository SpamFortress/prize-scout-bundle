import { mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import { observeHtml } from "@/domain/interpret";
import { startEphemeralScout } from "./ephemeral-server";

/** Screenshots are optional. Set SCOUT_ARTIFACT_DIR to a writable directory to save them. */
async function saveShot(page: Page, filename: string) {
  const dir = process.env.SCOUT_ARTIFACT_DIR?.trim();
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, filename) });
}

const NOW = new Date("2026-11-06T12:00:00Z");

const READY_HTML = `<!doctype html><html><head>
<title>Northwind Camera Giveaway</title>
<meta name="description" content="Enter the Northwind camera drawing. Official rules apply.">
<meta property="og:site_name" content="Northwind">
</head><body>
<p>No purchase necessary. Open to legal residents of the United States. Must be 18 years or older. Ends December 31, 2026. Approximate retail value of $500. One entry per person.</p>
<a href="https://example.com/official-rules">Official Rules</a>
<form action="https://example.com/enter"><input type="email" name="email"><button type="submit">Enter</button></form>
</body></html>`;

async function control(page: Page, name: string) {
  const box = page.getByRole("checkbox", { name, exact: true });
  await box.waitFor({ state: "visible", timeout: 8000 });
  const info = await box.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hidden = el.nextElementSibling;
    const hiddenRect = hidden instanceof HTMLElement ? hidden.getBoundingClientRect() : null;
    return {
      tag: el.tagName,
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
      hiddenTag: hidden?.tagName ?? "",
      hiddenType: hidden?.getAttribute("type") ?? "",
      hiddenAria: hidden?.getAttribute("aria-hidden") ?? "",
      hiddenWidth: hiddenRect?.width ?? -1,
      hiddenPointer: hidden instanceof HTMLElement ? getComputedStyle(hidden).pointerEvents : "",
    };
  });
  expect(info.tag).toBe("SPAN");
  expect(info.role).toBe("checkbox");
  expect(info.ariaLabel).toBe(name);
  expect(info.width).toBeGreaterThanOrEqual(14);
  expect(info.height).toBeGreaterThanOrEqual(14);
  expect(info.hiddenTag).toBe("INPUT");
  expect(info.hiddenType).toBe("checkbox");
  expect(info.hiddenAria).toBe("true");
  expect(info.hiddenWidth).toBeLessThanOrEqual(1);
  expect(info.hiddenPointer).toBe("none");
  return { box, info };
}

async function outsideThumb(page: Page, title: string) {
  const row = page.locator("article").filter({ hasText: title });
  const { box, info } = await control(page, `Save contest ${title}`);
  const thumb = await row.locator("[data-result-thumb]").boundingBox();
  const bounds = await box.boundingBox();
  expect(thumb).not.toBeNull();
  expect(bounds).not.toBeNull();
  if (!thumb || !bounds) return;
  expect(bounds.width).toBeGreaterThanOrEqual(14);
  expect(thumb.x - (bounds.x + bounds.width)).toBeGreaterThanOrEqual(4);
  expect(Math.abs(bounds.y + bounds.height / 2 - (thumb.y + thumb.height / 2))).toBeLessThanOrEqual(8);
  const overlapsThumb = info.x < thumb.x + thumb.width && info.x + info.width > thumb.x && info.y < thumb.y + thumb.height && info.y + info.height > thumb.y;
  expect(overlapsThumb).toBe(false);
}

async function openHref(page: Page, href: string) {
  const visible = page.locator(`a[href="${href}"]`).filter({ visible: true });
  if ((await visible.count()) === 0) {
    await page.locator("summary").filter({ hasText: "Menu" }).click();
  }
  await page.locator(`a[href="${href}"]`).filter({ visible: true }).click();
}

describe("saved checkbox in the browser", () => {
  it("checks a fixture official page into Saved and unchecks it on desktop and mobile", async () => {
    const scout = await startEphemeralScout();
    const base = scout.origin;
    expect(base).not.toContain(":4342");
    const observed = observeHtml(READY_HTML, "https://example.com/enter", NOW);
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    const contest = observed.contest;
    const proof = {
      id: "proof-fixture",
      contestId: contest.id,
      checkedAt: NOW.toISOString(),
      officialUrl: "https://example.com/enter",
      httpStatus: 200,
      rulesLinkFound: Boolean(contest.rulesUrl),
      formFound: contest.formChecked,
      hubOnly: false,
      ready: contest.readiness === "form_checked",
      notes: ["Fixture HTML checked in the browser test. Nothing was submitted."],
    };

    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const preview = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await preview.goto(`${base}/design-preview`, { waitUntil: "networkidle" });
      await preview.getByRole("button", { name: "Open sample Saved" }).click();
      await preview.getByText("DESIGN PREVIEW — sample Saved. Not your Saved tab.").waitFor();
      expect(await preview.getByRole("heading", { name: "Saved searches" }).count()).toBe(0);
      const xLink = preview.locator("a[data-result-url='https://x.com/prize-scout-sample/status/illustration-2']");
      await xLink.waitFor();
      expect(await xLink.getAttribute("href")).toBe("https://x.com/prize-scout-sample/status/illustration-2");
      expect(await xLink.getAttribute("target")).toBe("_blank");
      const webLink = preview.locator("a[data-result-url='https://example.com/demo-illustration-1']");
      expect(await webLink.getAttribute("href")).toBe("https://example.com/demo-illustration-1");
      await preview.evaluate(() => window.scrollTo(0, 0));
      await preview.emulateMedia({ colorScheme: "light" });
      const enter = preview.getByRole("button", { name: "Enter", exact: true }).first();
      const lightStyle = await enter.evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, color: style.color };
      });
      await saveShot(preview, "prize-scout-enter-light.png");
      await saveShot(preview, "prize-scout-enter-default.png");
      await preview.emulateMedia({ colorScheme: "dark" });
      const darkStyle = await enter.evaluate((el) => {
        const style = getComputedStyle(el);
        return { background: style.backgroundColor, color: style.color };
      });
      expect(lightStyle.background).not.toBe(darkStyle.background);
      expect(lightStyle.color).not.toBe(darkStyle.color);
      await saveShot(preview, "prize-scout-enter-dark.png");
      await preview.emulateMedia({ colorScheme: "light" });

      const furniture = preview.getByRole("button", { name: "Furniture collection — illustration only", exact: true });
      await furniture.hover();
      await preview.waitForTimeout(700);
      expect(await preview.locator("[data-detail-popup='open']").count()).toBe(0);
      await preview.waitForTimeout(1600);
      await preview.getByRole("dialog", { name: "Details for Furniture collection — illustration only" }).waitFor();
      await preview.getByText("Sample only. This text is illustration copy, not observed on an official page.").waitFor();
      await preview.getByText("Entry limit: Once daily").waitFor();
      await preview.getByText("Eligibility: US residents, 21+; excludes NY").waitFor();
      await preview.getByRole("heading", { name: "The prize", exact: true }).waitFor();
      await preview.getByText("white oak dining table").waitFor();
      const popup = preview.locator("[data-detail-popup='open']");
      const body = popup.locator("[data-detail-body]");
      const scrollable = await body.evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(scrollable).toBe(true);
      expect(await popup.innerText()).not.toContain("01/26/2027");
      expect(await popup.innerText()).not.toContain("16 days left");
      const rules = popup.getByRole("link", { name: "Official rules" });
      expect(await rules.getAttribute("href")).toBe("https://example.com/sample-rules");
      const pinBefore = await popup.locator("[data-detail-pin]").boundingBox();
      await body.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await preview.getByText("Complete the form and confirm your email.").waitFor();
      const pinAfter = await popup.locator("[data-detail-pin]").boundingBox();
      expect(pinAfter?.y).toBe(pinBefore?.y);
      await body.evaluate((el) => {
        el.scrollTop = 0;
      });
      await preview.evaluate(() => window.scrollTo(0, 0));
      await saveShot(preview, "prize-scout-title-details.png");
      await saveShot(preview, "prize-scout-prize-description.png");
      await preview.keyboard.press("Escape");
      expect(await preview.locator("[data-detail-popup='open']").count()).toBe(0);

      const lamp = preview.getByRole("button", { name: "Desk lamp drawing — illustration only", exact: true });
      await lamp.focus();
      await preview.getByRole("dialog", { name: "Details for Desk lamp drawing — illustration only" }).waitFor({ timeout: 500 });
      await preview.keyboard.press("Escape");
      await preview.getByRole("button", { name: "Details" }).nth(2).click();
      await preview.getByRole("dialog", { name: "Details for Bookshelf set — illustration only" }).waitFor({ timeout: 500 });
      await preview.getByRole("button", { name: "Close details" }).click();

      await preview.getByRole("button", { name: "Enlarge illustration for Furniture collection — illustration only" }).click();
      await preview.getByRole("heading", { name: "Illustration only" }).waitFor();
      await preview.getByText("Illustration only. Not a prize photo.").waitFor();
      await preview.getByRole("button", { name: "Next image" }).click();
      await preview.getByText("2 of 3").waitFor();
      await preview.keyboard.press("ArrowRight");
      await preview.getByText("3 of 3").waitFor();
      await preview.getByRole("button", { name: "Show image 1 of 3" }).click();
      await preview.getByText("1 of 3").waitFor();
      await preview.evaluate(() => window.scrollTo(0, 0));
      await saveShot(preview, "prize-scout-image-enlarged.png");
      await saveShot(preview, "prize-scout-gallery.png");
      await preview.setViewportSize({ width: 390, height: 800 });
      await preview.getByRole("button", { name: "Next image" }).waitFor();
      await preview.setViewportSize({ width: 1280, height: 900 });
      expect(await preview.locator("[data-image-open='open']").count()).toBe(1);
      await preview.keyboard.press("Escape");
      expect(await preview.locator("[data-image-open='open']").count()).toBe(0);
      await preview.getByRole("button", { name: "Enlarge illustration for Desk lamp drawing — illustration only" }).click();
      await preview.getByRole("button", { name: "Close image" }).click();
      expect(await preview.locator("[data-image-open='open']").count()).toBe(0);

      await preview.getByRole("button", { name: "Enter", exact: true }).first().click();
      await preview.getByText("Sample only. No entry or autofill occurred.").waitFor();
      await preview.getByRole("button", { name: "Back to sample results" }).click();
      await preview.getByRole("button", { name: "Sample requests" }).click();
      await preview.getByRole("heading", { name: "Results for ‘guns’" }).waitFor();
      await preview.getByText("No actual search was performed by this preview.").waitFor();
      expect(await preview.getByRole("heading", { name: "Saved searches" }).count()).toBe(0);
      await preview.close();

      const requests = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await requests.goto(base, { waitUntil: "networkidle" });
      await requests.getByLabel("I want to win…").fill("guns");
      await requests.getByRole("button", { name: "Search", exact: true }).click();
      await requests.getByRole("heading", { name: "Results for ‘guns’" }).waitFor();
      await requests.getByRole("button", { name: "Add search" }).click();
      expect(await requests.getByLabel("I want to win…").inputValue()).toBe("");
      await requests.getByRole("heading", { name: "Results for ‘guns’" }).waitFor();
      await requests.getByLabel("I want to win…").fill("vehicles");
      expect(await requests.getByRole("heading", { name: "Results for ‘vehicles’" }).count()).toBe(0);
      expect(await requests.getByText("Prize Scout did not invent contests.").count()).toBeGreaterThan(0);
      await requests.close();

      const owned = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await owned.route("**/api/evidence/check", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            message: "Official-page test fixture—not a web result.",
            contest,
            proof,
            submitted: false,
          }),
        });
      });
      await owned.goto(`${base}/?run=1`, { waitUntil: "networkidle" });
      await owned.getByLabel("Official page URL").fill("https://example.com/enter");
      await owned.getByRole("button", { name: "Check page" }).click();
      const ungrouped = owned.locator("[data-checked-ungrouped]");
      await ungrouped.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await owned.getByLabel("I want to win…").fill("official-page fixture");
      await owned.getByRole("button", { name: "Search", exact: true }).click();
      const firstGroup = owned.locator("[data-search-request='official-page fixture']");
      await firstGroup.waitFor();
      expect(await firstGroup.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).count()).toBe(0);
      await ungrouped.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await owned.getByLabel("Official page URL").fill("https://example.com/enter");
      await owned.getByRole("button", { name: "Check page" }).click();
      await firstGroup.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await owned.getByText("Official-page test fixture—not a web result.").waitFor();
      await firstGroup.getByRole("checkbox", { name: "Save contest Northwind Camera Giveaway" }).click();
      await owned.getByRole("button", { name: "Add search" }).click();
      expect(await owned.getByLabel("I want to win…").inputValue()).toBe("");
      expect(await owned.getByRole("heading", { name: "New search" }).count()).toBe(0);
      await firstGroup.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await ungrouped.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await owned.evaluate(() => window.scrollTo(0, 0));
      await saveShot(owned, "prize-scout-multi-search.png");
      await owned.getByLabel("I want to win…").fill("second fixture request");
      expect(await owned.getByRole("heading", { name: "Results for ‘second fixture request’" }).count()).toBe(0);
      await owned.getByRole("button", { name: "Search", exact: true }).click();
      const secondGroup = owned.locator("[data-search-request='second fixture request']");
      await secondGroup.waitFor();
      expect(await secondGroup.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).count()).toBe(0);
      await owned.getByLabel("Official page URL").fill("https://example.com/enter");
      await owned.getByRole("button", { name: "Check page" }).click();
      await firstGroup.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await secondGroup.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await ungrouped.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
      await owned.getByRole("link", { name: "Saved", exact: true }).click();
      await owned.getByRole("heading", { name: "Saved", exact: true }).waitFor();
      expect(await owned.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).count()).toBe(1);
      await owned.getByRole("link", { name: "Entries", exact: true }).click();
      await owned.getByText("No local entries in this tab.").waitFor();
      await owned.close();

      const empty = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await empty.goto(`${base}/saved`, { waitUntil: "networkidle" });
      await empty.getByText("No saved contests in this tab.").waitFor();
      expect(await empty.getByRole("heading", { name: "Saved searches" }).count()).toBe(0);
      expect(await empty.getByText("Save this search").count()).toBe(0);
      await saveShot(empty, "prize-scout-saved-list.png");
      await empty.close();

      for (const width of [1280, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await page.route("**/api/evidence/check", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              message: "Fetched the page. A form and official rules were observed. Nothing was submitted.",
              contest,
              proof,
              submitted: false,
            }),
          });
        });
        await page.goto(`${base}/?run=1`, { waitUntil: "networkidle" });
        expect(await page.getByRole("button", { name: "Save this search" }).count()).toBe(0);
        for (const name of ["All", "Web", "X", "Facebook", "Instagram", "Only pages that state this country", "Save all visible contests"]) {
          await control(page, name);
        }
        const web = page.getByRole("checkbox", { name: "Web", exact: true });
        expect(await web.getAttribute("aria-checked")).toBe("true");
        await page.getByText("Web", { exact: true }).click();
        expect(await web.getAttribute("aria-checked")).toBe("false");
        await page.getByText("Web", { exact: true }).click();
        expect(await web.getAttribute("aria-checked")).toBe("true");

        await page.getByLabel("Official page URL").fill("https://example.com/enter");
        await page.getByRole("button", { name: "Check page" }).click();
        await page.getByRole("button", { name: "Northwind Camera Giveaway" }).waitFor();
        await outsideThumb(page, "Northwind Camera Giveaway");
        const saveBox = page.getByRole("checkbox", { name: "Save contest Northwind Camera Giveaway", exact: true });
        await saveBox.click();
        expect(await saveBox.getAttribute("aria-checked")).toBe("true");
        await page.getByText("Saved in this tab. This is not an entry.").waitFor();

        await openHref(page, "/saved");
        await page.getByRole("heading", { name: "Saved", exact: true }).waitFor();
        await page.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
        await outsideThumb(page, "Northwind Camera Giveaway");
        expect(await page.getByRole("checkbox", { name: "Save contest Northwind Camera Giveaway", exact: true }).getAttribute("aria-checked")).toBe("true");

        await openHref(page, "/entries");
        await page.getByText("No local entries in this tab.").waitFor();
        expect(await page.getByText("Northwind Camera Giveaway").count()).toBe(0);

        await page.goBack();
        await page.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
        await page.getByRole("checkbox", { name: "Save contest Northwind Camera Giveaway", exact: true }).click();
        await page.getByText("No saved contests in this tab.").waitFor();
        expect(await page.getByText("Northwind Camera Giveaway").count()).toBe(0);
        await page.getByText("Removed from Saved. Entries were not changed.").waitFor();

        await page.goto(`${base}/?run=1`, { waitUntil: "networkidle" });
        await page.getByLabel("Official page URL").fill("https://example.com/enter");
        await page.getByRole("button", { name: "Check page" }).click();
        await page.getByRole("button", { name: "Northwind Camera Giveaway" }).waitFor();
        await page.getByRole("checkbox", { name: "Save contest Northwind Camera Giveaway", exact: true }).click();
        await openHref(page, "/saved");
        await page.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
        const official = page.locator("a[data-result-url='https://example.com/enter']");
        expect(await official.getAttribute("href")).toBe("https://example.com/enter");
        expect(await official.getAttribute("target")).toBe("_blank");
        await page.getByRole("button", { name: "Enter", exact: true }).click();
        await page.getByText("Nothing was submitted.").waitFor();
        await openHref(page, "/entries");
        await page.getByText("No local entries in this tab.").waitFor();
        expect(await page.getByText("Northwind Camera Giveaway").count()).toBe(0);
        await openHref(page, "/saved");
        await page.getByRole("button", { name: "Northwind Camera Giveaway", exact: true }).waitFor();
        expect(await page.getByRole("checkbox", { name: "Save contest Northwind Camera Giveaway", exact: true }).getAttribute("aria-checked")).toBe("true");
        await page.close();
      }
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 180_000);
});
