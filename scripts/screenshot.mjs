import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.PRIZE_SCOUT_URL ?? "http://127.0.0.1:4317";
const out = process.env.SHOT_DIR ?? "/tmp/prize-scout-shots";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function shot(name, viewport, steps) {
  const page = await browser.newPage({ viewport });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByPlaceholder("I want to win…").waitFor();
  await steps(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  await page.close();
}

await shot("desktop-search", { width: 1280, height: 800 }, async (page) => {
  await page.getByPlaceholder("I want to win…").fill("furniture");
  await page.getByRole("checkbox", { name: "Facebook" }).click();
  await page.getByRole("checkbox", { name: "Instagram" }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("Open Prize Scout and ask: Search furniture on Web and X in the US.").waitFor();
  await page.getByRole("link", { name: "Start in Prize Scout chat" }).waitFor();
});

await shot("mobile-search", { width: 390, height: 844 }, async (page) => {
  await page.getByPlaceholder("I want to win…").fill("furniture");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: "Start in Prize Scout chat" }).scrollIntoViewIfNeeded();
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${base}/about`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "About" }).waitFor();
await page.getByRole("link", { name: "Preview" }).first().waitFor();
await page.screenshot({ path: `${out}/desktop-about.png`, fullPage: false });
await page.close();

await browser.close();
console.log(out);
