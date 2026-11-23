import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.PRIZE_SCOUT_URL ?? "http://127.0.0.1:4317";
const out = "/opt/cursor/artifacts";
await mkdir(out, { recursive: true });

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const browserRequests = [];
let popups = 0;
page.on("popup", () => {
  popups += 1;
});
page.on("request", (request) => {
  const url = request.url();
  if (!url.startsWith(base) && !url.startsWith("data:")) browserRequests.push(url);
});

await page.goto(base, { waitUntil: "networkidle" });
const placeholder = await page.getByPlaceholder("I want to win…").getAttribute("placeholder");
check("search placeholder", placeholder === "I want to win…", placeholder ?? "missing");

await page.getByPlaceholder("I want to win…").fill("furniture");
await page.getByRole("checkbox", { name: "Facebook" }).click();
await page.getByRole("checkbox", { name: "Instagram" }).click();
await page.getByRole("button", { name: "Search", exact: true }).click();
const ask = page.getByText("Open Prize Scout and ask: Search furniture on Web and X in the US.");
check("chat ask sentence", (await ask.count()) === 1, await ask.first().textContent());
const href = await page.getByRole("link", { name: "Start in Prize Scout chat" }).getAttribute("href");
check(
  "chat link",
  href === "grokbot://app/v1/agent?id=local-practice",
  href ?? "missing",
);
check(
  "no invented contests before a page check",
  (await page.getByText("No official page has been checked in this tab.").count()) === 1,
  "empty checked list",
);

await page.getByLabel("Official page URL").fill("https://example.com/");
await page.getByRole("button", { name: "Check page" }).click();
const checkStatus = page.getByText(/Fetched the page|was not fetched|robots\.txt|did not load|No contest was added|could not be read/);
await checkStatus.first().waitFor({ timeout: 25000 });
const checkText = (await checkStatus.first().textContent()) ?? "";
const honest =
  /Nothing was submitted|not ready|was not fetched|did not|disallow|No contest was added|could not/i.test(checkText);
check("official page check stays honest", honest, checkText);
check(
  "official page check does not claim a sponsor submission",
  !/submitted to the sponsor|entry submitted|email sent/i.test(checkText),
  checkText,
);
const selectable = await page.getByRole("checkbox", { name: "Select Example Domain" }).count();
check("example.com was not selectable as an entry", selectable === 0, `selectable checkboxes ${selectable}`);

await page.getByRole("button", { name: "Save this search" }).click();
await page.getByRole("link", { name: "Saved" }).click();
await page.getByRole("heading", { name: "Saved" }).waitFor();
const savedText = (await page.locator("main").textContent()) ?? "";
check("saved search kept the query", savedText.includes("furniture"), savedText.slice(0, 400));
check("saved search has no email", !savedText.includes("@"), "no @ in saved page");
await page.screenshot({ path: `${out}/desktop-saved.png` });

await page.getByRole("link", { name: "Selected" }).click();
await page.getByRole("heading", { name: "Selected" }).waitFor();
const selectedText = (await page.locator("main").textContent()) ?? "";
check("nothing selected without ready evidence", selectedText.includes("Nothing is selected."), selectedText.slice(0, 300));
await page.screenshot({ path: `${out}/desktop-selected.png` });

await page.getByRole("link", { name: "Entries" }).click();
await page.getByRole("heading", { name: "Entries" }).waitFor();
const entriesText = (await page.locator("main").textContent()) ?? "";
check("no local entry was created", entriesText.includes("No local entries"), entriesText.slice(0, 300));
await page.screenshot({ path: `${out}/desktop-entries.png` });

await page.getByRole("link", { name: "Profile" }).click();
await page.getByRole("heading", { name: "Profile" }).waitFor();
await page.getByRole("button", { name: "Prepare unpaired Fortress draft" }).click();
await page.getByText("Unpaired draft prepared in this tab.").waitFor();
const profileText = (await page.locator("main").textContent()) ?? "";
check("fortress draft says unpaired", profileText.includes("Unpaired draft only"), profileText.slice(profileText.indexOf("Unpaired"), profileText.indexOf("Unpaired") + 500));
check("fortress draft asks for chat consent", profileText.includes("explicit pairing consent"), "consent sentence present");
check("fortress draft is not called a connection", !/approved connection|Approved in this tab|connected true/i.test(profileText), "no approval label");
check("fortress phone stays pending", profileText.includes("PRIZE_FORTRESS_PAIR_REQUEST is pending"), profileText);
const chatHref = await page.getByRole("link", { name: "Return to Prize Scout chat" }).getAttribute("href");
check("profile returns to the real chat route", chatHref?.startsWith("grokbot://app/v1/agent?id=local-practice"), chatHref ?? "missing");
await page.screenshot({ path: `${out}/desktop-profile.png` });

await page.getByRole("link", { name: "About" }).click();
await page.getByRole("heading", { name: "About" }).waitFor();
const aboutText = (await page.locator("main").textContent()) ?? "";
check("about has no directory research dump", !/Infinite Sweeps|Giveaway Listing|ContestGirl/.test(aboutText), "about text");
check("about says unpaired draft", aboutText.includes("unpaired draft"), "about fortress");

check("browser opened no extra windows", popups === 0, String(popups));
check("browser made no external requests", browserRequests.length === 0, browserRequests.join(", ") || "none");

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const [path, file, heading] of [
  ["/saved", "mobile-saved.png", "Saved"],
  ["/selected", "mobile-selected.png", "Selected"],
  ["/entries", "mobile-entries.png", "Entries"],
  ["/profile", "mobile-profile.png", "Profile"],
]) {
  await mobile.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await mobile.getByRole("heading", { name: heading }).waitFor();
  if (path === "/profile") {
    await mobile.getByRole("button", { name: "Prepare unpaired Fortress draft" }).click();
    await mobile.getByText("Unpaired draft only.").waitFor();
  }
  await mobile.screenshot({ path: `${out}/${file}` });
}
await mobile.close();
await page.close();
await browser.close();

const failed = results.filter((item) => !item.pass);
await writeFile(`${out}/workflow-results.json`, JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`RESULTS ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length > 0) process.exit(1);
