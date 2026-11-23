import { describe, expect, it } from "vitest";
import { buildChatAsk, CHAT_LINK_LABEL, FORTRESS_CHAT_ASK } from "@/domain/chat";
import { parseDueDate, daysUntil } from "@/domain/dates";
import { assessEligibility } from "@/domain/eligibility";
import { buildFortressProposal, CLEANUP_DISABLED_BG, CLEANUP_DISABLED_TEXT, cleanupRowState, contrastRatio, describeFortressDraft, describeHandoffAttempt, FORTRESS_DRAFT_BUTTON, FORTRESS_DRAFT_EXPLAIN, FORTRESS_DRAFT_NOTICE, handoffAfterPreparation, IDENTITY_REMOVAL_ASK, IDENTITY_REMOVAL_GUIDANCE, redactedPacketIsStrict, unpairedFortress } from "@/domain/fortress";
import { stableId, sha256Hex } from "@/domain/index";
import { observeHtml } from "@/domain/interpret";
import { applySelectAll } from "@/domain/match";
import { normalizeVerifiedToolResult } from "@/domain/normalize";
import { defaultProfile, profileIsNotSaved, updateSessionProfile } from "@/domain/profile";
import { createSavedSearch, rerunPayload } from "@/domain/saved";
import {
  createSelectedEntry,
  recordLocalEntry,
  requestAutofill,
  runAutomationCheckpoint,
  runRulesCheckpoint,
} from "@/domain/selected";
import { checkOfficialPage } from "@/server/check-page";
import { robotsAllows } from "@/server/robots";
import { hostIsBlocked, ipIsBlocked } from "@/server/ssrf";

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

describe("ids and dates", () => {
  it("hashes known vectors and stays stable", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(stableId(["contest", "web", "https://example.com"])).toBe(stableId(["contest", "web", "https://example.com"]));
    expect(stableId(["a"])).not.toBe(stableId(["b"]));
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(stableId(["n", i, { i }]));
    expect(seen.size).toBe(200);
  });

  it("parses explicit dates and rejects ambiguous ones", () => {
    expect(parseDueDate("2026-12-31").proven).toBe(true);
    expect(parseDueDate("December 31, 2026")).toMatchObject({ proven: true, isoDate: "2026-12-31" });
    expect(parseDueDate("11/30/2026")).toMatchObject({ proven: false, reason: "end_date_ambiguous" });
    expect(parseDueDate("2026-02-31")).toMatchObject({ proven: false });
    expect(parseDueDate(null)).toMatchObject({ proven: false, reason: "end_date_not_explicit" });
    const proof = parseDueDate("2026-12-31");
    expect(daysUntil(proof, NOW)).toBe(55);
  });
});

describe("official page observation", () => {
  it("keeps an explicit prize and a form, and drops a vague value", () => {
    const contest = readyContest();
    expect(contest.prizeValue).toEqual({ amount: 500, currency: "USD", explicit: true });
    expect(contest.readiness).toBe("form_checked");
    expect(contest.entryCost).toBe("free");
    expect(contest.limits).toMatchObject({ countries: ["US"], minAge: 18 });
    expect(contest.imageUrl).toBeNull();
    const vague = observeHtml("<html><head><title>Camera</title></head><body><p>Win a camera.</p></body></html>", "https://example.com/vague", NOW);
    expect(vague.ok && vague.contest.prizeValue).toBeNull();
  });

  it("does not treat a directory as an entry", () => {
    const links = Array.from({ length: 9 }, (_, i) => `<a href="https://other${i}.example/g">g</a>`).join("");
    const result = observeHtml(`<html><head><title>International Giveaway List</title></head><body>${links}</body></html>`, "https://directory.example/list", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contest.hubOnly).toBe(true);
    expect(createSelectedEntry(result.contest, NOW).ok).toBe(false);
  });

  it("rejects unverified tool output and non-explicit money", () => {
    expect(normalizeVerifiedToolResult({ verified: false, evidenceUrl: "https://example.com", payload: {} }, NOW).ok).toBe(false);
    const dropped = normalizeVerifiedToolResult(
      {
        verified: true,
        evidenceUrl: "https://example.com/a",
        tool: "evidence.fetch",
        payload: {
          title: "Trip",
          officialUrl: "https://example.com/a",
          source: "web",
          prizeValue: { amount: 10, currency: "USD", explicit: false },
          formFound: true,
          rulesLinkFound: true,
          hubOnly: false,
        },
      },
      NOW,
    );
    expect(dropped.ok && dropped.contest.prizeValue).toBeNull();
  });
});

