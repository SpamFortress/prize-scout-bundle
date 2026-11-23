import { createServer, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { fillPrizeScoutForm, SAMPLE_PREFILL_CARD } from "@/domain/prefill";

const GLEAM_STYLE = `<!doctype html>
<html><head><title>Practice Gleam-style form</title></head>
<body>
  <form id="entry" action="/should-not-post" method="post">
    <label>Name <input name="name" placeholder="Name"></label>
    <label>Email <input type="email" name="email"></label>
    <label>Phone <input type="tel" name="phone"></label>
    <label>Address <input name="address" autocomplete="street-address"></label>
    <label>Date of birth <input type="date" name="date_of_birth"></label>
    <div id="captcha-widget">I'm not a robot</div>
    <button type="submit" id="sponsor-submit">Enter</button>
  </form>
  <iframe id="foreign" src="https://httpbin.org/forms/post" title="foreign"></iframe>
  <div id="open-host"></div>
  <div id="closed-host"></div>
  <script>
    const openHost = document.getElementById("open-host");
    const openRoot = openHost.attachShadow({ mode: "open" });
    openRoot.innerHTML = '<label>City <input name="city" id="shadow-city"></label><label>Email <input type="email" name="email" id="shadow-email"></label>';
    const closedHost = document.getElementById("closed-host");
    const closedRoot = closedHost.attachShadow({ mode: "closed" });
    closedRoot.innerHTML = '<input type="email" name="email" id="closed-email">';
    window.__closedEmail = closedRoot.querySelector("#closed-email");
    document.getElementById("entry").addEventListener("submit", (event) => {
      event.preventDefault();
      window.__submitted = true;
    });
  </script>
</body></html>`;

function listen(html: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port");
      resolve({
        origin: `http://127.0.0.1:${address.port}/`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe("cross-site prefill", () => {
  it("fills a public practice form and a local Gleam-style form without submitting", async () => {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const local = await listen(GLEAM_STYLE);
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    try {
      await page.goto("https://httpbin.org/forms/post", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator("input[name=custname]").waitFor();
      await page.screenshot({ path: "/opt/cursor/artifacts/prefill-httpbin-before.png" });
      const httpbin = await page.evaluate(fillPrizeScoutForm, SAMPLE_PREFILL_CARD);
      await page.screenshot({ path: "/opt/cursor/artifacts/prefill-httpbin-after.png" });
      expect(httpbin.clickedSubmit).toBe(false);
      expect(page.url()).toContain("/forms/post");
      expect(await page.locator("input[name=custname]").inputValue()).toBe(SAMPLE_PREFILL_CARD.name);
      expect(await page.locator("input[name=custtel]").inputValue()).toBe(SAMPLE_PREFILL_CARD.phone);
      expect(await page.locator("input[name=custemail]").inputValue()).toBe(SAMPLE_PREFILL_CARD.email);
      expect(httpbin.filled.map((item) => item.field).sort()).toEqual(["email", "name", "phone"]);
      expect(httpbin.notOnPage.sort()).toEqual(["address", "city", "dob", "state", "zip"]);

      await page.goto(local.origin, { waitUntil: "domcontentloaded" });
      await page.locator("input[name=name]").waitFor();
      await page.frameLocator("#foreign").locator("input[name=custname]").waitFor({ timeout: 20000 });
      await page.screenshot({ path: "/opt/cursor/artifacts/prefill-gleam-style-before.png" });
      const localReport = await page.evaluate(fillPrizeScoutForm, SAMPLE_PREFILL_CARD);
      await page.screenshot({ path: "/opt/cursor/artifacts/prefill-gleam-style-after.png" });
      expect(localReport.clickedSubmit).toBe(false);
      expect(await page.locator("#entry input[name=name]").inputValue()).toBe(SAMPLE_PREFILL_CARD.name);
      expect(await page.locator("#entry input[name=email]").inputValue()).toBe(SAMPLE_PREFILL_CARD.email);
      expect(await page.locator("#entry input[name=phone]").inputValue()).toBe(SAMPLE_PREFILL_CARD.phone);
      expect(await page.locator("#entry input[name=address]").inputValue()).toBe(SAMPLE_PREFILL_CARD.address);
      expect(await page.locator("#entry input[name=date_of_birth]").inputValue()).toBe(SAMPLE_PREFILL_CARD.dob);
      expect(localReport.filled.find((item) => item.field === "email")?.matched).toBe("email");
      expect(await page.locator("#shadow-city").inputValue()).toBe(SAMPLE_PREFILL_CARD.city);
      expect(await page.locator("#shadow-email").inputValue()).toBe("");
      expect(await page.evaluate(() => (window as unknown as { __closedEmail: HTMLInputElement }).__closedEmail.value)).toBe("");
      expect(await page.evaluate(() => (window as unknown as { __submitted?: boolean }).__submitted === true)).toBe(false);
      expect(localReport.limits.some((item) => item.includes("cross-origin iframe"))).toBe(true);
      expect(localReport.filled.map((item) => item.field)).toEqual(expect.arrayContaining(["name", "email", "phone", "address", "dob"]));
      expect(localReport.filled.some((item) => item.matched === "shadow-email" || item.matched === "email")).toBe(true);
    } finally {
      await page.close();
      await browser.close();
      await local.close();
    }
  }, 120_000);
});
