import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { observeHtml } from "@/domain/interpret";
import { addSavedContest, beginPermittedFill, recordLocalEntry, removeSavedContest, requestAutofill, runAutomationCheckpoint, runRulesCheckpoint } from "@/domain/selected";
import { observedDetail, prizeDescriptionView } from "@/domain/normalize";
import { PRIZE_DESCRIPTION_NOT_CAPTURED } from "@/domain/page-observations";

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

function readyContest() {
  const result = observeHtml(READY_HTML, "https://example.com/enter", NOW);
  if (!result.ok) throw new Error(result.error);
  return result.contest;
}

describe("saved checkbox", () => {
  it("adds a checked official page to Saved immediately and removes only that bookmark", () => {
    const contest = readyContest();
    const entriesBefore = [] as const;
    const added = addSavedContest([], [], contest, NOW);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.saved).toHaveLength(1);
    const startedFill = beginPermittedFill(added.saved[0], { country: "US", state: null, age: 21 }, NOW);
    expect(startedFill.submitted).toBe(false);
    expect(startedFill.entry.autofill?.submitted).toBe(false);
    expect(startedFill.message).toContain("Nothing was submitted");
    expect(added.saved[0]?.contestId).toBe(contest.id);
    expect(added.saved[0]?.autofill).toBeNull();
    expect(entriesBefore).toHaveLength(0);

    const again = addSavedContest(added.saved, added.preparations, contest, NOW);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.saved).toHaveLength(1);

    const directory = { ...contest, id: "directory", hubOnly: true, readiness: "hub_only" as const };
    expect(addSavedContest(added.saved, added.preparations, directory, NOW).ok).toBe(false);

    let prepared = added.saved[0];
    prepared = runRulesCheckpoint(prepared, { country: "US", state: null, age: 21 }, NOW);
    prepared = runAutomationCheckpoint(prepared, NOW);
    const filled = requestAutofill(prepared, NOW);
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(filled.entry.autofill?.submitted).toBe(false);
    const recorded = recordLocalEntry(filled.entry, NOW);
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    const entries = [recorded.tracked];

    const removed = removeSavedContest([filled.entry], [], contest.id);
    expect(removed.saved).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.submitted).toBe(false);
    expect(removed.preparations).toHaveLength(1);
    expect(removed.preparations[0]?.autofill?.submitted).toBe(false);
    expect(removed.preparations[0]?.rules?.submissionAllowed).toBe(false);

    const restored = addSavedContest(removed.saved, removed.preparations, contest, NOW);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.saved).toHaveLength(1);
    expect(restored.saved[0]?.autofill?.submitted).toBe(false);
    expect(restored.saved[0]?.rules?.status).toBe("pass");
    expect(entries).toEqual([recorded.tracked]);
    const started = beginPermittedFill(restored.saved[0], { country: "US", state: null, age: 21 }, NOW);
    expect(started.submitted).toBe(false);
    expect(started.entry.autofill?.submitted).toBe(false);
    expect(started.message).toContain("not entered");
    expect(started.message).toContain("Nothing was submitted");
    const blocked = beginPermittedFill(
      { ...restored.saved[0], autofill: null, rules: null, automation: null, contest: { ...contest, readiness: "fetched", formChecked: false, rulesChecked: false } },
      { country: null, state: null, age: null },
      NOW,
    );
    expect(blocked.submitted).toBe(false);
    expect(blocked.entry.autofill).toBeNull();
    expect(blocked.message).toContain("cannot start filling");
    expect(prizeDescriptionView(contest).text).toBe(PRIZE_DESCRIPTION_NOT_CAPTURED);
    expect(observedDetail(contest)).toBe(PRIZE_DESCRIPTION_NOT_CAPTURED);
    expect(observedDetail(contest)).not.toContain("No purchase necessary");
    const xPage = observeHtml(READY_HTML, "https://x.com/prize-scout-sample/status/illustration-2", NOW);
    expect(xPage.ok).toBe(true);
    if (!xPage.ok) return;
    expect(xPage.contest.source).toBe("x");
    expect(xPage.contest.officialUrl).toBe("https://x.com/prize-scout-sample/status/illustration-2");
    expect(contest.officialUrl).toBe("https://example.com/enter");
    expect(contest.source).toBe("web");
  });

  it("keeps production Saved free of sample listings and unsaves without touching entries", () => {
    const saved = readFileSync(path.join(process.cwd(), "src/app/saved/page.tsx"), "utf8");
    const preview = ["page.tsx", "sample-browse.tsx", "sample-data.ts"]
      .map((name) => readFileSync(path.join(process.cwd(), "src/app/design-preview", name), "utf8"))
      .join("\n");
    const provider = readFileSync(path.join(process.cwd(), "src/components/scout-provider.tsx"), "utf8");
    const selected = readFileSync(path.join(process.cwd(), "src/app/selected/page.tsx"), "utf8");
    expect(saved).not.toContain("demo-illustration");
    expect(saved).not.toContain("DESIGN PREVIEW");
    expect(saved).toContain("Unchecking removes the bookmark");
    expect(saved).toContain("data-saved-page=\"production\"");
    expect(saved).toContain("Saving a contest is not an entry.");
    expect(preview).not.toContain("useScout");
    expect(preview).toContain("DESIGN PREVIEW — sample Saved. Not your Saved tab.");
    expect(preview).toContain("data-saved-page=\"sample\"");
    expect(preview).toContain("Sample checkbox. Not saved.");
    expect(preview).toContain("Open sample Saved");
    expect(preview).not.toContain("camera drawing");
    expect(preview).not.toContain("Saved searches");
    expect(preview).toContain("Sample only. No entry or autofill occurred.");
    expect(saved).not.toContain("Saved searches");
    expect(saved).not.toContain("Save this search");
    expect(selected).toContain('redirect("/saved")');
    const unsave = provider.slice(provider.indexOf("unsaveContest: (contestId) =>"), provider.indexOf("runRules: (contestId) =>"));
    expect(unsave).toContain("removeSavedContest");
    expect(unsave).not.toContain("setEntries");
    expect(unsave).not.toContain("removeEntry");
    const save = provider.slice(provider.indexOf("saveContest: (contestId) =>"), provider.indexOf("unsaveContest: (contestId) =>"));
    expect(save).toContain("addSavedContest");
    expect(save).toContain("This is not an entry.");
    expect(save).not.toContain("setEntries");
  });
});
