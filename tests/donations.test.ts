import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { meterLine, splitDonation } from "@/domain/donations";
import { DonationMeter } from "@/components/donation-meter";
import { POST as kofiPost } from "@/app/api/kofi/route";
import { acceptKofiWebhook, browserClaimCode, claimDonations, drawExtraSearch, ownerDonationView, resetDonationsForTests } from "@/server/donation-store";
import { beginSearch } from "@/server/usage-store";
import { ensureMacLegacyMigrated } from "@/server/legacy-docs";
import { readFsDocument, writeFsDocument } from "@/server/document-store";

const dirs: string[] = [];
const TOKEN = "kofi-test-token";

afterEach(() => {
  resetDonationsForTests();
  delete process.env.PRIZE_SCOUT_DATA_DIR;
  delete process.env.PRIZE_SCOUT_USAGE_FILE;
  delete process.env.PRIZE_SCOUT_KOFI_VERIFICATION_TOKEN;
  delete process.env.PRIZE_SCOUT_FREE_DAILY_CAP;
  delete process.env.PRIZE_SCOUT_POOL_DAILY_CAP;
  delete process.env.PRIZE_SCOUT_MONTHLY_CEILING_USD;
  delete process.env.PRIZE_SCOUT_COST_PER_SEARCH_USD;
  delete process.env.PRIZE_SCOUT_DONOR_SHARE;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function useDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "donate-"));
  dirs.push(dir);
  process.env.PRIZE_SCOUT_DATA_DIR = dir;
  process.env.PRIZE_SCOUT_USAGE_FILE = path.join(dir, "usage.json");
  process.env.PRIZE_SCOUT_KOFI_VERIFICATION_TOKEN = TOKEN;
  return dir;
}

