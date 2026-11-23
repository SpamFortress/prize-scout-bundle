import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_RECEIPTS, correctReceiptAmount, groupPracticeGiveaways, reassignReceipt, recordReceipt } from "@/app/design-preview/profile-sample";

describe("sample profile receipts", () => {
  it("keeps one transaction when the same receipt is forwarded again", () => {
    const first = SAMPLE_RECEIPTS[0];
    const again = recordReceipt(SAMPLE_RECEIPTS, {
      messageId: "msg-market-2",
      sameAsMessageId: "msg-market-1",
      date: first.date,
      merchant: first.merchant,
      amount: first.amount + 24,
      giveawayId: "lamp",
      body: first.body,
      attachmentName: first.attachmentName,
    });
    expect(again.added).toBe(false);
    expect(again.receipts).toHaveLength(SAMPLE_RECEIPTS.length);
    const market = again.receipts.find((item) => item.id === "r-market");
    expect(market?.amount).toBe(24);
    expect(market?.giveawayId).toBe("demo-illustration-3");
    expect(market?.messageIds).toEqual(["msg-market-1", "msg-market-2"]);
  });

  it("reassigns one receipt without copying it", () => {
    const next = reassignReceipt(SAMPLE_RECEIPTS, "r-market", "oak");
    expect(next).toHaveLength(SAMPLE_RECEIPTS.length);
    expect(next.map((item) => item.id)).toEqual(SAMPLE_RECEIPTS.map((item) => item.id));
    expect(next.find((item) => item.id === "r-market")).toMatchObject({ amount: 24, giveawayId: "oak" });
    const corrected = correctReceiptAmount(next, "r-market", 20);
    expect(corrected.find((item) => item.id === "r-market")?.amount).toBe(20);
    expect(corrected.filter((item) => item.id === "r-market")).toHaveLength(1);
  });

  it("groups saved samples apart from confirmed entries", () => {
    const groups = groupPracticeGiveaways(["demo-illustration-1"], []);
    expect(groups.entered).toEqual([]);
    expect(groups.saved.map((item) => item.id)).toEqual(["demo-illustration-1"]);
    expect(groups.other.some((item) => item.id === "demo-illustration-1")).toBe(false);
    expect(groups.saved.some((item) => item.id === "truck")).toBe(false);
  });

  it("leaves production Profile free of this preview", () => {
    const profile = readFileSync(path.join(process.cwd(), "src/app/profile/page.tsx"), "utf8");
    const preview = ["page.tsx", "sample-browse.tsx"]
      .map((name) => readFileSync(path.join(process.cwd(), "src/app/design-preview", name), "utf8"))
      .join("\n");
    const entries = readFileSync(path.join(process.cwd(), "src/app/design-preview/entries-preview.tsx"), "utf8");
    expect(profile).toContain("useScout");
    expect(profile).not.toContain("DESIGN PREVIEW — sample Profile");
    expect(profile).not.toContain("Preview only—no connection made");
    expect(preview).toContain("Open sample Profile");
    expect(preview).not.toContain("useScout");
    expect(entries).not.toContain("Paid form filling");
  });
});