describe("selection workflow", () => {
  it("requires separate checkpoints and never submits", () => {
    const contest = readyContest();
    const selected = createSelectedEntry(contest, NOW);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(requestAutofill(selected.entry, NOW).ok).toBe(false);
    const withRules = runRulesCheckpoint(selected.entry, { country: "US", state: "CA", age: 30 }, NOW);
    expect(withRules.rules?.status).toBe("pass");
    const withAuto = runAutomationCheckpoint(withRules, NOW);
    expect(withAuto.automation?.status).toBe("pass");
    expect(withAuto.automation?.submissionAllowed).toBe(false);
    const fill = requestAutofill(withAuto, NOW);
    expect(fill.ok).toBe(true);
    if (!fill.ok) return;
    expect(fill.entry.autofill).toMatchObject({ observation: "form_prepared", status: "not_submitted", submitted: false });
    const tracked = recordLocalEntry(withAuto, NOW);
    expect(tracked.ok).toBe(true);
    if (!tracked.ok) return;
    expect(tracked.tracked).toMatchObject({ submitted: false, sponsorSubmission: "not_submitted" });
    expect(JSON.stringify(tracked.tracked)).not.toContain("@");
  });

  it("blocks automation when the page forbids it", () => {
    const observed = observeHtml(
      READY_HTML.replace("One entry per person.", "Automated entries are not allowed."),
      "https://example.com/auto",
      NOW,
    );
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    const selected = createSelectedEntry(observed.contest, NOW);
    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    const checked = runAutomationCheckpoint(
      runRulesCheckpoint(selected.entry, { country: "US", state: null, age: 30 }, NOW),
      NOW,
    );
    expect(checked.automation?.status).toBe("blocked");
    expect(requestAutofill(checked, NOW).ok).toBe(false);
  });

  it("blocks entry when eligibility fails or the due date is missing", () => {
    const contest = readyContest();
    const selected = createSelectedEntry(contest, NOW);
    if (!selected.ok) throw new Error("expected selection");
    const young = runRulesCheckpoint(selected.entry, { country: "US", state: null, age: 16 }, NOW);
    expect(young.rules?.status).toBe("blocked");
    const unknown = assessEligibility(contest, { country: null, state: null, age: null }, NOW);
    expect(unknown.status).toBe("unknown");
    const noDate = { ...selected.entry, nextDue: parseDueDate(null) };
    const passed = runAutomationCheckpoint(runRulesCheckpoint(noDate, { country: "US", state: null, age: 30 }, NOW), NOW);
    expect(requestAutofill(passed, NOW).ok).toBe(false);
  });
});

