"use client";

import { useState } from "react";
import type { Source } from "@/domain/types";
import { RESULT_PAGE_SIZE } from "@/domain/match";
import { Button } from "@/components/ui/button";
import { SampleResults, SampleSaved } from "./sample-browse";
import { EntriesPreview } from "./entries-preview";
import { ProfilePreview } from "./profile-preview";
import { DEFAULT_CHECKED, type Cost, type Order } from "./sample-data";

export default function DesignPreviewPage() {
  const [sources, setSources] = useState<Source[]>(["web", "x", "facebook", "instagram"]);
  const [cost, setCost] = useState<Cost>("all");
  const [order, setOrder] = useState<Order>("newest");
  const [shown, setShown] = useState(RESULT_PAGE_SIZE);
  const [note, setNote] = useState("Sample list only. These controls do not search or submit.");
  const [panel, setPanel] = useState<"results" | "saved" | "requests" | "entries" | "profile">("results");
  const [sampleChecked, setSampleChecked] = useState<string[]>(DEFAULT_CHECKED);

  if (panel === "requests") {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-20 pb-16">
        <p className="bg-[#fef7e0] px-4 py-3 text-sm font-medium text-[#202124]">
          DESIGN PREVIEW — sample requests. Not live search results. No search was performed.
        </p>
        <h1 className="mt-6 text-3xl font-normal text-[#202124]">Search requests</h1>
        <section className="mt-8" data-search-request="guns">
          <h2 className="text-xl text-[#202124]">Results for ‘guns’</h2>
          <p className="mt-1 text-sm text-[#70757a]">Web and X · United States. Prepared request only. This preview did not search the web.</p>
          <p className="mt-3 text-sm text-[#3c4043]">No page was checked for this sample request.</p>
        </section>
        <section className="mt-8 rounded-2xl border border-[#dfe1e5] p-4">
          <h2 className="text-lg text-[#202124]">Active editor</h2>
          <p className="mt-2 text-sm text-[#3c4043]">vehicles</p>
          <p className="mt-2 text-sm text-[#70757a]">Web. No actual search was performed by this preview.</p>
        </section>
        <Button type="button" variant="ghost" className="mt-8 text-[#1a73e8]" onClick={() => setPanel("results")}>
          Back to sample results
        </Button>
      </main>
    );
  }

  if (panel === "profile") {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-20 pb-16">
        <ProfilePreview onBack={() => setPanel("results")} />
      </main>
    );
  }

  if (panel === "entries") {
    return (
      <main className="mx-auto max-w-5xl px-4 pt-20 pb-16">
        <EntriesPreview onBack={() => setPanel("results")} />
      </main>
    );
  }

  if (panel === "saved") {
    return (
      <SampleSaved
        sampleChecked={sampleChecked}
        setSampleChecked={setSampleChecked}
        note={note}
        setNote={setNote}
        onBack={() => setPanel("results")}
      />
    );
  }

  return (
    <SampleResults
      sources={sources}
      setSources={setSources}
      cost={cost}
      setCost={setCost}
      order={order}
      setOrder={setOrder}
      shown={shown}
      setShown={setShown}
      note={note}
      setNote={setNote}
      sampleChecked={sampleChecked}
      setSampleChecked={setSampleChecked}
      onOpenSaved={() => {
        setNote("Sample Saved only. These boxes do not change your Saved tab, and nothing is submitted.");
        setPanel("saved");
      }}
      onOpenRequests={() => setPanel("requests")}
      onOpenEntries={() => setPanel("entries")}
      onOpenProfile={() => setPanel("profile")}
    />
  );
}
