"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePracticeOptional } from "@/components/practice-provider";
import { useScout } from "@/components/scout-provider";
import { cautionForUrl, watchedSourceFor } from "@/config/watched-sources";
import { prefillBookmarklet, prefillClipboard, SAMPLE_PREFILL_CARD } from "@/domain/prefill";
import { endTagLabel, formatAddonEnd, formatObservedEnd, parseDueDate } from "@/domain/dates";
import { STATE_TAX_SLOTS } from "@/domain/us-states";
import { Button } from "@/components/ui/button";
import { ASSUMED_ZONE_NOTE, entryClockLabel, isDailyClock, nextEligibleAt } from "@/domain/entry-clock";
import { PERSONAL_EMAIL_WARNING, taggedEmail } from "@/domain/entry-email";
import { ASSUMED_NOTICE_DAYS, entryLogRecord, prepareContestHandoff, type EntryLogRecord, type PreparedContestHandoff } from "@/domain/entry-log";
import { entryTaxLine } from "@/domain/entry-tax";
import type { CalendarContest } from "@/domain/calendar-ics";
import { AddToCalendarButton, ExportAllCalendarButton } from "@/components/calendar-actions";
import { CheckedByYouMark } from "@/components/checked-by-you";

function prizeYearOf(end: string | undefined): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(end ?? "");
  return match ? Number(match[1]) : null;
}

function calendarFromSample(item: EntrySample): CalendarContest {
  return {
    uid: item.id,
    title: item.title,
    url: item.url,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(item.end) ? item.end : null,
    endTime: null,
    timeZone: item.rulesTimeZone?.iana ?? null,
    entryClock: item.entryClock ?? "unstated",
    enteredAt: null,
  };
}
import { applyLiveFilters, LIVE_SOURCES, OPEN_LIVE_FILTERS, type LiveFilterState } from "@/domain/live-filters";
import { bucketRows } from "@/config/results-view";
import { PAUSE_LINE } from "@/domain/usage";
import { mailCardLayoutFixture } from "@/domain/rules-facts";
import type { VerifiedPracticeRow } from "@/domain/verified-entry";
import { MailInPrintCard } from "@/components/mail-card";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Dialog, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import {
  AFFORD_HEADING,
  AFFORD_LINK,
  compareExamples,
  ENTRY_SAMPLES,
  EXAMPLE_OPTIONS,
  PRACTICE_ROWS,
  filterPracticeRows,
  matchesEntryMethod,
  enterCaption,
  enterMode,
  fetchedPageLabel,
  applyAddonOverlay,
  sampleFromVerified,
  rulesReading,
  PAID_CAPTION,
  PRACTICE_REGIONS,
  SHOW_PRACTICE_REGION,
  currentEntrySide,
  presentEntry,
  DONE_CAPTION,
  waitingCaption,
  entryAction,
  illustrativeTax,
  parseBudget,
  PROVISIONAL_NOTE,
  SAMPLE_AS_OF,
  SEARCH_DISCLAIMER,
  TAX_SCENARIO,
  type CompareMode,
  type EntrySample,
  type MethodFilter,
  type PracticeScope,
  type RankedOption,
} from "./entries-sample";
import type { Source } from "@/domain/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HOVER_MS = 1000;
const ROW_GRID = "sm:grid-cols-[2.25rem_7.5rem_minmax(0,1fr)_23.75rem_8.5rem]";

function endLines(isoDate: string): string[] {
  const column = formatObservedEnd(parseDueDate(isoDate), SAMPLE_AS_OF);
  return column.relativeLine ? [column.dateLine, column.relativeLine] : [column.dateLine];
}

function TipLine({ tip }: { tip: { url: string; searchesPerDollar: number } | null }) {
  if (!tip) return null;
  return (
    <p className="mt-10 text-center text-xs text-[#70757a]" data-tip-footer="yes">
      $1 keeps {tip.searchesPerDollar} searches running ·{" "}
      <a href={tip.url} className="underline" target="_blank" rel="noreferrer">
        Tip on Ko-fi
      </a>
    </p>
  );
}