describe("profile, saved search, and fortress", () => {
  it("keeps profile unsaved and refuses secrets and a fortress connection", () => {
    expect(profileIsNotSaved().saved).toBe(false);
    const card = updateSessionProfile(defaultProfile(), { dedicatedEmail: "4242424242424242" });
    expect(card.ok).toBe(false);
    const fortress = updateSessionProfile(defaultProfile(), { emailMode: "fortress" });
    expect(fortress.ok).toBe(false);
    const personal = updateSessionProfile(defaultProfile(), { personalEmail: "person@example.com" });
    expect(personal.ok).toBe(false);
    const ok = updateSessionProfile(defaultProfile(), { country: "US", state: "CA", age: 30, emailMode: "dedicated", dedicatedEmail: "desk@example.com" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.profile.fortressConnected).toBe(false);
  });

  it("saves a profile-free query and builds the chat sentence", () => {
    const saved = createSavedSearch({ query: "furniture", sources: ["web", "x"], region: "US" }, NOW);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(Object.keys(saved.saved).sort()).toEqual(["createdAt", "id", "query", "region", "sources"]);
    expect(rerunPayload(saved.saved)).toEqual({ query: "furniture", sources: ["web", "x"], region: "US" });
    expect(buildChatAsk("furniture", ["web", "x"], "US")).toBe(
      "Open Prize Scout and ask: Search furniture on Web and X in the US.",
    );
    expect(CHAT_LINK_LABEL).toBe("Start in Prize Scout chat");
    expect(applySelectAll(["a", "b"], ["a"], true)).toEqual(["a", "b"]);
  });

  it("prepares a dormant fortress proposal", () => {
    expect(buildFortressProposal(false, null, NOW).ok).toBe(false);
    const proposal = buildFortressProposal(true, null, NOW);
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) return;
    expect(proposal.proposal.connected).toBe(false);
    expect(proposal.proposal.sent).toBe(false);
    expect(proposal.proposal.email.message_type).toBe("link_proposal");
    expect(proposal.proposal.email.protocol).toBe("prize-scout-email-cleanup/v1");
    expect(proposal.proposal.email.ownerOptIn).toBe(false);
    expect(proposal.proposal.phone).toMatchObject({
      protocol: "prize-fortress-v1",
      message_type: "PRIZE_FORTRESS_PAIR_REQUEST",
      status: "pending",
      ownerConfirmed: false,
      accepted: false,
      connected: false,
    });
    const described = describeFortressDraft(proposal.proposal);
    expect(described).toContain("Unpaired draft only");
    expect(described).not.toMatch(/approved connection/i);
    expect(FORTRESS_DRAFT_BUTTON).toBe("Prepare unpaired Fortress draft");
    expect(FORTRESS_DRAFT_EXPLAIN).toMatch(/explicit pairing consent/);
    expect(FORTRESS_DRAFT_NOTICE).toMatch(/Return to Prize Scout chat/);
    expect(FORTRESS_CHAT_ASK).toMatch(/explicit pairing consent/);
    expect(JSON.stringify(proposal.proposal)).not.toContain("@");
    expect(redactedPacketIsStrict(proposal.proposal)).toBe(true);
    const withName = structuredClone(proposal.proposal) as typeof proposal.proposal & { name?: string };
    withName.name = "Ada Lovelace";
    expect(redactedPacketIsStrict(withName)).toBe(false);
    expect(IDENTITY_REMOVAL_GUIDANCE).toMatch(/Filling is not an entry/);
    expect(IDENTITY_REMOVAL_GUIDANCE).toMatch(/Post-contest unsubscribe, removal, and rechecks are Fortress/);
    expect(IDENTITY_REMOVAL_GUIDANCE).toMatch(/does not send those letters/);
    expect(IDENTITY_REMOVAL_GUIDANCE).toMatch(/not delivered or acknowledged/);
    expect(IDENTITY_REMOVAL_ASK).toMatch(/do not send a removal from Prize Scout/);
    expect(updateSessionProfile(defaultProfile(), { dateOfBirth: "2000-01-01", address: "1 Main", ssn: "123-45-6789" }).ok).toBe(false);
  });
});