function webhookBody(fields: Record<string, string>): Request {
  const params = new URLSearchParams();
  params.set("data", JSON.stringify(fields));
  return new Request("http://127.0.0.1/api/kofi", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
}

describe("donation split", () => {
  it("turns a USD amount into donor and pool searches", () => {
    expect(splitDonation(1, 0.025, 0.5)).toEqual({ total: 40, donor: 20, pool: 20 });
    expect(splitDonation(0.02, 0.025, 0.5).total).toBe(0);
    expect(meterLine(2, 50)).toBe("This month: $2.00 of $50.00 search costs covered by donations");
    const html = renderToStaticMarkup(createElement(DonationMeter, { coveredUsd: 2, budgetUsd: 50, bonus: 3, claimCode: "AB12-CD34", donationUrl: "https://example.com/donate" }));
    expect(html).toContain("data-donation-meter");
    expect(html).toContain("This month: $2.00 of $50.00 search costs covered by donations");
    expect(html).toContain("Your bonus searches: 3");
    expect(html).toContain("https://example.com/donate");
    const hidden = renderToStaticMarkup(createElement(DonationMeter, { coveredUsd: 0, budgetUsd: 0, bonus: 0 }));
    expect(hidden).not.toContain("data-donation-link");
  });
});

describe("Ko-fi webhook", () => {
  it("rejects a bad token, dedupes, matches a code, and parks the rest in the pool", async () => {
    const dir = useDir();
    const bad = await kofiPost(webhookBody({ verification_token: "nope", message_id: "m-1", amount: "1.00", currency: "USD", type: "Donation", email: "donor@example.com", message: "" }));
    expect(bad.status).toBe(401);
    const code = await browserClaimCode("browser-a");
    const first = await kofiPost(webhookBody({ verification_token: TOKEN, message_id: "m-1", amount: "1.00", currency: "USD", type: "Donation", email: "donor@example.com", from_name: "Ada", message: `thanks ${code}` }));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { matched?: boolean };
    expect(firstBody.matched).toBe(true);
    const again = await acceptKofiWebhook({ verificationToken: TOKEN, messageId: "m-1", amount: "1.00", currency: "USD", email: "donor@example.com", message: code, type: "Donation" });
    expect(again.duplicate).toBe(true);
    const view = await ownerDonationView();
    expect(view.donations).toHaveLength(1);
    expect(view.donations[0]?.matched).toBe(true);
    expect(view.poolSearches).toBe(20);
    const stored = readFileSync(path.join(dir, "donations.json"), "utf8");
    expect(stored).not.toContain("donor@example.com");
    expect(stored).not.toContain("Ada");
    const unmatched = await acceptKofiWebhook({ verificationToken: TOKEN, messageId: "m-2", amount: "0.50", currency: "USD", email: "other@example.com", message: "no code here", type: "Donation" });
    expect(unmatched.matched).toBe(false);
    const after = await ownerDonationView();
    expect(after.poolSearches).toBe(40);
    expect(after.donations[1]?.matched).toBe(false);
    const later = await acceptKofiWebhook({ verificationToken: TOKEN, messageId: "m-3", amount: "1.00", currency: "USD", email: "later@example.com", message: "code ABCD-WXYZ", type: "Donation" });
    expect(later.matched).toBe(false);
    const claimed = await claimDonations("browser-b", "ABCD-WXYZ");
    expect(claimed.claimed).toBe(1);
    expect(claimed.bonus).toBe(20);
    const finalStore = readFileSync(path.join(dir, "donations.json"), "utf8");
    expect(finalStore).not.toContain("later@example.com");
  });
});

describe("search funding order", () => {
  it("uses free, then bonus, then the pool, and stops at the per-id pool cap and the ceiling", async () => {
    useDir();
    process.env.PRIZE_SCOUT_FREE_DAILY_CAP = "1";
    process.env.PRIZE_SCOUT_POOL_DAILY_CAP = "1";
    process.env.PRIZE_SCOUT_COST_PER_SEARCH_USD = "0.025";
    process.env.PRIZE_SCOUT_DONOR_SHARE = "0.5";
    const now = new Date("2026-11-09T18:00:00.000Z");
    const code = await browserClaimCode("browser-a");
    await acceptKofiWebhook({ verificationToken: TOKEN, messageId: "fund-1", amount: "0.10", currency: "USD", email: "donor@example.com", message: code, type: "Donation", now });
    const free = await beginSearch({ anonId: "browser-a", hasKey: true, now, query: "one" });
    expect(free.reason).toBe("free");
    const bonus = await beginSearch({ anonId: "browser-a", hasKey: true, now, query: "two" });
    expect(bonus.reason).toBe("bonus");
    const bonusAgain = await beginSearch({ anonId: "browser-a", hasKey: true, now, query: "three" });
    expect(bonusAgain.reason).toBe("bonus");
    const pool = await beginSearch({ anonId: "browser-a", hasKey: true, now, query: "four" });
    expect(pool.reason).toBe("pool");
    const capped = await beginSearch({ anonId: "browser-a", hasKey: true, now, query: "five" });
    expect(capped.paused).toBe(true);
    expect(capped.reason).toBe("cap");
    process.env.PRIZE_SCOUT_MONTHLY_CEILING_USD = "0";
    const otherCode = await browserClaimCode("browser-c");
    await acceptKofiWebhook({ verificationToken: TOKEN, messageId: "fund-2", amount: "0.05", currency: "USD", email: "donor@example.com", message: otherCode, type: "Donation", now });
    expect(await drawExtraSearch("browser-c", "2026-11-09", now)).toBe("bonus");
    expect(await drawExtraSearch("browser-c", "2026-11-09", now)).toBeNull();
  });
});

describe("Mac legacy copy", () => {
  it("copies the original checks file when the Mac app starts and keeps the original", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "legacy-mac-"));
    dirs.push(dir);
    const previous = process.env.VITEST;
    delete process.env.VITEST;
    process.env.PRIZE_SCOUT_DATA_DIR = dir;
    writeFsDocument(dir, "addon-checks", JSON.stringify([{ url: "https://example.com/kept" }]));
    try {
      expect(ensureMacLegacyMigrated()).toBe(true);
      expect(readFsDocument(dir, "addon-checks")).toContain("https://example.com/kept");
      expect(readFsDocument(dir, "owner-checks")).toContain("https://example.com/kept");
    } finally {
      process.env.VITEST = previous;
      delete process.env.PRIZE_SCOUT_DATA_DIR;
    }
  });
});
