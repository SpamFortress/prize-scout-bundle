"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  buildFortressProposal,
  describeHandoffAttempt,
  FORTRESS_DRAFT_NOTICE,
  handoffAfterPreparation,
  unpairedFortress,
  type FortressProposal,
} from "@/domain/fortress";
import {
  defaultProfile,
  updateSessionProfile,
  type SessionProfile,
} from "@/domain/profile";
import { createSavedSearch, type SavedSearch } from "@/domain/saved";
import { rememberObservedContest } from "@/domain/search-requests";
import {
  addSavedContest,
  beginPermittedFill,
  removeSavedContest,
  recordLocalEntry,
  requestAutofill,
  runAutomationCheckpoint,
  runRulesCheckpoint,
  type PreparationEvidence,
  type SelectedEntry,
  type TrackedEntry,
} from "@/domain/selected";
import type { Contest, RuleProof, Source } from "@/domain/types";

interface ScoutValue {
  profile: SessionProfile;
  contests: Contest[];
  proofs: RuleProof[];
  saved: SavedSearch[];
  savedContests: SelectedEntry[];
  entries: TrackedEntry[];
  fortress: FortressProposal | null;
  notice: string | null;
  clearNotice: () => void;
  patchProfile: (patch: unknown) => void;
  prepareFortressDraft: () => void;
  rememberCheck: (contest: Contest, proof: RuleProof, requestId?: string | null) => void;
  saveSearch: (query: string, sources: readonly Source[], region: string) => void;
  removeSaved: (id: string) => void;
  saveContest: (contestId: string) => void;
  unsaveContest: (contestId: string) => void;
  runRules: (contestId: string) => void;
  runAutomation: (contestId: string) => void;
  requestFill: (contestId: string) => void;
  beginEntry: (contestId: string) => void;
  recordEntry: (contestId: string) => void;
  removeEntry: (id: string) => void;
}

const ScoutContext = createContext<ScoutValue | null>(null);

export function ScoutProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<SessionProfile>(defaultProfile);
  const [contests, setContests] = useState<Contest[]>([]);
  const [proofs, setProofs] = useState<RuleProof[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [savedContests, setSavedContests] = useState<SelectedEntry[]>([]);
  const [preparations, setPreparations] = useState<PreparationEvidence[]>([]);
  const [entries, setEntries] = useState<TrackedEntry[]>([]);
  const [fortress, setFortress] = useState<FortressProposal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const value = useMemo<ScoutValue>(() => {
    const patchProfile = (patch: unknown) => {
      const result = updateSessionProfile(profile, patch);
      if (!result.ok) {
        setNotice(result.errors.join(" "));
        return;
      }
      setProfile(result.profile);
      setNotice(null);
    };

    return {
      profile,
      contests,
      proofs,
      saved,
      savedContests,
      entries,
      fortress,
      notice,
      clearNotice: () => setNotice(null),
      patchProfile,
      prepareFortressDraft: () => {
        const contest = savedContests.find((item) => item.contest.readiness === "form_checked")?.contest ?? null;
        const result = buildFortressProposal(true, contest, new Date());
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setFortress(result.proposal);
        const drafted = updateSessionProfile(profile, { fortressDraftPrepared: true });
        if (drafted.ok) setProfile({ ...drafted.profile, fortressConnected: false });
        setNotice(FORTRESS_DRAFT_NOTICE);
      },
      rememberCheck: (contest, proof, requestId) => {
        setContests((current) => {
          const existing = current.find((item) => item.id === contest.id);
          const stamped = rememberObservedContest(existing, contest, requestId ?? null);
          return [stamped, ...current.filter((item) => item.id !== contest.id)];
        });
        setProofs((current) => [proof, ...current]);
        setNotice(null);
      },
      saveSearch: (query, sources, region) => {
        const result = createSavedSearch({ query, sources, region }, new Date());
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setSaved((current) => [result.saved, ...current]);
        setNotice("Search saved in this tab only. It does not include your profile, and it will disappear when you close the tab.");
      },
      removeSaved: (id) => setSaved((current) => current.filter((item) => item.id !== id)),
      saveContest: (contestId) => {
        const contest = contests.find((item) => item.id === contestId);
        if (!contest) return;
        const result = addSavedContest(savedContests, preparations, contest, new Date());
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setSavedContests(result.saved);
        setPreparations(result.preparations);
        setNotice("Saved in this tab. This is not an entry.");
      },
      unsaveContest: (contestId) => {
        const result = removeSavedContest(savedContests, preparations, contestId);
        setSavedContests(result.saved);
        setPreparations(result.preparations);
        setNotice("Removed from Saved. Entries were not changed.");
      },
      runRules: (contestId) => {
        setSavedContests((current) =>
          current.map((item) =>
            item.contestId === contestId
              ? runRulesCheckpoint(item, { country: profile.country, state: profile.state, age: profile.age }, new Date())
              : item,
          ),
        );
      },
      runAutomation: (contestId) => {
        setSavedContests((current) =>
          current.map((item) => (item.contestId === contestId ? runAutomationCheckpoint(item, new Date()) : item)),
        );
      },
      beginEntry: (contestId) => {
        const item = savedContests.find((entry) => entry.contestId === contestId);
        if (!item) return;
        const result = beginPermittedFill(item, { country: profile.country, state: profile.state, age: profile.age }, new Date());
        setSavedContests((current) => current.map((entry) => (entry.contestId === contestId ? result.entry : entry)));
        setNotice(result.message);
      },
      requestFill: (contestId) => {
        const item = savedContests.find((entry) => entry.contestId === contestId);
        if (!item) return;
        const result = requestAutofill(item, new Date());
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setSavedContests((current) => current.map((entry) => (entry.contestId === contestId ? result.entry : entry)));
        setNotice(preparationNotice(item.contest, new Date().toISOString()));
      },
      recordEntry: (contestId) => {
        const item = savedContests.find((entry) => entry.contestId === contestId);
        if (!item) return;
        const result = recordLocalEntry(item, new Date());
        if (!result.ok) {
          setNotice(result.error);
          return;
        }
        setEntries((current) => (current.some((entry) => entry.contestId === contestId) ? current : [result.tracked, ...current]));
        setNotice(preparationNotice(item.contest, result.tracked.recordedAt));
      },
      removeEntry: (id) => setEntries((current) => current.filter((entry) => entry.id !== id)),
    };
  }, [contests, entries, fortress, notice, preparations, profile, proofs, saved, savedContests]);

  return <ScoutContext.Provider value={value}>{children}</ScoutContext.Provider>;
}

function preparationNotice(contest: Contest, observedAt: string): string {
  const attempt = handoffAfterPreparation(unpairedFortress(), {
    observation: "form_prepared",
    observedAt,
    contest,
    fieldTypes: [],
    emailSupplied: "unknown",
    phoneSupplied: "unknown",
    aliasApproved: false,
  });
  return `Form prepared, not entered. Nothing was submitted to the sponsor. ${describeHandoffAttempt(attempt)}`;
}

export function useScout(): ScoutValue {
  const value = useContext(ScoutContext);
  if (!value) throw new Error("ScoutProvider is missing");
  return value;
}
