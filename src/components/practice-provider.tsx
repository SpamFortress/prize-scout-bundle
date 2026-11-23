"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_CHECKED, type Cost, type Order } from "@/app/design-preview/sample-data";
import { addPracticeSearch, commitPracticeSearch, parkPracticeSearch, type MethodFilter, type PracticeOrder, type PracticeScope, type PracticeSearchGroup } from "@/app/design-preview/entries-sample";
import { SAMPLE_RECEIPTS, type SampleReceipt } from "@/app/design-preview/profile-sample";
import type { EntryLogRecord, PreparedContestHandoff } from "@/domain/entry-log";
import type { Source } from "@/domain/types";
import { RESULT_PAGE_SIZE } from "@/domain/match";

export interface TabFilter {
  query: string;
  sources: Source[];
  method: MethodFilter;
  order: PracticeOrder;
  region: string;
}

const EMPTY_FILTER = (): TabFilter => ({
  query: "",
  sources: ["web", "x", "facebook", "instagram"],
  method: "all",
  order: "newest",
  region: "US",
});

interface PracticeValue {
  checked: string[];
  setChecked: (next: string[] | ((current: string[]) => string[])) => void;
  note: string;
  setNote: (note: string) => void;
  sources: Source[];
  setSources: (next: Source[] | ((current: Source[]) => Source[])) => void;
  cost: Cost;
  setCost: (cost: Cost) => void;
  order: Order;
  setOrder: (order: Order) => void;
  shown: number;
  setShown: (shown: number) => void;
  entriesPinned: string[];
  setEntriesPinned: (next: string[] | ((current: string[]) => string[])) => void;
  entriesMethod: MethodFilter;
  setEntriesMethod: (method: MethodFilter) => void;
  tabFilters: Record<PracticeScope, TabFilter>;
  setTabFilter: (scope: PracticeScope, patch: Partial<TabFilter>) => void;
  homeDraft: string;
  setHomeDraft: (query: string) => void;
  /** True on the centered front screen. The header wordmark stays hidden while this is true and the path is Home. */
  homeAtFront: boolean;
  setHomeAtFront: (value: boolean) => void;
  homeGroups: PracticeSearchGroup[];
  /** False when the query is blank. A blank search does not open the results layout. */
  commitHomeSearch: (query: string) => boolean;
  addHomeSearch: () => void;
  /** Clears the front editor and parks the open request. Stored requests and bookmarks stay. */
  prepareFront: () => void;
  /** Parks the open request without changing the editor. */
  parkHomeSearch: () => void;
  /** Sample ids whose free entry was used in this practice. Not a submission. */
  freeUsedIds: readonly string[];
  /** When the user confirmed they pressed the sponsor's Submit button. */
  enteredAt: Readonly<Record<string, string>>;
  markFreeUsed: (id: string) => void;
  /** Trimmed logs from confirmed entries. Secrets and dates of birth are refused before they are stored. */
  entryLogs: readonly EntryLogRecord[];
  /** Prepared after the end date and the notice window. Never sent. */
  preparedHandoffs: readonly PreparedContestHandoff[];
  rememberEntry: (record: EntryLogRecord, handoff: PreparedContestHandoff | null) => void;
  receipts: SampleReceipt[];
  setReceipts: (next: SampleReceipt[] | ((current: SampleReceipt[]) => SampleReceipt[])) => void;
  /** Stays empty. Save, Enter, autofill, and a receipt do not add to it. */
  confirmedEntryIds: readonly string[];
}

const PracticeContext = createContext<PracticeValue | null>(null);

export function PracticeProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState<string[]>(DEFAULT_CHECKED);
  const [note, setNote] = useState("Sample list only. These controls do not search or submit.");
  const [sources, setSources] = useState<Source[]>(["web", "x", "facebook", "instagram"]);
  const [cost, setCost] = useState<Cost>("all");
  const [order, setOrder] = useState<Order>("newest");
  const [shown, setShown] = useState(RESULT_PAGE_SIZE);
  const [entriesPinned, setEntriesPinned] = useState<string[]>(["chair"]);
  const [entriesMethod, setEntriesMethod] = useState<MethodFilter>("all");
  const [tabFilters, setTabFilters] = useState<Record<PracticeScope, TabFilter>>({
    home: EMPTY_FILTER(),
    saved: EMPTY_FILTER(),
    entries: EMPTY_FILTER(),
  });
  const [homeDraft, setHomeDraft] = useState("");
  const [homeAtFront, setHomeAtFront] = useState(true);
  const [homeGroups, setHomeGroups] = useState<PracticeSearchGroup[]>([]);
  const [homeSeq, setHomeSeq] = useState(1);
  const [freeUsedIds, setFreeUsedIds] = useState<string[]>([]);
  const [enteredAt, setEnteredAt] = useState<Record<string, string>>({});
  const [entryLogs, setEntryLogs] = useState<EntryLogRecord[]>([]);
  const [preparedHandoffs, setPreparedHandoffs] = useState<PreparedContestHandoff[]>([]);
  const [receipts, setReceipts] = useState<SampleReceipt[]>(SAMPLE_RECEIPTS);
  const value = useMemo<PracticeValue>(
    () => ({
      checked,
      setChecked,
      note,
      setNote,
      sources,
      setSources,
      cost,
      setCost,
      order,
      setOrder,
      shown,
      setShown,
      entriesPinned,
      setEntriesPinned,
      entriesMethod,
      setEntriesMethod,
      tabFilters,
      setTabFilter: (scope, patch) => setTabFilters((current) => ({ ...current, [scope]: { ...current[scope], ...patch } })),
      homeDraft,
      setHomeDraft,
      homeAtFront,
      setHomeAtFront,
      homeGroups,
      commitHomeSearch: (query) => {
        const next = commitPracticeSearch(homeGroups, query, `sample-request-${homeSeq}`);
        if (!next) return false;
        if (next.length !== homeGroups.length) setHomeSeq((current) => current + 1);
        setHomeGroups(next);
        setHomeDraft(query.trim());
        setHomeAtFront(false);
        return true;
      },
      addHomeSearch: () => {
        const next = addPracticeSearch(homeGroups);
        if (!next.cleared) return;
        setHomeGroups(next.groups);
        setHomeDraft("");
      },
      prepareFront: () => {
        setHomeGroups((current) => parkPracticeSearch(current));
        setHomeDraft("");
        setHomeAtFront(true);
      },
      parkHomeSearch: () => setHomeGroups((current) => parkPracticeSearch(current)),
      freeUsedIds,
      enteredAt,
      markFreeUsed: (id) => {
        setFreeUsedIds((current) => (current.includes(id) ? current : [...current, id]));
        setEnteredAt((current) => (current[id] ? current : { ...current, [id]: new Date().toISOString() }));
      },
      entryLogs,
      preparedHandoffs,
      rememberEntry: (record, handoff) => {
        setEntryLogs((current) => [...current, record]);
        if (handoff) setPreparedHandoffs((current) => [...current, handoff]);
      },
      receipts,
      setReceipts,
      confirmedEntryIds: [],
    }),
    [checked, note, sources, cost, order, shown, entriesPinned, entriesMethod, tabFilters, homeDraft, homeAtFront, homeGroups, homeSeq, freeUsedIds, enteredAt, entryLogs, preparedHandoffs, receipts],
  );
  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePracticeOptional(): PracticeValue | null {
  return useContext(PracticeContext);
}
