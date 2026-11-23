"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildChatAsk, CHAT_LINK_LABEL, formatSourceList, normalizeSources } from "@/domain/chat";
import { formatObservedEnd } from "@/domain/dates";
import { assessEligibility } from "@/domain/eligibility";
import { filterContests, nextShownCount, RESULT_PAGE_SIZE, sortContests, visibleResults } from "@/domain/match";
import { contestIsEntryReady } from "@/domain/normalize";
import { canSaveContest } from "@/domain/selected";
import { CHAT_URL, SOURCES, type Contest, type EntryCostFilter, type RuleProof, type SortKey, type Source } from "@/domain/types";
import { COUNTRIES, countryName } from "@/domain/geo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContestDialog } from "@/components/contest-dialog";
import { ResultRow } from "@/components/result-row";
import { addSearchRequest, commitSearchRequest, linkResult, type SearchRequestGroup } from "@/domain/search-requests";
import { useScout } from "@/components/scout-provider";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<Source, string> = {
  web: "Web",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
};

function money(contest: Contest): string {
  if (!contest.prizeValue) return "Value not stated";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: contest.prizeValue.currency }).format(
      contest.prizeValue.amount,
    );
  } catch {
    return `${contest.prizeValue.amount} ${contest.prizeValue.currency}`;
  }
}

