import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { notifierFromEnv, webhookNotifier } from "@/domain/credit-alert";
import { ownerTokenMatches } from "@/server/owner-gate";
import { beginSearch, getUsageSummary, saveOwnerSettings } from "@/server/usage-store";
import {
  creditExhausted,
  creditIsLow,
  dailyCapReached,
  dailyVisitorHash,
  DEFAULT_COST_USD,
  remainingCreditUsd,
  searchesLeft,
  searchesPerDollar,
  searchGate,
} from "@/domain/usage";

const tempDirs: string[] = [];

afterEach(async () => {
  delete process.env.PRIZE_SCOUT_USAGE_FILE;
  delete process.env.PRIZE_SCOUT_BRAVE_CREDIT_USD;
  delete process.env.PRIZE_SCOUT_OWNER_TOKEN;
  delete process.env.PRIZE_SCOUT_ALERT_WEBHOOK_URL;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function usageFile(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scout-usage-"));
  tempDirs.push(dir);
  const file = path.join(dir, "usage.json");
  process.env.PRIZE_SCOUT_USAGE_FILE = file;
  return file;
}

describe("usage math and visitor hash", () => {
  it("turns one dollar into 200 searches at the default request cost", () => {
    expect(searchesPerDollar(DEFAULT_COST_USD)).toBe(200);
    expect(searchesPerDollar(0)).toBe(0);
  });

  it("estimates remaining credit and the low-credit threshold", () => {
    expect(remainingCreditUsd(10, 100, 0.005)).toBe(9.5);
    expect(searchesLeft(9.5, 0.005)).toBe(1900);
    expect(creditExhausted(0)).toBe(true);
    expect(creditExhausted(0.005)).toBe(false);
    expect(creditIsLow(1.99, 2)).toBe(true);
    expect(creditIsLow(2, 2)).toBe(false);
  });

  it("pauses when the key is missing, credit is gone, or the daily cap is reached", () => {
    expect(searchGate({ hasKey: false, startingCreditUsd: 10, braveRequests: 0, costPerRequestUsd: 0.005, searchesByVisitor: 0, cap: 25 }).reason).toBe("no_key");
    expect(searchGate({ hasKey: true, startingCreditUsd: 0.005, braveRequests: 1, costPerRequestUsd: 0.005, searchesByVisitor: 0, cap: 25 }).reason).toBe("credit");
    expect(dailyCapReached(25, 25)).toBe(true);
    expect(searchGate({ hasKey: true, startingCreditUsd: 10, braveRequests: 0, costPerRequestUsd: 0.005, searchesByVisitor: 25, cap: 25 }).reason).toBe("cap");
    expect(searchGate({ hasKey: true, startingCreditUsd: null, braveRequests: 0, costPerRequestUsd: 0.005, searchesByVisitor: 0, cap: 25 }).paused).toBe(false);
  });

  it("hashes an anonymous id with the day and does not keep an email or address", () => {
    const email = "person@example.com";
    const ip = "203.0.113.10";
    const today = dailyVisitorHash("anon-token", "2026-11-09", "salt");
    const tomorrow = dailyVisitorHash("anon-token", "2026-11-10", "salt");
    expect(today).toMatch(/^[0-9a-f]{64}$/);
    expect(tomorrow).not.toBe(today);
    expect(today).not.toContain(email);
    expect(today).not.toContain(ip);
    expect(today).not.toContain("anon-token");
    expect(JSON.stringify({ hash: today })).not.toContain("@");
  });
});

describe("usage file", () => {
  it("counts a search, a visitor, and a low-credit webhook once", async () => {
    await usageFile();
    process.env.PRIZE_SCOUT_BRAVE_CREDIT_USD = "1";
    process.env.PRIZE_SCOUT_ALERT_WEBHOOK_URL = "https://alerts.example/hook";
    const calls: unknown[] = [];
    const notify = webhookNotifier("https://alerts.example/hook", async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return new Response("ok");
    });
    const first = await beginSearch({ anonId: "visitor-a", hasKey: true, now: new Date("2026-11-09T12:00:00Z") });
    expect(first.paused).toBe(false);
    expect(first.summary.searchesToday).toBe(1);
    expect(first.summary.visitorsToday).toBe(1);
    expect(first.summary.braveRequestsAllTime).toBe(1);
    expect(first.summary.low).toBe(true);
    await import("@/server/usage-store").then((store) => store.maybeAlertLowCredit(first.summary, notify));
    await import("@/server/usage-store").then((store) => store.maybeAlertLowCredit(first.summary, notify));
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).not.toMatch(/visitor-a|@|203\.0/);
    const capped = await beginSearch({ anonId: "visitor-a", hasKey: true, now: new Date("2026-11-09T13:00:00Z") });
    expect(capped.summary.searchesToday).toBe(2);
    const summary = await getUsageSummary(new Date("2026-11-09T13:00:00Z"));
    expect(summary.searchesAllTime).toBe(2);
    expect(summary.remainingUsd).toBeLessThan(1);
  });

  it("does not call a webhook when none is configured", async () => {
    expect(notifierFromEnv(undefined)).not.toBe(webhookNotifier("https://alerts.example/hook"));
    const silent = notifierFromEnv("");
    await expect(silent.notifyLowCredit({ remainingUsd: 1, thresholdUsd: 2, searchesLeft: 200 })).resolves.toBeUndefined();
  });

  it("rejects a missing owner token", () => {
    process.env.PRIZE_SCOUT_OWNER_TOKEN = "secret-token";
    expect(ownerTokenMatches("secret-token")).toBe(true);
    expect(ownerTokenMatches("nope")).toBe(false);
    expect(ownerTokenMatches("")).toBe(false);
    delete process.env.PRIZE_SCOUT_OWNER_TOKEN;
    expect(ownerTokenMatches("secret-token")).toBe(false);
  });

  it("saves an edited starting credit", async () => {
    await usageFile();
    const summary = await saveOwnerSettings({ startingCreditUsd: 3, costPerRequestUsd: 0.005, lowCreditUsd: 2 });
    expect(summary.startingCreditUsd).toBe(3);
    expect(summary.remainingUsd).toBe(3);
    expect(summary.searchesLeft).toBe(600);
    expect(summary.low).toBe(false);
  });
});
