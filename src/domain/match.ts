import { daysUntil } from "./dates";
import type { Contest, EntryCostFilter, SortKey, Source } from "./types";

const STOP = new Set(["i", "want", "to", "win", "a", "an", "the", "some", "please", "for", "me", "my", "of", "and", "or", "on", "in"]);

export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

export function scoreContest(contest: Contest, query: string, region: string): number {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return 1;
  const title = contest.title.toLowerCase();
  const description = contest.shortDescription.toLowerCase();
  const sponsor = (contest.sponsor ?? "").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 5;
    if (description.includes(token)) score += 2;
    if (sponsor.includes(token)) score += 2;
  }
  if (score === 0) return 0;
  if (contest.limits.countries.includes(region) || contest.limits.countries.includes("*")) score += 1;
  return score;
}

export function filterContests(
  contests: readonly Contest[],
  input: { query: string; sources: readonly Source[]; region: string; strictRegion: boolean; entryCost?: EntryCostFilter },
): Array<{ contest: Contest; relevance: number }> {
  const tokens = queryTokens(input.query);
  const entryCost = input.entryCost ?? "all";
  return contests
    .filter((contest) => input.sources.includes(contest.source))
    .filter((contest) => entryCost === "all" || contest.entryCost === entryCost)
    .map((contest) => ({ contest, relevance: scoreContest(contest, input.query, input.region) }))
    .filter((item) => (tokens.length === 0 ? true : item.relevance > 0))
    .filter((item) => {
      if (!input.strictRegion) return true;
      const countries = item.contest.limits.countries;
      return countries.includes(input.region) || countries.includes("*");
    });
}

export function sortContests<T extends { contest: Contest; relevance: number }>(items: readonly T[], sort: SortKey, now: Date): T[] {
  const copy = [...items];
  const endKey = (contest: Contest) => (contest.due.proven ? daysUntil(contest.due, now) ?? 99_999 : 99_999);
  copy.sort((a, b) => {
    const fetched = (contest: Contest) => contest.publishedAt ?? contest.evidence.fetchedAt;
    if (sort === "new") {
      return fetched(b.contest).localeCompare(fetched(a.contest)) || a.contest.title.localeCompare(b.contest.title);
    }
    if (sort === "oldest") {
      return fetched(a.contest).localeCompare(fetched(b.contest)) || a.contest.title.localeCompare(b.contest.title);
    }
    if (sort === "ending") return endKey(a.contest) - endKey(b.contest) || a.contest.title.localeCompare(b.contest.title);
    if (sort === "ending-latest") {
      const aKnown = a.contest.due.proven;
      const bKnown = b.contest.due.proven;
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return endKey(b.contest) - endKey(a.contest) || a.contest.title.localeCompare(b.contest.title);
    }
    return b.relevance - a.relevance || endKey(a.contest) - endKey(b.contest) || a.contest.title.localeCompare(b.contest.title);
  });
  return copy;
}

export const RESULT_PAGE_SIZE = 4;

/** Shows the next slice of an already filtered list. Returns null when nothing remains. */
export function nextShownCount(total: number, shown: number, pageSize = RESULT_PAGE_SIZE): number | null {
  if (total <= 0 || shown >= total) return null;
  return Math.min(total, shown + pageSize);
}

export function visibleResults<T>(items: readonly T[], shown: number): T[] {
  return items.slice(0, Math.max(0, shown));
}

export function applySelectAll(visibleIds: readonly string[], selectedIds: readonly string[], selectAll: boolean): string[] {
  const next = new Set(selectedIds);
  for (const id of visibleIds) {
    if (selectAll) next.add(id);
    else next.delete(id);
  }
  return [...next];
}
