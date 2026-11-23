import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { startEphemeralScout } from "./ephemeral-server";

function listen(handler: (url: URL, token: string | undefined) => { status: number; body: string; type: string }): Promise<{ origin: string; hits: string[]; close: () => Promise<void> }> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    hits.push(url.pathname);
    const result = handler(url, req.headers["x-subscription-token"] as string | undefined);
    res.writeHead(result.status, { "content-type": result.type });
    res.end(result.body);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("no port");
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        hits,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe("mocked Brave search", () => {
  it("shows a verified page and does not invent a sample row", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "scout-brave-"));
    const mock = await listen((url, token) => {
      if (url.pathname === "/search") {
        expect(token).toBe("test-token");
        return {
          status: 200,
          type: "application/json",
          body: JSON.stringify({ web: { results: [{ title: "Do not use this title", url: "https://example.com/enter", description: "snippet only" }] } }),
        };
      }
      return { status: 404, type: "text/plain", body: "missing" };
    });
    const scout = await startEphemeralScout({
      PRIZE_SCOUT_SEARCH_API_KEY: "test-token",
      PRIZE_SCOUT_SEARCH_URL: `${mock.origin}/search`,
      PRIZE_SCOUT_USAGE_FILE: path.join(dir, "usage.json"),
      PRIZE_SCOUT_BRAVE_CREDIT_USD: "10",
      PRIZE_SCOUT_OWNER_TOKEN: "owner-test-token",
      PRIZE_SCOUT_TIP_URL: "https://ko-fi.com/example",
    });
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const missing = await fetch(`${scout.origin}/owner`);
      expect(missing.status).toBe(404);
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(`${scout.origin}/practice`, { waitUntil: "networkidle" });
      await page.getByText("$1 keeps 200 searches running").waitFor();
      await page.getByRole("link", { name: "Tip on Ko-fi" }).waitFor();
      const disclaimer = "Prize Scout finds giveaways but can't guarantee them. Always read the official rules before entering.";
      await page.getByText(disclaimer).waitFor();
      await page.getByLabel("I want to win…").fill("widget");
      const searchResponse = page.waitForResponse((response) => response.url().includes("/api/search"));
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const payload = (await (await searchResponse).json()) as { listings?: Array<{ title: string; endIso: string | null; prize: string; url: string }> };
      await page.locator("[data-practice-home=results]").waitFor();
      expect(payload.listings).toEqual([
        expect.objectContaining({
          title: "Do not use this title",
          url: "https://example.com/enter",
          endIso: null,
          prize: "Not stated on a fetched page.",
        }),
      ]);
      expect(await page.locator("[data-entry-id=truck]").count()).toBe(0);
      expect(await page.getByText("Do not use this title").count()).toBe(1);
      expect(await page.getByText(disclaimer).count()).toBeGreaterThan(0);
      expect(mock.hits).toContain("/search");
      await page.goto(`${scout.origin}/owner?token=owner-test-token`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "Usage", exact: true }).waitFor();
      await page.getByText("Searches today").waitFor();
      expect(await page.locator("body").innerText()).toContain("1");
      await page.close();
    } finally {
      await browser.close();
      await scout.stop();
      await mock.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