function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function EntriesPreview({ onBack, scope, front = false }: { onBack?: () => void; scope?: PracticeScope; front?: boolean }) {
  const practice = usePracticeOptional();
  const profile = useScout().profile;
  const profileState = profile.state;
  const router = useRouter();
  const frontPrepared = useRef(false);
  const [localPinned, setLocalPinned] = useState<string[]>(["chair"]);
  const [localFreeUsed, setLocalFreeUsed] = useState<string[]>([]);
  const [localMethod, setLocalMethod] = useState<MethodFilter>("all");
  const pinned = practice ? practice.entriesPinned : localPinned;
  const setPinned = practice ? practice.setEntriesPinned : setLocalPinned;
  const tab = scope && practice ? practice.tabFilters[scope] : null;
  const method = tab ? tab.method : practice ? practice.entriesMethod : localMethod;
  const setMethod = (next: MethodFilter) => {
    if (scope && practice) practice.setTabFilter(scope, { method: next });
    else if (practice) practice.setEntriesMethod(next);
    else setLocalMethod(next);
  };
  const [notice, setNotice] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [slide, setSlide] = useState<number | null>(null);
  const [affordFocus, setAffordFocus] = useState(false);
  const [stateChoice, setStateChoice] = useState("sample");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("lowest");
  const [budgetRaw, setBudgetRaw] = useState("");
  const [mailId, setMailId] = useState<string | null>(null);
  const [prefillTarget, setPrefillTarget] = useState<EntrySample | null>(null);
  const [emailChoice, setEmailChoice] = useState<"dedicated" | "fortress" | "personal">("dedicated");
  const [plusRejected, setPlusRejected] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [localLogs, setLocalLogs] = useState<EntryLogRecord[]>([]);
  const [localHandoffs, setLocalHandoffs] = useState<PreparedContestHandoff[]>([]);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);
  const [liveRows, setLiveRows] = useState<EntrySample[]>([]);
  const [liveFilters, setLiveFilters] = useState<LiveFilterState>(OPEN_LIVE_FILTERS);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPaused, setSearchPaused] = useState(false);
  const [tip, setTip] = useState<{ url: string; searchesPerDollar: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [addonChecks, setAddonChecks] = useState<Record<string, { checkedByYou?: boolean; listingGroup?: string; rulesNote?: string; addonVersion?: string; endIso?: string | null; openRulesUrl?: string | null }>>({});

  const freeUsedIds = practice?.freeUsedIds ?? localFreeUsed;
  const samples = (scope ? PRACTICE_ROWS : ENTRY_SAMPLES).map((item) => presentEntry(item, freeUsedIds));
  const verifiedRows = scope === "home" ? liveRows.map((item) => {
    const next = presentEntry(item, freeUsedIds);
    return applyAddonOverlay(next, addonChecks[next.url]);
  }) : [];
  const filteredLive = applyLiveFilters(
    verifiedRows.map((item) => ({ ...item, mailIn: item.mailIn === true || Boolean(item.mailAmoe), daily: isDailyClock(item.entryClock), instantWin: item.instantWin === true })),
    liveFilters,
    new Date(),
  );
  const catalog = [...verifiedRows, ...samples];
  const visible = tab && scope && practice
    ? filterPracticeRows(catalog, { scope, savedIds: practice.checked, query: tab.query, sources: tab.sources, method: tab.method, order: tab.order, region: tab.region })
    : catalog.filter((item) => matchesEntryMethod(item, method) && (scope !== "entries" || item.tracked !== false));
  const pinnedRows = visible.filter((item) => pinned.includes(item.id));
  const otherRows = visible.filter((item) => !pinned.includes(item.id));
  const open = catalog.find((item) => item.id === openId) ?? null;
  const mail = catalog.find((item) => item.id === mailId) ?? null;

  useEffect(() => {
    if (!openId || !affordFocus) return;
    const timer = window.setTimeout(() => {
      document.getElementById("afford-panel")?.scrollIntoView({ block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openId, affordFocus]);

  function togglePin(id: string) {
    setPinned((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setNotice("Sample pin updated in this practice only. Pinning is not an entry.");
  }

  function paidManual() {
    setNotice("Practice only. Paid filling, checkout, and purchase did not run. The entry count was not changed.");
  }

  function handleEnter(item: EntrySample) {
    const mode = enterMode(item);
    if (mode !== "prefill") {
      window.open(item.url, "_blank", "noopener,noreferrer");
      setNotice(
        mode === "open_only"
          ? "This host does not allow automated access. The page was opened. Nothing was filled or submitted."
          : "The official page was opened. Paid entries and unreadable forms are not filled. Nothing was submitted.",
      );
      return;
    }
    window.open(item.url, "_blank", "noopener,noreferrer");
    setPrefillTarget(item);
  }

  function toggleSave(id: string) {
    if (!practice) return;
    const saved = practice.checked.includes(id);
    practice.setChecked((current) => (saved ? current.filter((item) => item !== id) : [...current, id]));
    setNotice(saved ? "Sample bookmark removed. It was not an entry." : "Sample bookmarked. Saving is not an entry.");
  }

  function openDetails(id: string, focusAfford = false) {
    setAffordFocus(focusAfford);
    setOpenId(id);
  }

  const homeGroups = scope === "home" && practice ? practice.homeGroups : [];
  const homeLanding = scope === "home" && (front || homeGroups.length === 0);
  const homeResults = scope === "home" && !front && homeGroups.length > 0;

  useEffect(() => {
    if (scope !== "home" || !practice) return;
    if (practice.homeAtFront === homeLanding) return;
    practice.setHomeAtFront(homeLanding);
  }, [scope, homeLanding, practice]);

  useEffect(() => {
    if (!front || !practice) {
      frontPrepared.current = false;
      return;
    }
    if (frontPrepared.current) return;
    frontPrepared.current = true;
    practice.parkHomeSearch();
  }, [front, practice]);
  const listedIds = [...(homeLanding ? [] : homeResults ? [] : visible), ...verifiedRows].map((item) => item.id).join("\n");
  const liveQueryKey = homeGroups.map((group) => group.query).join("\n");
  useEffect(() => {
    if (scope !== "home") return;
    let cancelled = false;
    fetch("/api/tip")
      .then((response) => response.json())
      .then((body: { url?: string | null; searchesPerDollar?: number }) => {
        if (cancelled || !body.url) return;
        setTip({ url: body.url, searchesPerDollar: body.searchesPerDollar ?? 0 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scope]);
  async function collectSearch(queries: string[], offset: number): Promise<{ rows: EntrySample[]; paused: boolean; nextOffset: number | null }> {
    const next: EntrySample[] = [];
    let paused = false;
    let more: number | null = null;
    for (const query of queries) {
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, offset }),
        });
        const body = (await response.json()) as { listings?: VerifiedPracticeRow[]; paused?: boolean; nextOffset?: number | null };
        if (body.paused) paused = true;
        else {
          for (const listing of body.listings ?? []) next.push(sampleFromVerified(listing));
          if (typeof body.nextOffset === "number") more = body.nextOffset;
        }
      } catch {
        paused = true;
      }
    }
    return { rows: next, paused, nextOffset: paused ? null : more };
  }

  useEffect(() => {
    let stop = false;
    fetch("/api/addon/checks")
      .then((response) => response.json())
        .then((body: { ok?: boolean; checks?: Array<{ url: string; checkedByYou?: boolean; listingGroup?: string; rulesNote?: string; addonVersion?: string; endIso?: string | null; openRulesUrl?: string | null }> }) => {
        if (stop || !body.ok) return;
        const next: Record<string, { checkedByYou?: boolean; listingGroup?: string; rulesNote?: string; addonVersion?: string; endIso?: string | null; openRulesUrl?: string | null }> = {};
        for (const check of body.checks ?? []) next[check.url] = check;
        setAddonChecks(next);
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [liveRows]);

  useEffect(() => {
    if (scope !== "home") return;
    let cancelled = false;
    const queries = liveQueryKey ? liveQueryKey.split("\n") : [];
    if (queries.length === 0) {
      setLiveRows([]);
      setSearchPaused(false);
      setNextOffset(null);
      return;
    }
    (async () => {
      const collected = await collectSearch(queries, 0);
      if (cancelled) return;
      setSearchPaused(collected.paused);
      setNextOffset(collected.nextOffset);
      setLiveRows(collected.paused ? [] : collected.rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, liveQueryKey]);
  useEffect(() => {
    if (!openId) return;
    if (!listedIds.split("\n").includes(openId)) setOpenId(null);
  }, [openId, listedIds]);
  const entryBase = emailChoice === "dedicated" ? profile.dedicatedEmail || SAMPLE_PREFILL_CARD.email : aliasDraft.trim();
  const entryEmail = taggedEmail(entryBase, prefillTarget?.title || "sponsor", plusRejected);
  const bookmarklet = prefillBookmarklet({ ...SAMPLE_PREFILL_CARD, email: entryEmail.email });
  useEffect(() => {
    bookmarkletRef.current?.setAttribute("href", bookmarklet);
  }, [bookmarklet, prefillTarget]);

  if (homeLanding && practice) {
    return (
      <main className="px-4" data-practice-home="initial">
        <form
          className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[584px] flex-col items-center justify-center"
          onSubmit={(event) => {
            event.preventDefault();
            const typed = new FormData(event.currentTarget).get("query");
            const query = typeof typed === "string" ? typed : practice.homeDraft;
            if (!practice.commitHomeSearch(query)) {
              setNotice("A blank search is not run.");
              return;
            }
            if (front) router.replace("/practice");
          }}
        >
          <h1 className="mb-8 cursor-default text-center text-[56px] font-normal tracking-tight text-[#202124]">Prize Scout</h1>
          <Input
            name="query"
            value={practice.homeDraft}
            onChange={(event) => practice.setHomeDraft(event.target.value)}
            placeholder="I want to win…"
            aria-label="I want to win…"
            className="h-12 w-full rounded-full border-[#dfe1e5] bg-white px-5 text-base shadow-[0_1px_6px_rgba(32,33,36,0.16)] placeholder:text-[#9aa0a6] md:text-base"
          />
          <p data-search-disclaimer className="mt-3 text-center text-xs leading-5 text-[#70757a]">
            {SEARCH_DISCLAIMER}
          </p>
          <Button type="submit" variant="ghost" className="mt-5 h-9 rounded-md px-4 text-sm font-normal text-[#3c4043]">
            Search
          </Button>
          <TipLine tip={tip} />
          {notice === "A blank search is not run." ? (
            <p className="mt-2 text-center text-sm text-[#3c4043]" role="status">
              {notice}
            </p>
          ) : null}
        </form>
      </main>
    );
  }

  const keptLogs = practice?.entryLogs ?? localLogs;
  const keptHandoffs = practice?.preparedHandoffs ?? localHandoffs;

  return (
    <div data-entries-preview="sample" data-practice-home={homeResults ? "results" : undefined} data-entry-logs={keptLogs.length} data-prepared-handoffs={keptHandoffs.length}>
      {scope ? null : (
        <p className="bg-[#fef7e0] px-4 py-3 text-sm font-medium text-[#202124]">
          DESIGN PREVIEW — sample Entries. Not your Entries tab. Not live results. Nothing here is a discovered contest, a genuine entry, or a submission.
        </p>
      )}
      {homeResults && practice && tab ? (
        <form
          className="border-b border-[#ebebeb] px-4 pt-20 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            const typed = new FormData(event.currentTarget).get("query");
            const query = typeof typed === "string" ? typed : practice.homeDraft;
            if (!practice.commitHomeSearch(query)) setNotice("A blank search is not run.");
          }}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                name="query"
                value={practice.homeDraft}
                onChange={(event) => practice.setHomeDraft(event.target.value)}
                placeholder="I want to win…"
                aria-label="I want to win…"
                className="h-10 rounded-full border-[#dfe1e5] bg-white px-4 text-sm shadow-none placeholder:text-[#9aa0a6] md:text-sm"
              />
              <Button type="submit" className="h-10 rounded-full px-5">
                Search
              </Button>
              <Button type="button" variant="outline" className="h-10 rounded-full px-5" onClick={() => practice.addHomeSearch()}>
                Add search
              </Button>
            </div>
          <p data-search-disclaimer className="mx-auto mt-2 max-w-5xl text-xs leading-5 text-[#70757a]">
            {SEARCH_DISCLAIMER}
          </p>
          <div className="mx-auto max-w-5xl">
            <PracticeToolbar tab={tab} showQuery={false} onChange={(patch) => practice.setTabFilter("home", patch)} />
            <LiveResultFilters
              filters={liveFilters}
              hidden={filteredLive.hidden}
              onChange={setLiveFilters}
              onClear={() => setLiveFilters(OPEN_LIVE_FILTERS)}
            />
          </div>
        </form>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-normal text-[#202124]">{scope === "saved" ? "Saved" : "Entries"}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {scope === "saved" || scope === "entries" ? <ExportAllCalendarButton items={visible.map(calendarFromSample)} /> : null}
            {scope === "saved" && practice ? (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirmRemove(true)}>
                Remove all
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {homeResults || !notice ? null : (
        <p className="mt-4 text-sm text-[#3c4043]" role="status">
          {notice}
        </p>
      )}
      {tab && scope && practice && !homeResults ? (
        <PracticeToolbar
          tab={tab}
          onChange={(patch) => practice.setTabFilter(scope, patch)}
          queryPlaceholder={scope === "saved" ? "Search saved giveaways…" : "Search your entries…"}
        />
      ) : null}
      {homeResults ? null : <div className="mt-2"><MethodPills method={method} setMethod={setMethod} /></div>}

      {homeResults ? (
        <div className="mx-auto max-w-5xl px-4 pb-16">
          {notice ? (
            <p className="mt-4 text-sm text-[#3c4043]" role="status">
              {notice}
            </p>
          ) : null}
          {searchPaused ? (
            <p className="mt-8 text-sm text-[#3c4043]" data-search-paused="yes">
              {PAUSE_LINE}
            </p>
          ) : null}
          {filteredLive.shown.length > 0 ? (
            <SearchResultLists items={filteredLive.shown} profileState={profileState} enteredAtFor={(id) => practice?.enteredAt[id] ?? null} onOpen={(id) => openDetails(id)} onEnter={handleEnter} onPaid={paidManual} />
          ) : null}
          {nextOffset !== null && !searchPaused ? (
            <button
              type="button"
              className="mt-8 h-10 rounded-full border border-[#dadce0] bg-white px-5 text-sm text-[#202124]"
              disabled={loadingMore}
              onClick={async () => {
                const queries = liveQueryKey ? liveQueryKey.split("\n") : [];
                if (queries.length === 0) return;
                setLoadingMore(true);
                const collected = await collectSearch(queries, nextOffset);
                setLoadingMore(false);
                setSearchPaused(collected.paused);
                setNextOffset(collected.nextOffset);
                if (collected.paused) {
                  setLiveRows([]);
                  return;
                }
                setLiveRows((current) => {
                  const seen = new Set(current.map((item) => item.id));
                  return [...current, ...collected.rows.filter((item) => !seen.has(item.id))];
                });
              }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
          <TipLine tip={tip} />
        </div>
      ) : null}

      {homeResults ? null : pinnedRows.length > 0 ? (
        <section className="mt-6" aria-labelledby="pinned-heading" data-entries-section="pinned">
          <h2 id="pinned-heading" className="text-xl font-normal text-[#202124]">
            Pinned
          </h2>
          <ul className="mt-2">
            {pinnedRows.map((item) => (
              <li key={item.id}>
                <EntrySampleRow item={item} stateChoice={stateChoice} pinned shared={Boolean(scope)} showPin={scope !== "home"} showCount={scope !== "home" && scope !== "saved"} showCalendar={scope === "saved" || scope === "entries"} saveChecked={practice?.checked.includes(item.id)} onSave={scope && scope !== "entries" && practice ? () => toggleSave(item.id) : undefined} onPin={() => togglePin(item.id)} onOpen={() => openDetails(item.id)} onTaxes={() => openDetails(item.id, true)} onEnter={() => handleEnter(item)} onPaid={paidManual} onCompare={() => setCompareOpen(true)} onMail={() => setMailId(item.id)} onZoom={() => setSlide(0)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!homeResults && otherRows.length > 0 ? (
        <section className="mt-8" aria-labelledby="other-heading" data-entries-section="other">
          <h2 id="other-heading" className="text-xl font-normal text-[#202124]">
            Other samples
          </h2>
          <ul className="mt-2">
            {otherRows.map((item) => (
              <li key={item.id}>
                <EntrySampleRow item={item} stateChoice={stateChoice} pinned={false} shared={Boolean(scope)} showPin={scope !== "home"} showCount={scope !== "home" && scope !== "saved"} showCalendar={scope === "saved" || scope === "entries"} saveChecked={practice?.checked.includes(item.id)} onSave={scope && scope !== "entries" && practice ? () => toggleSave(item.id) : undefined} onPin={() => togglePin(item.id)} onOpen={() => openDetails(item.id)} onTaxes={() => openDetails(item.id, true)} onEnter={() => handleEnter(item)} onPaid={paidManual} onCompare={() => setCompareOpen(true)} onMail={() => setMailId(item.id)} onZoom={() => setSlide(0)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!homeResults && visible.length === 0 ? <p className="mt-6 text-sm text-[#3c4043]">No sample entries match this method.</p> : null}

      {onBack ? (
        <Button type="button" variant="ghost" className="mt-8 text-[#1a73e8]" onClick={onBack}>
          Back to sample results
        </Button>
      ) : null}

      <Dialog open={open !== null} onOpenChange={(next) => { if (!next && slide !== null) return; if (!next) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" style={{ backgroundColor: "#ffffff", color: "#202124", opacity: 1, animation: "none" }} aria-describedby={undefined}>
          {open ? (
            <>
              <DialogTitle className="pr-8 text-xl font-normal text-[#1a0dab]">{open.title}</DialogTitle>
              <DialogDescription className="text-xs leading-5 text-[#70757a]">Illustration only. Not a discovered contest and not a genuine entry.</DialogDescription>
              <IllustrationGallery onOpen={setSlide} />
              <section>
                <h3 className="text-base font-medium text-[#202124]">The prize</h3>
                <p className="mt-1 text-sm leading-6">{open.prize}</p>
                <p className="mt-2">Prize value: {open.priceLabel ?? "Not stated"}</p>
              </section>
              {cautionForUrl(open.url, profileState) ? (
                <p data-source-caution className="text-sm leading-6 text-[#3c4043]">
                  {cautionForUrl(open.url, profileState)}
                </p>
              ) : null}
              <section data-rules-reading="yes">
                <h3 className="text-base font-medium text-[#202124]">Rules reading</h3>
                <dl className="mt-1 grid gap-1 text-sm leading-6">
                  {rulesReading(open).map((line) => (
                    <div key={line.label}>
                      <dt className="inline font-medium">{line.label}: </dt>
                      <dd className="inline">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-[#202124]">Entry history</summary>
                <ul className="mt-1 list-disc pl-5 text-sm leading-6">
                  {open.history.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
              <p className="text-sm">
                Official sample page:{" "}
                <a href={open.url} className="text-[#1a0dab] underline decoration-[#1a0dab] underline-offset-2" target="_blank" rel="noreferrer">
                  {open.url}
                </a>
              </p>
              <p className="text-xs leading-5 text-[#70757a]">Last checked 01/10/2027. This preview cannot verify that date. No page was checked.</p>
              <p className="text-xs leading-5 text-[#70757a]">A receipt for your own records is not stored here. A later Profile note could hold one. Nothing is sent on.</p>
              <div className="flex flex-wrap gap-2 sm:hidden">
                {scope || open.kind === "mixed" ? <OutlineButton onClick={() => { setOpenId(null); setCompareOpen(true); }}>Compare</OutlineButton> : null}
                {open.mailIn || open.kind === "mixed" ? <OutlineButton onClick={() => { setOpenId(null); setMailId(open.id); }}>Mail-in</OutlineButton> : null}
              </div>
              <AffordPanel item={open} stateChoice={stateChoice} onState={setStateChoice} />
              <Button type="button" variant="outline" className="w-fit rounded-full" onClick={() => setOpenId(null)}>
                Close details
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <IllustrationLightbox index={slide} onIndex={setSlide} />

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" style={{ backgroundColor: "#ffffff", color: "#202124", opacity: 1, animation: "none" }}>
          <DialogTitle className="pr-8 text-xl font-normal">Compare example options</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#3c4043]">
            A real comparison runs only when you ask. These are example options with a stated quantity and price, not entries you already own. This preview does not scan a site, check continuously, or estimate odds of winning.
          </DialogDescription>
          <div role="group" aria-label="Compare mode" className="flex flex-wrap gap-2">
            {(
              [
                ["lowest", "Lowest cost"],
                ["budget", "Within your budget"],
                ["value", "Best value"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={compareMode === id} className="h-8 rounded-full border border-[#dadce0] px-3 text-sm" style={{ backgroundColor: compareMode === id ? "#e8f0fe" : "#ffffff", color: "#202124" }} onClick={() => setCompareMode(id)}>
                {label}
              </button>
            ))}
          </div>
          {compareMode === "budget" ? (
            <>
              <label className="block text-sm text-[#202124]">
                Budget
                <input value={budgetRaw} onChange={(event) => setBudgetRaw(event.target.value)} inputMode="decimal" aria-describedby="sample-budget-help" className="mt-1 block h-9 w-36 rounded-md border border-[#dadce0] px-2" />
              </label>
              <p id="sample-budget-help" className="text-xs leading-5 text-[#70757a]">
                Plain dollars for the all-in total you know. Not connected to a bank.
              </p>
            </>
          ) : null}
          <CompareResults mode={compareMode} budgetRaw={budgetRaw} />
          <Button type="button" variant="outline" className="w-fit rounded-full" onClick={() => setCompareOpen(false)}>
            Close compare
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={prefillTarget !== null} onOpenChange={(next) => { if (!next) setPrefillTarget(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" style={{ backgroundColor: "#ffffff", color: "#202124", opacity: 1, animation: "none" }} aria-describedby={undefined}>
          <DialogTitle className="pr-8 text-xl font-normal">Filling out your entry…</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#3c4043]">
            The sponsor page opens in a new tab. Prize Scout cannot type into that site from here. Drag the bookmarklet onto the sponsor page, or copy the fields and paste them. Then press the sponsor&apos;s Submit button yourself. Prize Scout does not click Submit, solve a captcha, rotate an IP, or follow a social account.
          </DialogDescription>
          <fieldset className="space-y-1 text-sm">
            <legend>Entry email</legend>
            <label className="flex gap-2"><input type="radio" name="entry-email" checked={emailChoice === "dedicated"} onChange={() => setEmailChoice("dedicated")} /> Dedicated contest address</label>
            <label className="flex gap-2"><input type="radio" name="entry-email" checked={emailChoice === "fortress"} onChange={() => setEmailChoice("fortress")} /> Fortress alias</label>
            <label className="flex gap-2"><input type="radio" name="entry-email" checked={emailChoice === "personal"} onChange={() => setEmailChoice("personal")} /> Personal email</label>
            {emailChoice === "personal" ? <p data-personal-email-warning className="text-xs text-[#8a4b08]">{PERSONAL_EMAIL_WARNING}</p> : null}
            {emailChoice !== "dedicated" ? (
              <input aria-label="Alias for this entry" className="h-9 w-full rounded-full border border-[#dadce0] px-3" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} />
            ) : null}
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={plusRejected} onChange={(event) => setPlusRejected(event.target.checked)} /> This form rejects plus addresses</label>
            {entryEmail.note ? <p data-plus-fallback className="text-xs text-[#3c4043]">{entryEmail.note}</p> : null}
            {entryEmail.email ? <p data-tagged-email className="text-xs text-[#3c4043]">This sponsor: {entryEmail.email}</p> : null}
          </fieldset>
          <a
            ref={(node) => {
              bookmarkletRef.current = node;
              if (node) node.setAttribute("href", bookmarklet);
            }}
            data-prefill-bookmarklet
            className="inline-flex h-9 items-center rounded-full border border-[#dadce0] px-3 text-sm text-[#174ea6]"
          >
            Prize Scout prefill
          </a>
          <p className="text-xs leading-5 text-[#70757a]">A bookmarklet fills inputs it can see. It misses closed shadow roots, cross-origin iframes, and captcha widgets. Name, phone, street, and date of birth are not saved in Profile.</p>
          <button
            type="button"
            className="text-sm text-[#174ea6] underline"
            onClick={() => {
              void navigator.clipboard?.writeText(prefillClipboard({ ...SAMPLE_PREFILL_CARD, email: entryEmail.email }));
              setNotice("Entry fields copied. Nothing was submitted.");
            }}
          >
            Copy fields
          </button>
          <pre className="overflow-x-auto rounded-md bg-[#f8f9fa] p-3 text-xs">{prefillClipboard({ ...SAMPLE_PREFILL_CARD, email: entryEmail.email })}</pre>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                if (!prefillTarget) return;
                if (practice) practice.markFreeUsed(prefillTarget.id);
                else setLocalFreeUsed((current) => (current.includes(prefillTarget.id) ? current : [...current, prefillTarget.id]));
                const contestUrl = prefillTarget.url.startsWith("https://") ? prefillTarget.url : "";
                const saved = entryLogRecord({
                  sponsor: prefillTarget.title,
                  contestUrl,
                  entryDate: new Date().toISOString().slice(0, 10),
                  aliasOrTag: entryEmail.email,
                  rulesUrl: prefillTarget.rulesUrl && prefillTarget.rulesUrl.startsWith("https://") ? prefillTarget.rulesUrl : null,
                  endDate: /^\d{4}-\d{2}-\d{2}$/.test(prefillTarget.end) ? prefillTarget.end : null,
                });
                if (saved.ok) {
                  const handoff = prepareContestHandoff(saved.record, new Date(), prefillTarget.winnerNotice?.days ?? ASSUMED_NOTICE_DAYS);
                  if (practice) practice.rememberEntry(saved.record, handoff);
                  else {
                    setLocalLogs((current) => [...current, saved.record]);
                    if (handoff) setLocalHandoffs((current) => [...current, handoff]);
                  }
                }
                setNotice(saved.ok
                  ? "Entered. You confirmed the sponsor submit. Prize Scout did not press it."
                  : saved.reason);
                setPrefillTarget(null);
              }}
            >
              I submitted on the sponsor page
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setPrefillTarget(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent className="sm:max-w-md" style={{ backgroundColor: "#ffffff", color: "#202124", opacity: 1, animation: "none" }}>
          <DialogTitle className="pr-8 text-xl font-normal">Remove all saved samples?</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-[#3c4043]">
            This clears Saved in this practice. It does not delete a contest from a sponsor.
          </DialogDescription>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                practice?.setChecked([]);
                setNotice("Saved samples cleared in this practice. Nothing was deleted from a sponsor.");
                setConfirmRemove(false);
              }}
            >
              Remove all
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mail !== null} onOpenChange={(next) => { if (!next) setMailId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" style={{ backgroundColor: "#ffffff", color: "#202124", opacity: 1, animation: "none" }}>
          {mail ? (
            <>
              <DialogTitle className="pr-8 text-xl font-normal">Mail-in</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-[#3c4043]">
                Not every giveaway offers mail-in. {mail.liveVerified ? "The address below was read from the fetched rules." : "This sample has no official mailing address. A card is not filled with a made-up address."}
              </DialogDescription>
              <p className="text-sm leading-6">This preview does not print a filled card, connect, or prepare an entry.</p>
              <MailInPrintCard
                addressLines={mail.mailCard?.addressLines ?? null}
                requiredFields={mail.mailCard?.requiredFields ?? []}
                emptyNote="Mailing address was not read from an official rules page."
              />
              <details className="text-sm leading-6">
                <summary className="cursor-pointer font-medium">Preview the card when rules include an address</summary>
                <p className="mt-2 text-xs leading-5 text-[#3c4043]">Layout preview from rules text stored in this app. Not a sponsor and not a listing. The lines stay blank for you to write at print time.</p>
                <div className="mt-2">
                  <MailInPrintCard addressLines={mailCardLayoutFixture()?.addressLines ?? null} requiredFields={mailCardLayoutFixture()?.requiredFields ?? []} />
                </div>
              </details>
              <Button type="button" variant="outline" className="w-fit rounded-full" onClick={() => setMailId(null)}>
                Close mail-in
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LiveResultFilters({
  filters,
  hidden,
  onChange,
  onClear,
}: {
  filters: LiveFilterState;
  hidden: number;
  onChange: (next: LiveFilterState) => void;
  onClear: () => void;
}) {
  const pill = "h-8 rounded-full border px-3 text-sm";
  const on = "border-[#202124] bg-[#f1f3f4] font-medium";
  const off = "border-[#dadce0] bg-white font-normal";
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Result filters">
        <button type="button" aria-pressed={filters.freeOnly} className={`${pill} ${filters.freeOnly ? on : off}`} onClick={() => onChange({ ...filters, freeOnly: !filters.freeOnly })}>
          Free only
        </button>
        <button type="button" aria-pressed={filters.eligibility} className={`${pill} ${filters.eligibility ? on : off}`} onClick={() => onChange({ ...filters, eligibility: !filters.eligibility })}>
          United States eligibility
        </button>
        <button type="button" aria-pressed={filters.endsSoon} className={`${pill} ${filters.endsSoon ? on : off}`} onClick={() => onChange({ ...filters, endsSoon: !filters.endsSoon })}>
          Ending soon
        </button>
        <button type="button" aria-pressed={filters.instantWin} className={`${pill} ${filters.instantWin ? on : off}`} onClick={() => onChange({ ...filters, instantWin: !filters.instantWin })}>
          Instant win
        </button>
        <button type="button" aria-pressed={filters.mailIn} className={`${pill} ${filters.mailIn ? on : off}`} onClick={() => onChange({ ...filters, mailIn: !filters.mailIn })}>
          Mail-in
        </button>
        <button type="button" aria-pressed={filters.daily} className={`${pill} ${filters.daily ? on : off}`} onClick={() => onChange({ ...filters, daily: !filters.daily })}>
          Daily
        </button>
        {LIVE_SOURCES.map((source) => {
          const selected = filters.sources.includes(source);
          const label = source === "web" ? "Web" : source === "x" ? "X" : source === "facebook" ? "Facebook" : "Instagram";
          return (
            <button
              key={source}
              type="button"
              aria-pressed={selected}
              className={`${pill} ${selected ? on : off}`}
              onClick={() => onChange({ ...filters, sources: selected ? filters.sources.filter((item) => item !== source) : [...filters.sources, source] })}
            >
              {label}
            </button>
          );
        })}
      </div>
      {hidden > 0 ? (
        <p className="mt-3 text-sm text-[#3c4043]" data-filters-hidden={hidden}>
          {hidden} hidden by filters{" "}
          <button type="button" className="font-medium text-[#174ea6] underline" onClick={onClear}>
            Clear filters
          </button>
        </p>
      ) : null}
    </div>
  );
}

function MethodPills({ method, setMethod }: { method: MethodFilter; setMethod: (next: MethodFilter) => void }) {
  return (
    <div role="group" aria-label="Entry method" className="mt-4 flex flex-wrap gap-2">
      {(
        [
          ["all", "All"],
          ["free", "Free"],
          ["paid", "Paid"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={method === value}
          className={`h-8 rounded-full border px-3 text-sm ${method === value ? "border-[#202124] bg-[#f1f3f4] font-medium underline decoration-[#202124] underline-offset-4" : "border-[#dadce0] bg-white font-normal"}`}
          onClick={() => setMethod(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PracticeToolbar({
  tab,
  onChange,
  showQuery = true,
  queryPlaceholder = "I want to win…",
}: {
  tab: { query: string; sources: Source[]; method: MethodFilter; order: "newest" | "oldest" | "ending-soonest" | "ending-latest"; region: string };
  onChange: (patch: Partial<typeof tab>) => void;
  showQuery?: boolean;
  queryPlaceholder?: string;
}) {
  return (
    <div className="mt-4" data-practice-toolbar="yes">
      {showQuery ? (
        <Input
          value={tab.query}
          placeholder={queryPlaceholder}
          aria-label={queryPlaceholder}
          className="h-11 max-w-md rounded-full px-4"
          onChange={(event) => onChange({ query: event.target.value })}
        />
      ) : null}
      <div className="mt-3 flex flex-wrap gap-3 text-sm" role="group" aria-label="Sample sources">
        {(["web", "x", "facebook", "instagram"] as const).map((source) => (
          <Label key={source} className="gap-2 font-normal">
            <Checkbox
              aria-label={source === "web" ? "Web" : source === "x" ? "X" : source === "facebook" ? "Facebook" : "Instagram"}
              checked={tab.sources.includes(source)}
              onCheckedChange={(checked) => {
                const next = new Set(tab.sources);
                if (checked) next.add(source);
                else next.delete(source);
                onChange({ sources: [...next] });
              }}
            />
            {source === "web" ? "Web" : source === "x" ? "X" : source === "facebook" ? "Facebook" : "Instagram"}
          </Label>
        ))}
      </div>
      {SHOW_PRACTICE_REGION ? (
        <label className="mt-3 block text-sm text-[#202124]">
          Region
          <select
            aria-label="Region"
            value={tab.region}
            className="mt-1 block h-9 rounded-md border border-[#dadce0] bg-white px-2"
            onChange={(event) => onChange({ region: event.target.value })}
          >
            {PRACTICE_REGIONS.map((region) => (
              <option key={region.code} value={region.code}>
                {region.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs leading-5 text-[#3c4043]">More regions in a later update.</span>
        </label>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div role="group" aria-label="Added time" className="flex items-center gap-1">
          <span>Added:</span>
          {(
            [
              ["newest", "Newest"],
              ["oldest", "Oldest"],
            ] as const
          ).map(([value, label]) => (
            <Button key={value} type="button" variant={tab.order === value ? "default" : "ghost"} className="h-7 rounded-full px-2.5 text-sm font-normal" aria-pressed={tab.order === value} onClick={() => onChange({ order: value })}>
              {label}
            </Button>
          ))}
        </div>
        <div role="group" aria-label="Closing time" className="flex items-center gap-1">
          <span>Ends:</span>
          {(
            [
              ["ending-soonest", "Soon"],
              ["ending-latest", "Later"],
            ] as const
          ).map(([value, label]) => (
            <Button key={value} type="button" variant={tab.order === value ? "default" : "ghost"} className="h-7 rounded-full px-2.5 text-sm font-normal" aria-pressed={tab.order === value} onClick={() => onChange({ order: value })}>
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function siteHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SearchResultLists({
  items,
  profileState,
  enteredAtFor,
  onOpen,
  onEnter,
  onPaid,
}: {
  items: EntrySample[];
  profileState: string | null;
  enteredAtFor: (id: string) => string | null;
  onOpen: (id: string) => void;
  onEnter: (item: EntrySample) => void;
  onPaid: () => void;
}) {
  const buckets = bucketRows(items);
  const anyVerified = items.some((item) => item.listingGroup === "verified");
  return (
    <>
      {anyVerified ? null : <p className="mt-4 text-sm text-[#3c4043]" data-no-verified="yes">No verified giveaways in this search.</p>}
      {buckets.main.length > 0 ? (
        <ul className="mt-4" data-live-results="list">
          {buckets.main.map((item) => (
            <li key={item.id}>
              <LiveResultRow item={item} profileState={profileState} enteredAt={enteredAtFor(item.id)} onOpen={() => onOpen(item.id)} onEnter={() => onEnter(item)} onPaid={onPaid} />
            </li>
          ))}
        </ul>
      ) : null}
      <CollapsedRows title="Needs checking" rows={buckets.needsChecking} profileState={profileState} enteredAtFor={enteredAtFor} onOpen={onOpen} onEnter={onEnter} onPaid={onPaid} />
      <CollapsedRows title="Paid entries" rows={buckets.paid} profileState={profileState} enteredAtFor={enteredAtFor} onOpen={onOpen} onEnter={onEnter} onPaid={onPaid} />
      <CollapsedRows title="Related pages" rows={buckets.related} profileState={profileState} enteredAtFor={enteredAtFor} onOpen={onOpen} onEnter={onEnter} onPaid={onPaid} />
    </>
  );
}

function CollapsedRows({
  title,
  rows,
  profileState,
  enteredAtFor,
  onOpen,
  onEnter,
  onPaid,
}: {
  title: string;
  rows: EntrySample[];
  profileState: string | null;
  enteredAtFor: (id: string) => string | null;
  onOpen: (id: string) => void;
  onEnter: (item: EntrySample) => void;
  onPaid: () => void;
}) {
  if (rows.length === 0) return null;
  return (
    <details className="mt-6" data-result-section={title}>
      <summary className="cursor-pointer text-sm text-[#3c4043]">{title} ({rows.length})</summary>
      <ul className="mt-2">
        {rows.map((item) => (
          <li key={item.id}>
            <LiveResultRow item={item} profileState={profileState} enteredAt={enteredAtFor(item.id)} onOpen={() => onOpen(item.id)} onEnter={() => onEnter(item)} onPaid={onPaid} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function LiveResultRow({
  item,
  profileState,
  onOpen,
  onEnter,
  onPaid,
  enteredAt = null,
}: {
  item: EntrySample;
  profileState: string | null;
  enteredAt?: string | null;
  onOpen: () => void;
  onEnter: () => void;
  onPaid: () => void;
}) {
  const paid = item.purchaseEntry === true || (item.methods ?? []).includes("paid");
  const free = !paid && (item.methods ?? []).includes("free");
  const action = entryAction(item);
  const caption = enterCaption(item);
  const automatic = action === "enter" && caption.startsWith("Prefill");
  const endLabel = item.end ? endTagLabel(item.end, new Date()) : null;
  const ended = endLabel?.startsWith("Ended") === true;
  const source = watchedSourceFor(item.url);
  const closed = Boolean(profileState && (source?.stateCautions[profileState] || (item.excludedStates ?? []).includes(profileState)));
  const pill = "rounded-full px-2 py-0.5 text-xs";
  const clockLabel = entryClockLabel(item.entryClock ?? "unstated");
  const nextEntry = nextEligibleAt(item.entryClock ?? "unstated", enteredAt ? new Date(enteredAt) : null, item.rulesTimeZone);
  const mailLine = item.mailAmoe
    ? [
        item.mailAmoe.addressLines.join(", "),
        item.mailAmoe.cardSize ? `Card: ${item.mailAmoe.cardSize}` : "",
        item.mailAmoe.postmarkBy ? `Postmark by ${item.mailAmoe.postmarkBy}` : "",
        item.mailAmoe.receivedBy ? `Received by ${item.mailAmoe.receivedBy}` : "",
        item.mailAmoe.entryLimit ?? "",
      ].filter((part) => part.length > 0).join(" · ")
    : "";
  return (
    <article data-live-result={item.url} className="flex items-start gap-4 border-b border-[#ebebeb] py-4">
      {item.imageUrl ? (
        // The fetched page supplied this https image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="size-16 shrink-0 rounded object-cover sm:size-20" />
      ) : null}
      <div className="min-w-0 flex-1">
        <a href={item.url} className="text-xl text-[#1a0dab] hover:underline" target="_blank" rel="noreferrer">
          {item.title}
        </a>
        <p className="text-sm text-[#202124]">{siteHost(item.url)}</p>
        {item.snippet ? <p className="mt-1 text-sm leading-5 text-[#4d5156]">{item.snippet}</p> : null}
        <a href={item.url} data-result-url={item.url} className="mt-0.5 block truncate text-sm text-[#006621] hover:underline" target="_blank" rel="noreferrer">
          {item.url}
        </a>
        <p className="mt-2 flex flex-wrap gap-1">
          {free ? <span data-method-badge="free" className={`${pill} bg-[#e6f4ea] text-[#137333]`}>Free</span> : null}
          {paid ? <span data-method-badge="paid" className={`${pill} bg-[#fff4e5] text-[#8a4b08]`}>Paid</span> : null}
          {item.freeMethodLabel ? <span data-free-method className={`${pill} bg-[#f1f3f4] text-[#3c4043]`}>{item.freeMethodLabel}</span> : null}
          {item.ageTag ? <span data-age-tag className={`${pill} bg-[#f1f3f4] text-[#3c4043]`}>{item.ageTag}</span> : null}
          {item.dealerPickup ? <span data-dealer-tag className={`${pill} bg-[#f1f3f4] text-[#3c4043]`}>Dealer pickup</span> : null}
          {item.cashNotes?.map((note) => (
            <span key={note.label} data-cash-note={note.tone} className={note.tone === "positive" ? `${pill} bg-[#e6f4ea] text-[#137333]` : `${pill} bg-[#f1f3f4] text-[#3c4043]`}>
              {note.label}
            </span>
          ))}
          {endLabel ? <span data-end-tag data-end-state={ended ? "ended" : "open"} className={`${pill} bg-[#f1f3f4] text-[#3c4043]`}>{endLabel}</span> : null}
          {closed ? <span data-region-tag className={`${pill} bg-[#f1f3f4] text-[#3c4043]`}>Not open in your state</span> : null}
          {item.liveVerified && !item.rulesScanSkipped ? (
            item.rulesFoundCount == null ? (
              <span data-rules-check="missing" className={`${pill} bg-[#f1f3f4] text-[#3c4043]`}>Rules not found</span>
            ) : (
              <span data-rules-check={item.rulesFoundCount} className={item.rulesFoundCount >= 6 ? `${pill} bg-[#e6f4ea] text-[#137333]` : `${pill} bg-[#f1f3f4] text-[#3c4043]`}>
                Rules checked {item.rulesFoundCount}/7
              </span>
            )
          ) : null}
          {(item.scamPhrases ?? []).length > 0 ? <span data-scam-warning className={`${pill} bg-[#fff4e5] text-[#8a4b08]`}>Scam warning</span> : null}
          {item.checkedByYou ? <CheckedByYouMark /> : null}
        </p>
        {item.rulesNote ? <p data-rules-note className="mt-1 text-sm leading-5 text-[#3c4043]">{item.rulesNote}</p> : null}
        {item.addonChecked && formatAddonEnd(item.end) ? <p data-addon-end className="mt-1 text-sm leading-5 text-[#3c4043]">{formatAddonEnd(item.end)}</p> : null}
        {item.addonChecked && item.rulesUrl ? (
          <a data-open-rules href={item.rulesUrl} className="mt-1 block text-sm text-[#1a0dab] underline" target="_blank" rel="noreferrer">
            Open rules
          </a>
        ) : null}
        {item.addonVersion ? <p data-addon-version className="mt-1 text-xs leading-4 text-[#3c4043]">Add-on v{item.addonVersion}</p> : null}
        <label className="mt-2 block text-xs text-[#3c4043]">
          Paste rules text
          <textarea data-paste-rules={item.url} className="mt-1 block w-full rounded border border-[#dadce0] p-2 text-xs" rows={4} placeholder="Paste the official rules here" />
          <button
            type="button"
            className="mt-1 rounded-full border border-[#dadce0] px-3 py-1 text-xs"
            onClick={(event) => {
              const box = event.currentTarget.parentElement?.querySelector("textarea");
              const text = box && "value" in box ? String(box.value) : "";
              void fetch("/api/addon/rules-text", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url: item.url, text }),
              });
            }}
          >
            Use pasted rules
          </button>
        </label>
        <label className="mt-2 block text-xs text-[#3c4043]">
          Upload rules PDF
          <input
            data-rules-pdf={item.url}
            className="mt-1 block text-xs"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const body = new FormData();
              body.set("url", item.url);
              body.set("file", file);
              void fetch("/api/addon/rules-upload", { method: "POST", body });
            }}
          />
        </label>
        {item.lastChecked ? <p data-last-checked className="mt-1 text-xs leading-4 text-[#3c4043]">Last checked {item.lastChecked}</p> : null}
        {mailLine ? <p data-mail-amoe className="mt-1 text-xs leading-4 text-[#3c4043]">{mailLine}</p> : null}
        {clockLabel ? (
          <p data-entry-clock={item.entryClock} className="mt-1 text-xs leading-4 text-[#3c4043]">
            {clockLabel}
            {nextEntry ? `. Next entry ${nextEntry.at.toLocaleString(undefined, { timeZoneName: "short" })}. Reminder ${nextEntry.at.toLocaleString(undefined, { timeZoneName: "short" })}.` : ""}
            {nextEntry?.note ? ` ${ASSUMED_ZONE_NOTE}` : ""}
          </p>
        ) : null}
        {item.unreadDirectory ? (
          <p data-directory-disclaimer className="mt-1 text-xs leading-4 text-[#3c4043]">
            Prize Scout can&apos;t read this site automatically. Open it to browse.
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {automatic ? (
            <button type="button" data-entry-pill className="enter-oval focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]" onClick={onEnter}>
              Enter
              <span className="sr-only"> {caption}</span>
            </button>
          ) : null}
          {action === "paid" ? (
            <button type="button" data-entry-pill className="inline-flex h-9 items-center gap-1 rounded-full border-2 border-[#8a4b08] bg-[#fff4e5] px-3 text-sm font-medium text-[#8a4b08]" onClick={onPaid}>
              <span aria-hidden="true">$</span>
              Paid
            </button>
          ) : null}
          <button type="button" className="text-sm text-[#174ea6] underline" onClick={onOpen}>
            Details
          </button>
        </div>
      </div>
    </article>
  );
}

function EntrySampleRow({
  item,
  pinned,
  shared = false,
  showPin = true,
  showCount = true,
  saveChecked = false,
  onSave,
  onPin,
  onOpen,
  onTaxes,
  onEnter,
  onPaid,
  onCompare,
  onMail,
  onZoom,
  stateChoice,
  showCalendar = false,
}: {
  item: EntrySample;
  pinned: boolean;
  shared?: boolean;
  showPin?: boolean;
  showCount?: boolean;
  showCalendar?: boolean;
  saveChecked?: boolean;
  stateChoice: string;
  onSave?: () => void;
  onPin: () => void;
  onOpen: () => void;
  onTaxes: () => void;
  onEnter: () => void;
  onPaid: () => void;
  onCompare: () => void;
  onMail: () => void;
  onZoom?: () => void;
}) {
  const dates = endLines(item.end);
  const hover = useRef<number | null>(null);
  const mounted = useRef(true);
  function clearHover() {
    if (hover.current !== null) {
      window.clearTimeout(hover.current);
      hover.current = null;
    }
  }
  function scheduleHover() {
    clearHover();
    hover.current = window.setTimeout(() => {
      hover.current = null;
      if (mounted.current) onOpen();
    }, HOVER_MS);
  }
  useEffect(() => {
    mounted.current = true;
    window.addEventListener("scroll", clearHover, true);
    window.addEventListener("wheel", clearHover, { capture: true, passive: true });
    return () => {
      mounted.current = false;
      window.removeEventListener("scroll", clearHover, true);
      window.removeEventListener("wheel", clearHover, true);
      clearHover();
    };
  }, []);
  const profileState = useScout().profile.state;
  const caution = cautionForUrl(item.url, profileState) ?? item.caution ?? null;
  const action = entryAction(item);
  const showMail = Boolean(item.mailIn) || item.kind === "mixed";
  const showCompare = shared || item.kind === "mixed";
  const side = currentEntrySide(item);
  const caption = enterCaption(item);
  const tax = entryTaxLine({ arvUsd: item.arvUsd ?? null, arvKind: item.arvKind ?? "unstated", stateChoice, prizeYear: prizeYearOf(item.end) });
  const clickHelp = caption.startsWith("Prefill")
    ? "Prefill opens the sponsor page and can fill the free form. You press the sponsor's Submit button. Prize Scout does not submit."
    : caption === "Needs you"
      ? "This entry is not filled. Paid entries and pages without a readable free form stay manual."
      : "This host does not allow automated access. The page opens and nothing is filled.";
  return (
    <article data-entry-id={item.id} className={`grid grid-cols-[2.25rem_7.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 border-b border-[#ebebeb] py-4 ${ROW_GRID}`}>
      <div className="flex h-[120px] flex-col items-center justify-center gap-2">
        {showPin ? (
          <button type="button" className="flex size-9 items-center justify-center rounded-full border border-[#dadce0] text-lg text-[#174ea6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a73e8]" aria-pressed={pinned} onClick={onPin}>
            <span aria-hidden="true">{pinned ? "★" : "☆"}</span>
            <span className="sr-only">{pinned ? `Unpin ${item.title}` : `Pin ${item.title}`}</span>
          </button>
        ) : null}
        {onSave ? <Checkbox checked={saveChecked} aria-label={`Save contest ${item.title}`} onCheckedChange={onSave} /> : null}
      </div>
      <button type="button" className="flex size-[120px] items-center justify-center bg-[#e8eaed] text-center text-xs text-[#3c4043]" aria-label={`Enlarge illustration for ${item.title}`} onClick={onZoom}>
        Illustration
      </button>
      <div className="min-w-0">
        <span
          role="button"
          tabIndex={0}
          data-hover-target="title"
          className="m-0 inline cursor-pointer border-0 bg-transparent p-0 text-left text-xl text-[#1a0dab] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a73e8]"
          style={{ display: "inline", width: "auto", padding: 0 }}
          onMouseEnter={scheduleHover}
          onMouseLeave={clearHover}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen();
            }
          }}
        >
          {item.title}
        </span>
        <p className="mt-1 flex flex-wrap gap-1">
          {side === "free" ? <span data-method-badge="free" className="rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs text-[#137333]">Free</span> : null}
          {side === "paid" ? <span data-method-badge="paid" className="rounded-full bg-[#fff4e5] px-2 py-0.5 text-xs text-[#8a4b08]">Paid</span> : null}
          {side === "unknown" ? <span className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-xs text-[#3c4043]">Cost not stated</span> : null}
          {item.ageTag ? <span data-age-tag className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-xs text-[#3c4043]">{item.ageTag}</span> : null}
          {item.dealerPickup ? <span data-dealer-tag className="rounded-full bg-[#f1f3f4] px-2 py-0.5 text-xs text-[#3c4043]">Dealer pickup</span> : null}
        </p>
        {item.freeMethodLabel ? <p data-free-method className="mt-1 text-xs leading-4 text-[#3c4043]">{item.freeMethodLabel}</p> : null}
        {caution ? <p data-source-caution className="mt-1 text-xs leading-4 text-[#8a4b08]">{caution}</p> : null}
        {item.cashNotes?.map((note) =>
          note.tone === "positive" ? (
            <p key={note.label} data-cash-note={note.tone} className="mt-1 inline-flex rounded-full bg-[#e6f4ea] px-2 py-0.5 text-xs text-[#137333]">
              {note.label}
            </p>
          ) : (
            <p key={note.label} data-cash-note={note.tone} className="mt-1 text-xs leading-4 text-[#3c4043]">
              {note.label}
            </p>
          ),
        )}
        <p className="mt-1 text-sm leading-5 text-[#3c4043]">{item.status}</p>
        <a href={item.url} data-result-url={item.url} className="mt-0.5 block truncate text-sm text-[#006621] hover:underline" target="_blank" rel="noreferrer">
          {item.url}
        </a>
        {item.foundVia ? (
          <p data-found-via className="text-xs leading-4 text-[#3c4043]">
            Via {item.foundVia}
          </p>
        ) : null}
        {item.unreadDirectory ? (
          <p data-directory-disclaimer className="mt-1 text-xs leading-4 text-[#3c4043]">
            Prize Scout can&apos;t read this site automatically. Open it to browse.
          </p>
        ) : null}
        <p className="text-xs leading-4 text-[#3c4043]">{fetchedPageLabel(item)}</p>
        <button type="button" className="mt-1 block py-1 text-left text-sm font-medium text-[#174ea6] underline decoration-[#174ea6] underline-offset-2" onClick={onTaxes}>
          {AFFORD_LINK}
        </button>
        <p data-form-1099 className="mt-1 text-xs leading-5 text-[#3c4043]">{tax.reporting}</p>
        {showCalendar ? <AddToCalendarButton item={calendarFromSample(item)} /> : null}
        <div className="mt-1 text-sm leading-5 text-[#202124] sm:hidden">
          {dates.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <div className="col-span-3 flex flex-wrap items-center justify-end gap-3 sm:col-span-1 sm:grid sm:w-[23.75rem] sm:grid-cols-[5.75rem_6.25rem_5.5rem_4.75rem] sm:items-center sm:justify-items-center sm:gap-x-2">
        {showCount ? <CountBlock item={item} /> : <div className="hidden w-[5.75rem] sm:block" aria-hidden="true" />}
        <div className="relative flex flex-col items-center justify-center">
          {action === "tomorrow" ? <p data-entry-pill className="text-center text-xs leading-4 text-[#3c4043]">{waitingCaption(item)}</p> : null}
          {action === "done" ? <p data-entry-pill className="text-center text-xs leading-4 text-[#3c4043]">{DONE_CAPTION}</p> : null}
          {action === "unavailable" ? <p data-entry-pill className="text-center text-xs leading-4 text-[#3c4043]">Entry cost was not stated</p> : null}
          {action === "enter" ? (
            <>
              <button type="button" data-entry-pill className="enter-oval focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]" title={clickHelp} onClick={onEnter}>
                Enter
              </button>
              <p className="mt-1 max-w-[9rem] text-center text-[11px] leading-4 text-[#3c4043] sm:absolute sm:top-full sm:left-1/2 sm:mt-1 sm:w-max sm:max-w-none sm:-translate-x-1/2" title={clickHelp}>
                {caption}
                <span className="sr-only"> {clickHelp}</span>
              </p>
            </>
          ) : null}
          {action === "paid" ? (
            <>
              <button type="button" data-entry-pill className="inline-flex h-9 items-center gap-1 rounded-full border-2 border-[#8a4b08] bg-[#fff4e5] px-3 text-sm font-medium text-[#8a4b08]" title="Paid does not fill a form, check out, or purchase." onClick={onPaid}>
                <span aria-hidden="true">$</span>
                Paid
              </button>
              <p className="mt-1 text-center text-[11px] leading-4 text-[#8a4b08] sm:absolute sm:top-full sm:left-1/2 sm:mt-1 sm:w-max sm:-translate-x-1/2" title="Paid does not fill a form, check out, or purchase.">
                {PAID_CAPTION}
                <span className="sr-only"> This does not fill a form, check out, or purchase.</span>
              </p>
            </>
          ) : null}
        </div>
        <div className="hidden justify-center sm:flex">
          {showCompare ? <OutlineButton onClick={onCompare}>Compare</OutlineButton> : null}
        </div>
        <div className="hidden justify-center sm:flex">
          {showMail ? <OutlineButton onClick={onMail}>Mail-in</OutlineButton> : null}
        </div>
      </div>
      <div data-entry-date={item.id} className="hidden text-right text-sm leading-5 text-[#202124] sm:block">
        {dates.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {tax.short ? (
        <p data-tax-estimate className="col-span-full text-right text-[11px] leading-4 text-[#3c4043]" title={tax.detail}>
          {tax.short}
        </p>
      ) : null}
    </article>
  );
}

function CountBlock({ item }: { item: EntrySample }) {
  return (
    <div data-entry-count={item.id} className="w-[5.75rem] shrink-0 rounded-md border border-[#dadce0] px-2 py-1.5 text-center sm:w-full">
      <p className="text-[10px] font-medium tracking-wide text-[#70757a]">Sample record</p>
      <p className="text-[10px] font-medium tracking-wide text-[#70757a]">Entries</p>
      <p className="text-sm text-[#202124]">{item.countText}</p>
      <p className="text-[10px] text-[#3c4043]">{item.countKind === "confirmed" ? "Confirmed" : "Estimated"}</p>
      {item.spend ? (
        <>
          <p className="mt-1 text-[10px] font-medium tracking-wide text-[#70757a]">Sample spend</p>
          <p className="text-sm text-[#202124]">{item.spend}</p>
        </>
      ) : null}
    </div>
  );
}

function OutlineButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex h-8 items-center rounded-full border border-[#dadce0] bg-white px-3 text-sm text-[#202124] hover:bg-[#f8f9fa]" onClick={onClick}>
      {children}
    </button>
  );
}

const SLIDES = [
  { id: "circle", label: "Circle illustration" },
  { id: "square", label: "Square illustration" },
  { id: "triangle", label: "Triangle illustration" },
] as const;

function IllustrationShape({ kind, large = false }: { kind: (typeof SLIDES)[number]["id"]; large?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={large ? "h-[min(70vh,32rem)] w-[min(70vh,32rem)]" : "size-12"} aria-hidden="true">
      {kind === "circle" ? <circle cx="60" cy="60" r="36" fill="#7ba3d4" /> : null}
      {kind === "square" ? <rect x="28" y="28" width="64" height="64" fill="#8fbf9f" /> : null}
      {kind === "triangle" ? <polygon points="60,24 100,96 20,96" fill="#d4b483" /> : null}
    </svg>
  );
}

function IllustrationGallery({ onOpen }: { onOpen: (index: number) => void }) {
  return (
    <div>
      <div className="flex gap-2">
        {SLIDES.map((slide, index) => (
          <button key={slide.id} type="button" className="flex size-16 items-center justify-center bg-[#e8eaed]" aria-label={`Enlarge ${slide.label}`} onClick={() => onOpen(index)}>
            <IllustrationShape kind={slide.id} />
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-[#70757a]">Illustration only. Not a prize photo.</p>
    </div>
  );
}

function IllustrationLightbox({ index, onIndex }: { index: number | null; onIndex: (index: number | null) => void }) {
  useEffect(() => {
    if (index === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onIndex(null);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onIndex(Math.min(SLIDES.length - 1, (index ?? 0) + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onIndex(Math.max(0, (index ?? 0) - 1));
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [index, onIndex]);
  const slide = index === null ? null : SLIDES[index];
  return (
    <Dialog open={index !== null} onOpenChange={(next) => { if (!next) onIndex(null); }}>
      <DialogPortal>
        <DialogOverlay data-lightbox="open" className="lightbox-scrim z-[80]" />
        <BaseDialog.Popup
          className="fixed top-1/2 left-1/2 z-[81] flex max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 items-center gap-3 outline-none"
        >
          {slide ? (
            <>
              <DialogTitle className="sr-only">Illustration viewer</DialogTitle>
              <button type="button" className="flex size-11 items-center justify-center rounded-full bg-white text-2xl text-[#202124] disabled:opacity-40" aria-label="Previous image" disabled={index === 0} onClick={() => onIndex((index ?? 0) - 1)}>
                ‹
              </button>
              <div className="text-center">
                <div className="flex items-center justify-center bg-[#e8eaed] p-6">
                  <IllustrationShape kind={slide.id} large />
                </div>
                <p className="mt-3 text-sm text-white" data-lightbox-count>
                  {(index ?? 0) + 1} of {SLIDES.length}
                </p>
                <p className="text-xs text-white/80">Illustration only. Not a prize photo.</p>
              </div>
              <button type="button" className="flex size-11 items-center justify-center rounded-full bg-white text-2xl text-[#202124] disabled:opacity-40" aria-label="Next image" disabled={index === SLIDES.length - 1} onClick={() => onIndex((index ?? 0) + 1)}>
                ›
              </button>
              <button type="button" className="absolute top-4 right-4 rounded-full bg-white px-3 py-1.5 text-sm text-[#202124]" onClick={() => onIndex(null)}>
                Close image
              </button>
            </>
          ) : null}
        </BaseDialog.Popup>
      </DialogPortal>
    </Dialog>
  );
}

function AffordPanel({ item, stateChoice, onState }: { item: EntrySample; stateChoice: string; onState: (value: string) => void }) {
  const tax = illustrativeTax();
  const named = stateChoice === "sample" ? "" : stateChoice;
  const official = entryTaxLine({ arvUsd: item.arvUsd ?? null, arvKind: item.arvKind ?? "unstated", stateChoice, prizeYear: prizeYearOf(item.end) });
  const sampleState = stateChoice === "sample";
  return (
    <section id="afford-panel" className="rounded-md border border-[#dadce0] px-3 py-3 text-sm leading-6">
      <h3 className="text-base font-medium text-[#202124]">{AFFORD_HEADING}</h3>
      <p className="mt-1 text-xs leading-5 text-[#3c4043]">
        A prize alone cannot determine a personal tax bill. No income, SSN, or ZIP is used. This is not a required payment before delivery.
      </p>
      <p className="mt-2 text-sm text-[#202124]" data-tax-estimate="panel" title={official.detail}>{official.primary}</p>
      <p data-form-1099 className="mt-1 text-sm leading-6 text-[#202124]">{official.reporting}</p>
      <p className="mt-1 text-xs leading-5 text-[#3c4043]">{official.detail}</p>
      <p className="mt-2 text-xs font-medium leading-5 text-[#202124]">
        State data needed before publish. Official rates are empty for all {STATE_TAX_SLOTS.length} slots (50 states and DC). The choices below are sample labels, not a state&apos;s tax.
      </p>
      <label className="mt-3 block text-sm text-[#202124]">
        State
        <select value={stateChoice} onChange={(event) => onState(event.target.value)} className="mt-1 block h-9 rounded-md border border-[#dadce0] bg-white px-2">
          <option value="sample">Sample state</option>
          <option value="California">California</option>
          <option value="New York">New York</option>
          <option value="Texas">Texas</option>
        </select>
      </label>
      {sampleState ? (
        <p className="mt-2 text-sm font-medium text-[#202124]">Sample — not a real estimate</p>
      ) : (
        <p className="mt-2 text-sm">{named}: state not estimated. The 5% line is not {named}&apos;s tax rate.</p>
      )}
      <p className="mt-3 text-sm text-[#80868b]">{item.truckExample ? "Sample illustration kept below, not a bill" : "Separate illustration, not this prize"}</p>
      {!item.truckExample ? <p className="text-xs leading-5 text-[#80868b]">The numbers are the field truck sample, not {item.title.replace(" — illustration only", "")}.</p> : null}
      <div className={`mt-2 border-t border-[#dadce0] pt-2 ${sampleState ? "text-[#80868b]" : "text-[#3c4043]"}`} data-sample-estimate={sampleState ? "muted" : "named"}>
        <AmountLine label="Field truck, sample prize" amount={money(TAX_SCENARIO.truck)} muted={sampleState} />
        <AmountLine label="Additional cash" amount={money(TAX_SCENARIO.cash)} muted={sampleState} />
        <AmountLine label="Combined taxable prize value" amount={money(tax.combined)} rule muted={sampleState} />
        <AmountLine label="Federal illustration, 25%" amount={money(tax.federalPart)} muted={sampleState} />
        <AmountLine label="State illustration, 5%" amount={money(tax.statePart)} muted={sampleState} />
        <p className="py-1 text-xs leading-5 text-[#80868b]">Those two lines are parts of the same sample illustration, not a second tax.</p>
        <AmountLine label="Estimated taxes at 30%" amount={money(tax.taxOnCombined)} rule muted={sampleState} />
        <AmountLine label="Cash award, applied once" amount={`−${money(TAX_SCENARIO.cash)}`} muted={sampleState} />
        <AmountLine label="Estimated additional cash needed" amount={money(tax.afterSubtractingCash)} rule muted={sampleState} />
      </div>
      <p className="mt-2 text-xs leading-5 text-[#80868b]">Sample — not a real estimate. Estimated additional cash needed is not an exact amount owed.</p>
      <p className="mt-2">
        <span className="font-medium">Delivery: </span>
        {item.delivery}
      </p>
    </section>
  );
}

function AmountLine({ label, amount, strong = false, rule = false, muted = false }: { label: string; amount: string; strong?: boolean; rule?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-0.5 ${rule ? "mt-1 border-t border-[#dadce0] pt-1" : ""} ${muted ? "text-[#80868b]" : ""} ${!muted && strong ? "font-medium" : ""}`}>
      <span>{label}</span>
      <span className="shrink-0 text-right tabular-nums">{amount}</span>
    </div>
  );
}

function CompareResults({ mode, budgetRaw }: { mode: CompareMode; budgetRaw: string }) {
  const view = compareExamples(mode, mode === "budget" ? parseBudget(budgetRaw) : null, EXAMPLE_OPTIONS);
  if (view.invalidBudget) return <p className="text-sm">Enter a plain dollar amount.</p>;
  if (view.needsBudget) return <p className="text-sm">Enter a budget to use this mode. Nothing is being checked.</p>;
  return (
    <div className="text-sm leading-6">
      <h3 className="font-medium">Example options</h3>
      <ul className="mt-2 space-y-3">
        {view.rows.map((row) => (
          <OptionRow key={row.id} row={row} />
        ))}
      </ul>
      {view.provisional ? <p className="mt-3 text-xs leading-5 text-[#3c4043]">{PROVISIONAL_NOTE}</p> : null}
    </div>
  );
}

function OptionRow({ row }: { row: RankedOption }) {
  const marked = row.mark === "winner" || row.mark === "tie";
  return (
    <li className="list-none">
      <p className="text-[#202124]">
        {marked ? <span aria-hidden="true">★ </span> : null}
        {row.name}
      </p>
      {row.label ? <p>{row.label}</p> : null}
      <p className="text-[#3c4043]">{row.detail}</p>
    </li>
  );
}
