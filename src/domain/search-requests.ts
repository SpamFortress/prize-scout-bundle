import type { Source } from "./types";

export interface SearchRequestGroup {
  id: string;
  query: string;
  sources: Source[];
  region: string;
  active: boolean;
  /** Contest ids checked while this request was the open one. One contest may appear in more than one list. */
  resultIds: string[];
}

export interface SearchEditor {
  query: string;
  sources: readonly Source[];
  region: string;
}

/** Search updates the open request. It does not move pages into a different request. */
export function commitSearchRequest(groups: readonly SearchRequestGroup[], editor: SearchEditor, id: string): SearchRequestGroup[] {
  const query = editor.query.trim();
  if (!query) return groups.map((group) => ({ ...group, sources: [...group.sources], resultIds: [...group.resultIds] }));
  const active = groups.find((group) => group.active);
  if (!active) {
    return [
      ...groups.map((group) => ({ ...group, active: false, sources: [...group.sources], resultIds: [...group.resultIds] })),
      { id, query, sources: [...editor.sources], region: editor.region, active: true, resultIds: [] },
    ];
  }
  return groups.map((group) =>
    group.id === active.id
      ? { ...group, query, sources: [...editor.sources], region: editor.region, active: true, resultIds: [...group.resultIds] }
      : { ...group, sources: [...group.sources], resultIds: [...group.resultIds] },
  );
}

/** Closes the open request so the editor can be cleared. The blank editor is not a group until Search. */
export function addSearchRequest(
  groups: readonly SearchRequestGroup[],
  editor: SearchEditor,
): { groups: SearchRequestGroup[]; cleared: boolean } {
  const active = groups.find((group) => group.active);
  if (!active || !active.query.trim()) {
    return { groups: groups.map((group) => ({ ...group, sources: [...group.sources], resultIds: [...group.resultIds] })), cleared: false };
  }
  return {
    cleared: true,
    groups: groups.map((group) =>
      group.id === active.id
        ? { ...group, active: false, query: active.query, sources: [...editor.sources], region: editor.region, resultIds: [...group.resultIds] }
        : { ...group, sources: [...group.sources], resultIds: [...group.resultIds] },
    ),
  };
}

/** Records that this request checked an existing contest. Other requests keep their own ids. */
export function linkResult(groups: readonly SearchRequestGroup[], requestId: string, contestId: string): SearchRequestGroup[] {
  return groups.map((group) =>
    group.id === requestId && !group.resultIds.includes(contestId)
      ? { ...group, sources: [...group.sources], resultIds: [...group.resultIds, contestId] }
      : { ...group, sources: [...group.sources], resultIds: [...group.resultIds] },
  );
}

/** One contest object. A later request does not replace the first request label or clear an earlier ungrouped check. */
export function rememberObservedContest<T extends { checkedDuringRequestId?: string | null; checkedWithoutRequest?: boolean }>(
  existing: T | undefined,
  contest: T,
  requestId: string | null,
): T {
  return {
    ...contest,
    checkedDuringRequestId: existing ? (existing.checkedDuringRequestId ?? null) : (requestId ?? null),
    checkedWithoutRequest: requestId ? existing?.checkedWithoutRequest === true : true,
  };
}

export function requestIdsOf(contest: { checkedDuringRequestId?: string | null; checkedRequestIds?: readonly string[] | null }): string[] {
  const ids = [...(contest.checkedRequestIds ?? [])];
  if (contest.checkedDuringRequestId && !ids.includes(contest.checkedDuringRequestId)) ids.unshift(contest.checkedDuringRequestId);
  return ids;
}

export function contestsForRequest<T extends { checkedDuringRequestId?: string | null; checkedRequestIds?: readonly string[] | null }>(
  contests: readonly T[],
  requestId: string,
): T[] {
  return contests.filter((contest) => requestIdsOf(contest).includes(requestId));
}

export function ungroupedContests<T extends { checkedDuringRequestId?: string | null; checkedRequestIds?: readonly string[] | null }>(
  contests: readonly T[],
): T[] {
  return contests.filter((contest) => requestIdsOf(contest).length === 0);
}
