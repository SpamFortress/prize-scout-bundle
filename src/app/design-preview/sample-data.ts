import { formatObservedEnd, parseDueDate } from "@/domain/dates";
import type { Source } from "@/domain/types";

export type Cost = "all" | "free" | "paid";
export type Order = "newest" | "oldest" | "ending-soonest" | "ending-latest";

export interface SampleListing {
  id: string;
  title: string;
  description: string;
  source: Source;
  url: string;
  end: string;
  cost: "free" | "paid";
  published: string;
}

export const SAMPLES: SampleListing[] = [
  { id: "demo-illustration-1", title: "Furniture collection — illustration only", description: "Demo sponsor. Illustration only, not a discovered contest.", source: "web", url: "https://example.com/demo-illustration-1", end: "2027-01-26", cost: "free", published: "2026-06-01" },
  { id: "demo-illustration-2", title: "Desk lamp drawing — illustration only", description: "Demo sponsor. Illustration only, not a discovered contest.", source: "x", url: "https://x.com/prize-scout-sample/status/illustration-2", end: "2027-02-14", cost: "free", published: "2026-02-01" },
  { id: "demo-illustration-3", title: "Bookshelf set — illustration only", description: "Demo sponsor. Illustration only, not a discovered contest.", source: "facebook", url: "https://www.facebook.com/prize-scout-sample/posts/illustration-3", end: "2027-01-15", cost: "paid", published: "2026-03-01" },
  { id: "demo-illustration-4", title: "Side table — illustration only", description: "Demo sponsor. Illustration only, not a discovered contest.", source: "instagram", url: "https://example.com/demo-illustration-4", end: "2026-10-30", cost: "free", published: "2025-12-01" },
  { id: "demo-illustration-5", title: "Reading chair — illustration only", description: "Demo sponsor. Illustration only, not a discovered contest.", source: "web", url: "https://example.com/demo-illustration-5", end: "2026-12-20", cost: "paid", published: "2026-04-02" },
  { id: "demo-illustration-6", title: "Floor cushion — illustration only", description: "Demo sponsor. Illustration only, not a discovered contest.", source: "web", url: "https://example.com/demo-illustration-6", end: "2027-03-01", cost: "free", published: "2026-05-01" },
];

export const SOURCE_LABEL: Record<Source, string> = { web: "Web", x: "X", facebook: "Facebook", instagram: "Instagram" };

export const SAMPLE_SAVED_BANNER =
  "DESIGN PREVIEW — sample Saved. Not your Saved tab. Not live results. Nothing here is bookmarked, entered, or submitted.";

export const SAMPLE_LISTINGS_BANNER =
  "DESIGN PREVIEW — sample listings, not live search results. Sample dates as of 01/10/2027.";

/** Fixed sample clock so 2027-01-26 is 16 days away. Not used for real checked pages. */
export const SAMPLE_AS_OF = new Date("2027-01-10T12:00:00Z");

export const DEFAULT_CHECKED = ["demo-illustration-1", "demo-illustration-2", "demo-illustration-3"];

export function sampleEndLines(isoDate: string): string[] {
  const column = formatObservedEnd(parseDueDate(isoDate), SAMPLE_AS_OF);
  return column.relativeLine ? [column.dateLine, column.relativeLine] : [column.dateLine];
}
