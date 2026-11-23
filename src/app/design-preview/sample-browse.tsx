"use client";

import { useMemo } from "react";
import { nextShownCount, RESULT_PAGE_SIZE, visibleResults } from "@/domain/match";
import type { Source } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ResultRow } from "@/components/result-row";
import { SavedLayout } from "@/components/saved-layout";
import { FURNITURE_DETAIL_BRIEF } from "./sample-brief";
import {
  SAMPLE_LISTINGS_BANNER,
  SAMPLE_SAVED_BANNER,
  SAMPLES,
  SOURCE_LABEL,
  sampleEndLines,
  type Cost,
  type Order,
} from "./sample-data";

export function SampleResults({
  sources,
  setSources,
  cost,
  setCost,
  order,
  setOrder,
  shown,
  setShown,
  note,
  setNote,
  sampleChecked,
  setSampleChecked,
  onOpenSaved,
  onOpenRequests,
  onOpenEntries,
  onOpenProfile,
  practiceTabs,
}: {
  sources: Source[];
  setSources: (next: Source[] | ((current: Source[]) => Source[])) => void;
  cost: Cost;
  setCost: (cost: Cost) => void;
  order: Order;
  setOrder: (order: Order) => void;
  shown: number;
  setShown: (shown: number) => void;
  note: string;
  setNote: (note: string) => void;
  sampleChecked: string[];
  setSampleChecked: (next: string[] | ((current: string[]) => string[])) => void;
  onOpenSaved: () => void;
  onOpenRequests: () => void;
  onOpenEntries: () => void;
  onOpenProfile: () => void;
  practiceTabs?: boolean;
}) {
  const rows = useMemo(() => {
    const filtered = SAMPLES.filter((item) => sources.includes(item.source)).filter((item) => cost === "all" || item.cost === cost);
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (order === "oldest") return a.published.localeCompare(b.published);
      if (order === "ending-soonest") return a.end.localeCompare(b.end);
      if (order === "ending-latest") return b.end.localeCompare(a.end);
      return b.published.localeCompare(a.published);
    });
    return copy;
  }, [cost, order, sources]);
  const visible = visibleResults(rows, shown);
  const more = nextShownCount(rows.length, shown);
  const visibleIds = visible.map((item) => item.id);
  const allSampleChecked = visibleIds.length > 0 && visibleIds.every((id) => sampleChecked.includes(id));
  const someSampleChecked = visibleIds.some((id) => sampleChecked.includes(id));

  function retouch(message: string) {
    setShown(RESULT_PAGE_SIZE);
    setNote(message);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pt-16 pb-16" data-practice-home={practiceTabs ? "yes" : undefined}>
      <p className="bg-[#fef7e0] px-4 py-3 text-sm font-medium text-[#202124]">{SAMPLE_LISTINGS_BANNER}</p>
      {practiceTabs ? (
        <p className="mt-4 text-sm text-[#3c4043]">Practice copy. The tabs stay on these samples. Reload clears this practice. It is not written to Saved, Entries, or Profile.</p>
      ) : null}
      <h1 className="mt-6 text-2xl text-[#202124]">Prize Scout</h1>
      <div className="mt-4 flex flex-wrap gap-3 text-sm" role="group" aria-label="Sample sources">
        {(["web", "x", "facebook", "instagram"] as const).map((source) => (
          <Label key={source} className="gap-2 font-normal">
            <Checkbox
              aria-label={SOURCE_LABEL[source]}
              checked={sources.includes(source)}
              onCheckedChange={(checked) => {
                setSources((current) => {
                  const next = new Set(current);
                  if (checked) next.add(source);
                  else next.delete(source);
                  return [...next];
                });
                retouch("Sample list updated. No search was run.");
              }}
            />
            {SOURCE_LABEL[source]}
          </Label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Sample entry type">
        {(
          [
            ["all", "All entry types"],
            ["free", "Free"],
            ["paid", "Paid"],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} type="button" variant={cost === value ? "default" : "outline"} className="h-8 rounded-full" aria-pressed={cost === value} onClick={() => { setCost(value); retouch("Sample list updated. No search was run."); }}>
            {label}
          </Button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div role="group" aria-label="Added time" className="flex items-center gap-1">
          <span>Added:</span>
          {(
            [
              ["newest", "Newest"],
              ["oldest", "Oldest"],
            ] as const
          ).map(([value, label]) => (
            <Button key={value} type="button" variant={order === value ? "default" : "ghost"} className="h-7 rounded-full px-2.5 text-sm font-normal" aria-pressed={order === value} onClick={() => { setOrder(value); retouch("Sample list updated. No search was run."); }}>
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
            <Button key={value} type="button" variant={order === value ? "default" : "ghost"} className="h-7 rounded-full px-2.5 text-sm font-normal" aria-pressed={order === value} onClick={() => { setOrder(value); retouch("Sample list updated. No search was run."); }}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-[#3c4043]">Added is when a sample was placed on this list. Ends is when the sample closes.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Label className="gap-2 font-normal">
          <Checkbox
            checked={allSampleChecked}
            indeterminate={!allSampleChecked && someSampleChecked}
            disabled={visibleIds.length === 0}
            aria-label="Save all visible contests"
            aria-describedby="sample-save-all-help"
            onCheckedChange={(checked) => {
              setSampleChecked((current) => {
                const hidden = current.filter((id) => !visibleIds.includes(id));
                return checked ? [...hidden, ...visibleIds] : hidden;
              });
              setNote("Sample checkbox updated. Nothing was saved or submitted.");
            }}
          />
          <span className="text-sm font-medium text-[#202124]">All</span>
        </Label>
        <p id="sample-save-all-help" className="text-xs text-[#3c4043]">
          Sample checkbox. Not saved. This only changes the visible sample rows.
        </p>
      </div>
      <p className="mt-3 text-sm text-[#3c4043]" role="status">{note}</p>
      <ul className="mt-4">
        {visible.map((item) => (
          <li key={item.id}>
            <ResultRow
              title={item.title}
              description={item.description}
              url={item.url}
              source={item.source}
              imageUrl={null}
              endLines={sampleEndLines(item.end)}
              illustration
              saveChecked={sampleChecked.includes(item.id)}
              onSaveChange={(checked) => {
                setSampleChecked((current) => {
                  if (checked) return current.includes(item.id) ? current : [...current, item.id];
                  return current.filter((id) => id !== item.id);
                });
                setNote("Sample checkbox updated. Nothing was saved or submitted.");
              }}
              saveCaption="Sample checkbox. Not saved."
            />
            <p className="pb-2 text-xs text-[#3c4043]">Demo listing {item.id}</p>
          </li>
        ))}
      </ul>
      {more !== null ? (
        <Button type="button" variant="ghost" className="mt-2 text-[#1a73e8]" onClick={() => setShown(more)}>
          More
        </Button>
      ) : null}
      {practiceTabs ? null : (
        <div className="mt-10 border-t border-[#ebebeb] pt-6">
          <h2 className="text-lg text-[#202124]">Sample Saved</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#3c4043]">
            Checked samples are listed in a separate Saved preview. They are not added to your Saved tab, and they are not entries.
          </p>
          <Button type="button" variant="outline" className="mt-3 rounded-full" onClick={onOpenSaved}>
            Open sample Saved
          </Button>
          <Button type="button" variant="outline" className="mt-3 ml-2 rounded-full" onClick={onOpenRequests}>
            Sample requests
          </Button>
          <Button type="button" variant="outline" className="mt-3 ml-2 rounded-full" onClick={onOpenEntries}>
            Open sample Entries
          </Button>
          <Button type="button" variant="outline" className="mt-3 ml-2 rounded-full" onClick={onOpenProfile}>
            Open sample Profile
          </Button>
        </div>
      )}
    </main>
  );
}

export function SampleSaved({
  sampleChecked,
  setSampleChecked,
  note,
  setNote,
  onBack,
  practiceTabs,
}: {
  sampleChecked: string[];
  setSampleChecked: (next: string[] | ((current: string[]) => string[])) => void;
  note: string;
  setNote: (note: string) => void;
  onBack: () => void;
  practiceTabs?: boolean;
}) {
  const sampleSaved = SAMPLES.filter((item) => sampleChecked.includes(item.id));
  return (
    <main className="mx-auto max-w-5xl px-4 pt-20 pb-16" data-saved-page="sample">
      <SavedLayout
        banner={SAMPLE_SAVED_BANNER}
        lede={
          practiceTabs
            ? "Practice Saved. Checked samples from Home appear here. Unchecking removes only that sample. Saving a sample is not an entry. Reload clears this practice."
            : "This is a local preview of the Saved tab. Checked samples appear here at once. Unchecking removes only that sample row. Your Saved tab is unchanged."
        }
        notice={note}
        contestHint="Sample dates as of 01/10/2027. The box stays to the left of the illustration. Saving a sample is not an entry."
        contestEmpty="No sample contests are checked. Go back to sample results and check a box to the left of an illustration."
        contests={sampleSaved.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          url: item.url,
          source: item.source,
          imageUrl: null,
          endLines: sampleEndLines(item.end),
          illustration: true,
          saveCaption: "Sample checkbox. Not saved.",
          detailText: item.id === "demo-illustration-1" ? FURNITURE_DETAIL_BRIEF.prizeBody : `Illustration copy, not an official page. ${item.description}`,
          detailSample: true,
          detailBrief: item.id === "demo-illustration-1" ? FURNITURE_DETAIL_BRIEF : undefined,
          sampleShapes: item.id === "demo-illustration-1" ? (["circle", "square", "triangle"] as const) : undefined,
          status: `Sample bookmark ${item.id}. Not an entry. Not saved in your Saved tab.`,
          onEnter: () => setNote("Sample only. No entry or autofill occurred."),
        }))}
        onUncheck={(id) => {
          setSampleChecked((current) => current.filter((item) => item !== id));
          setNote("Sample removed from this preview. Nothing was removed from Saved, and nothing was submitted.");
        }}
        footer={
          practiceTabs ? null : (
            <Button type="button" variant="ghost" className="mt-8 text-[#1a73e8]" onClick={onBack}>
              Back to sample results
            </Button>
          )
        }
      />
    </main>
  );
}
