"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EntriesPreview } from "@/app/design-preview/entries-preview";

function PracticeHome() {
  const params = useSearchParams();
  return <EntriesPreview scope="home" front={params.get("front") === "1"} />;
}

export default function PracticeHomePage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-[#70757a]">Loading…</p>}>
      <PracticeHome />
    </Suspense>
  );
}
