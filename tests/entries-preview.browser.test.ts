import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

describe("sample entries preview", () => {
  it("pins, refuses a real submit, and opens sample details", async () => {
    const scout = await startEphemeralScout();
    expect(scout.origin).not.toContain(":4342");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
      await page.goto(`${scout.origin}/design-preview`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Open sample Entries" }).click();
      await page.getByText("DESIGN PREVIEW — sample Entries.").waitFor();
      const pinned = page.locator("[data-entries-section=pinned]");
      await pinned.getByRole("button", { name: "Reading chair drawing — illustration only", exact: true }).waitFor();
      const chairCount = page.locator("[data-entry-count=chair]");
      const before = await chairCount.innerText();
      expect(before).toContain("2");
      expect(before).toContain("Confirmed");
      expect(before).not.toContain("Spend");
      const lampCount = await page.locator("[data-entry-count=lamp]").innerText();
      expect(lampCount).toContain("About 6");
      expect(lampCount).toContain("Estimated");
      expect(lampCount).not.toContain("Spend");
      expect(await page.locator("[data-entry-count=truck]").innerText()).toContain("$24");
      expect(await page.locator("[data-entry-id=oak]").getByRole("button", { name: "Enter", exact: true }).count()).toBe(0);
      expect(await page.getByRole("button", { name: "* If I win: taxes & delivery", exact: true }).count()).toBe(4);
      const counts = await page.locator("[data-entry-count]").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
      expect(counts).toHaveLength(4);
      for (const box of counts) {
        expect(Math.abs(box.x - counts[0].x)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.right - counts[0].right)).toBeLessThanOrEqual(1);
      }
      const dates = await page.locator("[data-entry-date]").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
      expect(dates).toHaveLength(4);
      for (const box of dates) {
        expect(Math.abs(box.right - dates[0].right)).toBeLessThanOrEqual(1);
      }
      expect(await pinned.evaluate((node) => getComputedStyle(node).position)).toBe("static");

      await page.getByRole("button", { name: "Unpin Reading chair drawing — illustration only", exact: true }).click();
      expect(await page.locator("[data-entries-section=pinned]").count()).toBe(0);
      await page.locator("[data-entries-section=other]").getByRole("button", { name: "Reading chair drawing — illustration only", exact: true }).waitFor();
      await page.getByRole("button", { name: "Pin Oak table drawing — illustration only", exact: true }).click();
      await pinned.getByRole("button", { name: "Oak table drawing — illustration only", exact: true }).waitFor();

      await page.locator("[data-entry-id=chair]").getByRole("button", { name: "Enter", exact: true }).click();
      const prefill = page.getByRole("dialog");
      await prefill.getByText("Filling out your entry…").waitFor();
      expect(await prefill.getByRole("radio", { name: "Dedicated contest address" }).isChecked()).toBe(true);
      expect(await prefill.locator("[data-personal-email-warning]").count()).toBe(0);
      await prefill.getByRole("radio", { name: "Personal email" }).check();
      await prefill.getByText("Sweepstakes lists are often sold. Personal email is not the default.").waitFor();
      await prefill.getByRole("radio", { name: "Fortress alias" }).check();
      await prefill.getByLabel("Alias for this entry").fill("ada@gmail.com");
      await prefill.locator("[data-tagged-email]").getByText(/\+/).waitFor();
      const tagged = await prefill.locator("[data-tagged-email]").innerText();
      expect(tagged).toContain("ada+");
      expect(tagged).toContain("@gmail.com");
      expect(await prefill.locator("[data-prefill-bookmarklet]").getAttribute("href")).toContain(tagged.replace("This sponsor: ", ""));
      await prefill.getByRole("checkbox", { name: "This form rejects plus addresses" }).check();
      await prefill.getByText("This form rejects plus addresses, so the untagged address is used.").waitFor();
      expect(await prefill.locator("[data-tagged-email]").innerText()).toContain("ada@gmail.com");
      expect(await prefill.locator("[data-tagged-email]").innerText()).not.toContain("+");
      await page.getByRole("button", { name: "I submitted on the sponsor page" }).click();
      await page.getByText("Prize Scout did not press it.").waitFor();
      expect(await chairCount.innerText()).toBe(before);
      expect(await page.locator("[data-entries-preview]").getAttribute("data-entry-logs")).toBe("1");
      expect(await page.locator("[data-entries-preview]").getAttribute("data-prepared-handoffs")).toBe("0");
      await page.locator("[data-entry-id=chair]").getByText("Next free entry tomorrow").waitFor();
      expect(await page.locator("[data-entry-id=chair]").getByRole("button", { name: "Paid", exact: true }).count()).toBe(0);

      await page.getByRole("button", { name: "Reading chair drawing — illustration only", exact: true }).click();
      const details = page.getByRole("dialog");
      await details.getByText("A drawn oak reading chair").waitFor();
      await details.getByRole("link", { name: "https://example.com/sample-chair" }).waitFor();
      expect(await details.getByText("01/09/2027 — sample entry noted in this preview.").filter({ visible: true }).count()).toBe(0);
      await details.getByText("Entry history", { exact: true }).click();
      await details.getByText("01/09/2027 — sample entry noted in this preview.").waitFor();
      expect(await details.getByRole("button", { name: "Show sample failure" }).count()).toBe(0);
      await details.getByText("This preview cannot verify that date.").waitFor();
      await page.keyboard.press("Escape");
      await details.waitFor({ state: "hidden" });

      await page.locator("[data-entry-id=truck]").getByRole("button", { name: "* If I win: taxes & delivery", exact: true }).click();
      const tax = page.getByRole("dialog");
      await tax.getByRole("heading", { name: "Can I afford this if I win?", exact: true }).waitFor();
      const taxText = await tax.innerText();
      expect(taxText).toContain("Combined taxable prize value");
      expect(taxText).toContain("$65,000");
      expect(taxText).toContain("$19,500");
      expect(taxText).toContain("Estimated additional cash needed");
      expect(taxText).toContain("$9,500");
      expect(taxText).toContain("applied once");
      expect(taxText).toContain("not an exact amount owed");
      expect(taxText).toContain("Delivery fee in this sample: $40");
      await page.getByRole("button", { name: "Close details" }).click();
      await tax.waitFor({ state: "hidden" });

      await page.getByRole("button", { name: "Compare", exact: true }).click();
      const compare = page.getByRole("dialog");
      expect(await compare.getByLabel("Budget").count()).toBe(0);
      await compare.getByRole("listitem").filter({ hasText: "Free daily example" }).getByText("Lowest cost", { exact: true }).waitFor();
      const mailOption = compare.getByRole("listitem").filter({ hasText: "Mail-in · No purchase necessary" });
      await mailOption.waitFor();
      expect(await mailOption.innerText()).toContain("Postage and supplies not included.");
      expect(await mailOption.innerText()).not.toMatch(/\$/);
      await compare.getByRole("button", { name: "Best value" }).click();
      expect(await compare.getByLabel("Budget").count()).toBe(0);
      await compare.getByText("Best value per dollar").waitFor();
      await compare.getByRole("button", { name: "Within your budget" }).click();
      await compare.getByLabel("Budget").waitFor();
      await compare.getByText("Enter a budget to use this mode.").waitFor();
      await compare.getByLabel("Budget").fill("12");
      await compare.getByText("Most entries within your budget").waitFor();
      expect(await compare.innerText()).toContain("Over this budget");
      expect(await compare.innerText()).toContain("can change");
      await compare.getByRole("button", { name: "Close compare" }).click();

      await page.getByRole("button", { name: "Mail-in", exact: true }).click();
      const mail = page.getByRole("dialog");
      await mail.getByText("Not every giveaway offers mail-in.").waitFor();
      expect(await mail.innerText()).toContain("does not print");
      expect(await mail.innerText()).not.toContain("3x5");
      await mail.getByRole("button", { name: "Close mail-in" }).click();

      const method = page.getByRole("group", { name: "Entry method" });
      expect(await method.getByRole("button", { name: "All", exact: true }).getAttribute("aria-pressed")).toBe("true");
      await method.getByRole("button", { name: "Paid", exact: true }).click();
      expect(await page.locator("[data-entry-id=truck]").count()).toBe(0);
      expect(await page.locator("[data-entry-id=chair]").count()).toBe(0);
      await method.getByRole("button", { name: "Free", exact: true }).click();
      await page.locator("[data-entry-id=chair]").getByText("Next free entry tomorrow").waitFor();
      expect(await page.locator("[data-entry-id=truck]").count()).toBe(1);
      const truckCount = await page.locator("[data-entry-count=truck]").innerText();
      await page.locator("[data-entry-id=truck]").getByRole("button", { name: "Enter", exact: true }).click();
      await page.getByRole("button", { name: "I submitted on the sponsor page" }).click();
      await method.getByRole("button", { name: "All", exact: true }).click();
      await page.locator("[data-entry-id=truck]").getByRole("button", { name: "Paid", exact: true }).waitFor();
      expect(await page.locator("[data-entry-count=truck]").innerText()).toBe(truckCount);
      await method.getByRole("button", { name: "Paid", exact: true }).click();
      await page.locator("[data-entry-id=truck]").waitFor();
      expect(await page.locator("[data-entry-id=chair]").count()).toBe(0);
      expect(await page.locator("[data-entries-section=pinned]").count()).toBe(0);
      await page.getByRole("button", { name: "Pin Field truck drawing — illustration only", exact: true }).click();
      await page.locator("[data-entries-section=pinned]").getByRole("button", { name: "Field truck drawing — illustration only", exact: true }).waitFor();
      await method.getByRole("button", { name: "Free", exact: true }).click();
      expect(await page.locator("[data-entry-id=truck]").count()).toBe(0);
      expect(await page.locator("[data-entry-id=chair]").count()).toBe(1);
      expect(await page.locator("[data-entry-id]").count()).toBe(3);
      await method.getByRole("button", { name: "All", exact: true }).click();
      expect(await page.locator("[data-entry-id]").count()).toBe(4);

      await page.locator("[data-entry-id=truck]").getByRole("button", { name: "Paid", exact: true }).click();
      await page.getByText("Paid filling, checkout, and purchase did not run.").waitFor();
      expect(await page.locator("[data-entry-count=truck]").innerText()).toBe(truckCount);

      await page.setViewportSize({ width: 390, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
      const shelf = page.locator("[data-entry-id=truck]");
      await shelf.getByText("Ends 01/15/2027").filter({ visible: true }).waitFor();
      expect(await shelf.getByRole("button", { name: "Mail-in", exact: true }).count()).toBe(0);
      expect(await shelf.getByRole("button", { name: "Compare", exact: true }).count()).toBe(0);
      await shelf.getByRole("button", { name: "Field truck drawing — illustration only", exact: true }).click();
      const narrow = page.getByRole("dialog");
      await narrow.getByRole("button", { name: "Mail-in", exact: true }).waitFor();
      await narrow.getByRole("button", { name: "Compare", exact: true }).waitFor();
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
    }
  }, 120_000);
});