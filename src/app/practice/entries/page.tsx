"use client";

import { EntriesPreview } from "@/app/design-preview/entries-preview";

export default function PracticeEntriesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-20 pb-16">
      <EntriesPreview scope="entries" />
    </main>
  );
}