export function SearchHome() {
  const params = useSearchParams();
  const scout = useScout();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sources, setSources] = useState<Source[]>(normalizeSources((params.get("sources") ?? "").split(",")));
  const [region, setRegion] = useState(params.get("region") ?? "US");
  const [strictRegion, setStrictRegion] = useState(false);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [entryCost, setEntryCost] = useState<EntryCostFilter>("all");
  const [shown, setShown] = useState(RESULT_PAGE_SIZE);
  const [submitted, setSubmitted] = useState(params.get("run") === "1");
  const [server, setServer] = useState<"checking" | "up" | "down">("checking");
  const [pageUrl, setPageUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [groups, setGroups] = useState<SearchRequestGroup[]>([]);
  const [shownByRequest, setShownByRequest] = useState<Record<string, number>>({});
  const [groupView, setGroupView] = useState<Record<string, { sort: SortKey; entryCost: EntryCostFilter; shown: number }>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => {
        if (!cancelled) setServer(response.ok ? "up" : "down");
      })
      .catch(() => {
        if (!cancelled) setServer("down");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ask = buildChatAsk(query, sources, region);
  const social = sources.includes("facebook") || sources.includes("instagram");
  const activeGroup = groups.find((group) => group.active) ?? null;
  useEffect(() => {
    if (!activeGroup) return;
    setGroupView((current) => ({
      ...current,
      [activeGroup.id]: { sort, entryCost, shown: current[activeGroup.id]?.shown ?? RESULT_PAGE_SIZE },
    }));
  }, [activeGroup, entryCost, sort]);
  const ungrouped = useMemo(() => {
    const matched = filterContests(scout.contests.filter((contest) => contest.checkedWithoutRequest), {
      query: "",
      sources: [...SOURCES],
      region,
      strictRegion: false,
      entryCost: "all",
    });
    return sortContests(matched, "relevance", new Date());
  }, [region, scout.contests]);
  const visibleUngrouped = visibleResults(ungrouped, shown);
  const ungroupedMore = nextShownCount(ungrouped.length, shown);
  const focusOwned = activeGroup
    ? activeGroup.resultIds.flatMap((id) => {
        const contest = scout.contests.find((item) => item.id === id);
        return contest ? [contest] : [];
      })
    : ungrouped.map((row) => row.contest);
  const focusMatched = filterContests(focusOwned, {
    query: "",
    sources: [...SOURCES],
    region,
    strictRegion: false,
    entryCost,
  });
  const focusSorted = sortContests(focusMatched, sort, new Date());
  const focusVisible = visibleResults(focusSorted, activeGroup ? (shownByRequest[activeGroup.id] ?? RESULT_PAGE_SIZE) : shown);
  const saveableVisible = focusVisible.filter((row) => canSaveContest(row.contest));
  const savedIds = new Set(scout.savedContests.map((item) => item.contestId));
  const allSaved = saveableVisible.length > 0 && saveableVisible.every((row) => savedIds.has(row.contest.id));
  const someSaved = saveableVisible.some((row) => savedIds.has(row.contest.id));
  const openContest = scout.contests.find((contest) => contest.id === openId) ?? null;
  const openProof = scout.proofs.find((proof) => proof.contestId === openId) ?? null;
  const countries = Object.entries(COUNTRIES).sort((a, b) => a[1].localeCompare(b[1]));

  function toggleSource(source: Source, checked: boolean) {
    setSources((current) => {
      const next = new Set(current);
      if (checked) next.add(source);
      else next.delete(source);
      if (next.size === 0) next.add(source);
      return SOURCES.filter((item) => next.has(item));
    });
  }

  async function onCheck(event: React.FormEvent) {
    event.preventDefault();
    setChecking(true);
    setCheckMessage(null);
    try {
      const response = await fetch("/api/evidence/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: pageUrl }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
        contest?: Contest;
        proof?: RuleProof;
      };
      setCheckMessage(body.message ?? "The check did not finish. No contest was added.");
      if (body.ok && body.contest && body.proof) {
        const active = groups.find((group) => group.active);
        scout.rememberCheck(body.contest, body.proof, active?.id ?? null);
        if (active) setGroups((current) => linkResult(current, active.id, body.contest!.id));
      }
    } catch {
      setCheckMessage("The Prize Scout server did not respond. The page was not fetched and no contest was added.");
    } finally {
      setChecking(false);
    }
  }

  const filters = (
    <div className="space-y-3 text-left text-sm text-[#3c4043]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Label className="gap-2 font-normal">
          <Checkbox
            aria-label="All"
            checked={sources.length === SOURCES.length}
            onCheckedChange={(checked) => {
              setSources(checked ? [...SOURCES] : ["web"]);
              setShown(RESULT_PAGE_SIZE);
            }}
          />
          All
        </Label>
        {SOURCES.map((source) => (
          <Label key={source} className="gap-2 font-normal">
            <Checkbox
              aria-label={SOURCE_LABEL[source]}
              checked={sources.includes(source)}
              onCheckedChange={(checked) => {
                toggleSource(source, checked);
                setShown(RESULT_PAGE_SIZE);
              }}
            />
            {SOURCE_LABEL[source]}
          </Label>
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2">
          Region
          <select
            aria-label="Region bias"
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="h-9 rounded-full border border-[#dfe1e5] bg-white px-3"
          >
            {countries.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Label className="gap-2 font-normal">
          <Checkbox
            aria-label="Only pages that state this country"
            checked={strictRegion}
            onCheckedChange={(checked) => setStrictRegion(checked)}
          />
          Only pages that state this country
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Entry type">
        {(
          [
            ["all", "All entry types"],
            ["free", "Free"],
            ["paid", "Paid"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={entryCost === value ? "default" : "outline"}
            className="h-8 rounded-full px-3"
            aria-pressed={entryCost === value}
            onClick={() => {
              setEntryCost(value);
              setShown(RESULT_PAGE_SIZE);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div role="group" aria-label="Added time" className="flex items-center gap-1">
          <span className="text-[#3c4043]">Added:</span>
          {(
            [
              ["new", "Newest"],
              ["oldest", "Oldest"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={sort === value ? "default" : "ghost"}
              className="h-7 rounded-full px-2.5 text-sm font-normal"
              aria-pressed={sort === value}
              onClick={() => {
                setSort(value);
                setShown(RESULT_PAGE_SIZE);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div role="group" aria-label="Closing time" className="flex items-center gap-1">
          <span className="text-[#3c4043]">Ends:</span>
          {(
            [
              ["ending", "Soon"],
              ["ending-latest", "Later"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={sort === value ? "default" : "ghost"}
              className="h-7 rounded-full px-2.5 text-sm font-normal"
              aria-pressed={sort === value}
              onClick={() => {
                setSort(value);
                setShown(RESULT_PAGE_SIZE);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-[#3c4043]">Added is when a page joined this checked list. Ends is when it closes.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="gap-2 font-normal">
          <Checkbox
            checked={allSaved}
            indeterminate={!allSaved && someSaved}
            disabled={saveableVisible.length === 0}
            aria-label="Save all visible contests"
            aria-describedby="save-all-help"
            onCheckedChange={(checked) => {
              for (const row of saveableVisible) {
                if (checked) scout.saveContest(row.contest.id);
                else scout.unsaveContest(row.contest.id);
              }
            }}
          />
          <span className="text-sm font-medium text-[#202124]">All</span>
        </Label>
        <p id="save-all-help" className="text-xs text-[#3c4043]">
          This changes only the eligible contests shown. Hidden pages stay as they are. Saving is not an entry.
        </p>
      </div>
    </div>
  );

  const checkForm = (
    <div className="mt-6">
      <h3 className="text-base font-medium">Check an official page</h3>
      <p className="mt-1 text-sm text-[#70757a]">
        Paste the sponsor&apos;s own https entry or rules page. Prize Scout fetches that page and records only what it can see. A directory cannot be saved. Nothing is submitted. This check belongs to the request open now.
      </p>
      <form onSubmit={onCheck} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={pageUrl}
          onChange={(event) => setPageUrl(event.target.value)}
          placeholder="https://"
          aria-label="Official page URL"
          className="h-11 rounded-full px-4"
        />
        <Button type="submit" variant="outline" className="h-11 rounded-full px-5" disabled={checking}>
          {checking ? "Checking…" : "Check page"}
        </Button>
      </form>
      {checkMessage ? (
        <p className="mt-3 text-sm text-[#3c4043]" role="status">
          {checkMessage}
        </p>
      ) : null}
    </div>
  );

  if (!submitted) {
    return (
      <main className="px-4">
        <form
          className="mx-auto flex w-full max-w-[584px] flex-col items-center pt-[36vh]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!query.trim()) return;
            setGroups((current) => commitSearchRequest(current, { query, sources, region }, `req-${crypto.randomUUID()}`));
            setSubmitted(true);
          }}
        >
          <h1 className="mb-8 text-center text-[56px] font-normal tracking-tight text-[#202124]">Prize Scout</h1>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="I want to win…"
            aria-label="I want to win…"
            className="h-12 rounded-full border-[#dfe1e5] bg-white px-5 text-base shadow-[0_1px_6px_rgba(32,33,36,0.16)] placeholder:text-[#9aa0a6] md:text-base"
          />
          <Button type="submit" variant="ghost" className="mt-5 h-9 rounded-md px-4 text-sm font-normal text-[#3c4043]">
            Search
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="pt-16 pb-16">
      <form
        className="border-b border-[#ebebeb] px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!query.trim()) return;
          setGroups((current) => commitSearchRequest(current, { query, sources, region }, `req-${crypto.randomUUID()}`));
          setSubmitted(true);
          document.getElementById("chat-ask")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center">
          <h1 className="text-2xl text-[#202124]">Prize Scout</h1>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="I want to win…"
              aria-label="I want to win…"
              className="h-12 rounded-full border-[#dfe1e5] px-5 text-base shadow-[0_1px_6px_rgba(32,33,36,0.18)] md:text-base"
            />
            <Button type="submit" className="h-12 rounded-full px-6">
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-full px-6"
              onClick={() => {
                const next = addSearchRequest(groups, { query, sources, region });
                if (!next.cleared) return;
                setGroups(next.groups);
                setQuery("");
                setSources([...SOURCES]);
                setSort("relevance");
                setEntryCost("all");
                setShown(RESULT_PAGE_SIZE);
                setCheckMessage(null);
              }}
            >
              Add search
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-5xl">{filters}</div>
      </form>

      <section id="chat-ask" className="mx-auto mt-8 max-w-3xl px-4">
        {server === "down" ? (
          <p className="mb-4 rounded-lg border border-[#f6d6d4] bg-[#fce8e6] px-4 py-3 text-sm text-[#3c4043]" role="status">
            The Prize Scout server did not respond. No contests are shown in its place. Web search is still not connected.
          </p>
        ) : (
          <p className="mb-4 text-sm text-[#70757a]" role="status">
            {server === "checking"
              ? "Checking whether this server can search…"
              : "Web search is not connected. This box does not search the public web, X, Facebook, or Instagram."}
          </p>
        )}
        {query.trim() ? (
          <div className="rounded-2xl border border-[#dfe1e5] bg-white p-5 shadow-[0_1px_6px_rgba(32,33,36,0.08)]">
            <h2 className="text-lg font-medium text-[#202124]">{CHAT_LINK_LABEL}</h2>
            <p className="mt-2 text-base text-[#202124]">{ask}</p>
            <a href={CHAT_URL} className={cn(buttonVariants({ size: "lg" }), "mt-4 inline-flex h-11 rounded-full px-5")}>
              {CHAT_LINK_LABEL}
            </a>
            <p className="mt-3 text-sm text-[#70757a]">
              Sources in this request: {formatSourceList(sources)}. Nothing above is a contest result, and nothing was submitted.
            </p>
            {social ? (
              <p className="mt-2 text-sm text-[#70757a]">
                Facebook and Instagram are limited to an authenticated browser. That browser is not available here, so those sources are only words in the chat request.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-[#70757a]">The editor is blank. Choose Search when this request is ready. Nothing has been searched.</p>
        )}
        {scout.notice ? (
          <p className="mt-4 text-sm text-[#3c4043]" role="status">
            {scout.notice}
          </p>
        ) : null}
      </section>

      {groups.map((group) => {
        const owned = group.resultIds.flatMap((id) => {
          const contest = scout.contests.find((item) => item.id === id);
          return contest ? [contest] : [];
        });
        const stored = groupView[group.id] ?? { sort: "relevance" as SortKey, entryCost: "all" as EntryCostFilter, shown: RESULT_PAGE_SIZE };
        const view = group.active ? { sort, entryCost, shown: shownByRequest[group.id] ?? RESULT_PAGE_SIZE } : stored;
        const matched = sortContests(
          filterContests(owned, { query: "", sources: [...SOURCES], region, strictRegion: false, entryCost: view.entryCost }),
          view.sort,
          new Date(),
        );
        const visibleGroup = visibleResults(matched, view.shown);
        const moreForGroup = nextShownCount(matched.length, view.shown);
        return (
          <section key={group.id} className="mx-auto mt-8 max-w-3xl px-4" data-search-request={group.query || "new"} data-search-active={group.active ? "true" : "false"}>
            <h2 className="text-xl text-[#202124]">{group.query ? `Results for ‘${group.query}’` : "New search"}</h2>
            <p className="mt-1 text-sm text-[#70757a]">
              {formatSourceList(group.sources)} · {countryName(group.region)}. {group.query ? "Prepared request only." : "No request has been prepared yet."} This app did not search the web. An official-page check here is a fixture or a page you name, not a live result.
            </p>
            {visibleGroup.length === 0 ? (
              <p className="mt-3 text-sm text-[#70757a]">No official page has been checked for this request.</p>
            ) : (
              <ul className="mt-3">
                {visibleGroup.map(({ contest }) => {
                  const ready = contestIsEntryReady(contest);
                  const observedEnd = formatObservedEnd(contest.due, new Date());
                  const endLines = observedEnd.relativeLine ? [observedEnd.dateLine, observedEnd.relativeLine] : [observedEnd.dateLine];
                  return (
                    <li key={contest.id}>
                      <ResultRow
                        title={contest.title}
                        description={contest.sponsor ? `${contest.sponsor}. ${contest.shortDescription}` : contest.shortDescription}
                        url={contest.officialUrl}
                        source={contest.source}
                        imageUrl={contest.pageObservedGallery?.[0]?.url ?? null}
                        gallery={contest.pageObservedGallery}
                        galleryKind={contest.pageObservedGalleryKind}
                        endLines={endLines}
                        onOpen={() => setOpenId(contest.id)}
                        saveChecked={savedIds.has(contest.id)}
                        saveDisabled={!canSaveContest(contest)}
                        onSaveChange={(checked) => (checked ? scout.saveContest(contest.id) : scout.unsaveContest(contest.id))}
                      />
                      <p className="pb-2 text-xs text-[#70757a]">Official-page check for this request. Not a web search result. {ready ? "Form and rules observed." : "Form not confirmed."}</p>
                    </li>
                  );
                })}
              </ul>
            )}
            {moreForGroup !== null ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 h-9 px-3 text-sm font-normal text-[#1a73e8]"
                onClick={() => setShownByRequest((current) => ({ ...current, [group.id]: moreForGroup }))}
              >
                More
              </Button>
            ) : null}
            {group.active ? checkForm : null}
          </section>
        );
      })}

      <section className="mx-auto mt-8 max-w-3xl px-4" data-checked-ungrouped="true">
        <h2 className="mb-3 text-sm text-[#70757a]">Checked in this tab ({ungrouped.length}).</h2>
        {ungrouped.length === 0 ? (
          <p className="text-sm text-[#70757a]">No official page has been checked in this tab. Prize Scout did not invent contests.</p>
        ) : (
          <ul>
            {visibleUngrouped.map(({ contest }) => {
              const ready = contestIsEntryReady(contest);
              const saveable = canSaveContest(contest);
              const chosen = savedIds.has(contest.id);
              const eligibility = assessEligibility(contest, scout.profile, new Date());
              const observedEnd = formatObservedEnd(contest.due, new Date());
              const endLines = observedEnd.relativeLine ? [observedEnd.dateLine, observedEnd.relativeLine] : [observedEnd.dateLine];
              return (
                <li key={contest.id}>
                  <div className="min-w-0">
                    <ResultRow
                      title={contest.title}
                      description={contest.sponsor ? `${contest.sponsor}. ${contest.shortDescription}` : contest.shortDescription}
                      url={contest.officialUrl}
                      source={contest.source}
                      imageUrl={contest.imageUrl}
                      endLines={endLines}
                      onOpen={() => setOpenId(contest.id)}
                      saveChecked={chosen}
                      saveDisabled={!saveable}
                      onSaveChange={(checked) => (checked ? scout.saveContest(contest.id) : scout.unsaveContest(contest.id))}
                    />
                    <p className="pb-2 text-xs text-[#70757a]">
                      {money(contest)} · {eligibility.status} · {ready ? "Form and rules observed" : contest.hubOnly ? "Directory — not an eligible entry" : "Form not confirmed"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {ungroupedMore !== null ? (
          <Button type="button" variant="ghost" className="mt-2 h-9 px-3 text-sm font-normal text-[#1a73e8]" onClick={() => setShown(ungroupedMore)}>
            More
          </Button>
        ) : null}
        {activeGroup ? null : checkForm}
      </section>

      <ContestDialog contest={openContest} proof={openProof} open={openContest !== null} onOpenChange={(open) => !open && setOpenId(null)} />
    </main>
  );
}