describe("preparation handoff", () => {
  const prep = {
    observation: "form_prepared" as const,
    observedAt: NOW.toISOString(),
    contest: readyContest(),
    fieldTypes: ["email"] as const,
    emailSupplied: "unknown" as const,
    phoneSupplied: "unknown" as const,
    aliasApproved: false,
  };

  it("does not deliver a handoff when pairing is unpaired", () => {
    const attempt = handoffAfterPreparation(unpairedFortress(), prep);
    expect(attempt).toMatchObject({ created: false, delivered: false, acknowledged: false, status: "not_sent" });
    expect(describeHandoffAttempt(attempt)).toMatch(/nothing was delivered or acknowledged/i);
    expect(describeHandoffAttempt(attempt)).toMatch(/Post-contest cleanup stays with Fortress/);
  });

  it("prepares a redacted unverified handoff only for an acknowledged enabled lane", () => {
    const pairing = unpairedFortress();
    pairing.email = { linked: true, handoffEnabled: true, recipientAcknowledged: true };
    const attempt = handoffAfterPreparation(pairing, prep);
    expect(attempt.created).toBe(true);
    if (!attempt.created) return;
    expect(attempt.delivered).toBe(false);
    expect(attempt.acknowledged).toBe(false);
    expect(attempt.status).toBe("unverified");
    expect(attempt.lanes).toEqual(["email"]);
    expect(attempt.handoff.observation).toBe("form_prepared");
    expect(attempt.handoff.fieldTypes).toEqual(["email"]);
    expect(attempt.handoff.personalData).toBeNull();
    expect(JSON.stringify(attempt.handoff)).not.toContain("@");
    expect(JSON.stringify(attempt.handoff)).not.toMatch(/ssn|password/i);
    const leaked = handoffAfterPreparation(pairing, { ...prep, fieldTypes: ["ada@example.com"] });
    expect(leaked).toMatchObject({ created: false, reason: "redaction_refused", delivered: false });
  });
});

describe("cleanup row", () => {
  it("stays unavailable while Fortress is unpaired and explains the paired case without sending", () => {
    const unpaired = cleanupRowState(unpairedFortress());
    expect(unpaired.available).toBe(false);
    expect(unpaired.condition).toBe("Requires connected Fortress bots.");
    expect(unpaired.detail).toMatch(/does not send these itself/);
    expect(unpaired.detail).toMatch(/does not bypass that approval or guarantee removal/);
    const pairing = unpairedFortress();
    pairing.email = { linked: true, handoffEnabled: true, recipientAcknowledged: true };
    const paired = cleanupRowState(pairing);
    expect(paired.available).toBe(true);
    expect(paired.condition).toMatch(/Prize Scout still does not send these/);
    expect(paired.detail).toBe(unpaired.detail);
    expect(contrastRatio(CLEANUP_DISABLED_TEXT, CLEANUP_DISABLED_BG)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("page check", () => {
  it("fetches html only when robots and the address allow it", async () => {
    expect(ipIsBlocked("127.0.0.1")).toBe(true);
    expect(ipIsBlocked("93.184.216.34")).toBe(false);
    expect(hostIsBlocked("localhost")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /secret\n", "/secret")).toMatchObject({ allowed: false });
    expect(robotsAllows("User-agent: *\nDisallow: /secret\n", "/enter")).toMatchObject({ allowed: true });

    const calls: string[] = [];
    const ok = await checkOfficialPage("https://example.com/enter", {
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/robots.txt")) return new Response("missing", { status: 404 });
        return new Response(READY_HTML, { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.contest.readiness).toBe("form_checked");
      expect(ok.proof.ready).toBe(true);
      expect(ok.message).toContain("Nothing was submitted");
    }

    const blocked = await checkOfficialPage("https://example.com/secret", {
      now: () => NOW,
      lookupImpl: async () => ["10.1.1.1"],
      fetchImpl: async () => new Response("no"),
    });
    expect(blocked.ok).toBe(false);

    const disallowed = await checkOfficialPage("https://example.com/secret", {
      now: () => NOW,
      lookupImpl: async () => ["93.184.216.34"],
      fetchImpl: async () => new Response("User-agent: *\nDisallow: /\n", { status: 200, headers: { "content-type": "text/plain" } }),
    });
    expect(disallowed.ok).toBe(false);
    expect(calls.some((url) => url.endsWith("/enter"))).toBe(true);
  });
});
