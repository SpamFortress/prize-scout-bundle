"use client";

import { formatObservedEnd } from "@/domain/dates";
import { observedDetail } from "@/domain/normalize";
import type { CalendarContest } from "@/domain/calendar-ics";
import { AddToCalendarButton, ExportAllCalendarButton } from "@/components/calendar-actions";
import { SavedLayout } from "@/components/saved-layout";
import { useScout } from "@/components/scout-provider";

function calendarFromContest(id: string, title: string, url: string, endIso: string | null, timeZone: string | null, entryClock: CalendarContest["entryClock"]): CalendarContest {
  return { uid: id, title, url, endDate: endIso, endTime: null, timeZone, entryClock, enteredAt: null };
}

export default function SavedPage() {
  const scout = useScout();
  return (
    <main className="mx-auto max-w-5xl px-4 pt-20 pb-16" data-saved-page="production">
      <SavedLayout
        lede="Saved contests stay in this tab only. Saving a contest is not an entry."
        notice={scout.notice}
        contestHint="A checked box bookmarks an official page. Unchecking removes the bookmark and does not change Entries or the page check. Enter starts the checks this app can do. It does not submit a form."
        contestEmpty="No saved contests in this tab."
        contests={scout.savedContests.map((item) => {
          const observed = formatObservedEnd(item.contest.due, new Date());
          const endLines = observed.relativeLine ? [observed.dateLine, observed.relativeLine] : [observed.dateLine];
          const prepared = item.autofill ? "Form prepared, not entered." : "";
          const calendar = calendarFromContest(item.contestId, item.contest.title, item.contest.officialUrl, item.contest.due.proven ? item.contest.due.isoDate : null, item.contest.rulesTimeZone?.iana ?? null, item.contest.entryClock ?? "unstated");
          return {
            id: item.contestId,
            title: item.contest.title,
            description: item.contest.sponsor ? `${item.contest.sponsor}. ${item.contest.shortDescription}` : item.contest.shortDescription,
            url: item.contest.officialUrl,
            source: item.contest.source,
            endLines,
            detailText: observedDetail(item.contest),
            gallery: item.contest.pageObservedGallery ?? [],
            galleryKind: item.contest.pageObservedGalleryKind ?? null,
            imageUrl: item.contest.pageObservedGallery?.[0]?.url ?? null,
            status: prepared || undefined,
            onEnter: () => scout.beginEntry(item.contestId),
            actions: <AddToCalendarButton item={calendar} />,
          };
        })}
        footer={scout.savedContests.length > 0 ? <div className="mt-4"><ExportAllCalendarButton items={scout.savedContests.map((item) => calendarFromContest(item.contestId, item.contest.title, item.contest.officialUrl, item.contest.due.proven ? item.contest.due.isoDate : null, item.contest.rulesTimeZone?.iana ?? null, item.contest.entryClock ?? "unstated"))} /></div> : null}
        onUncheck={(contestId) => scout.unsaveContest(contestId)}
      />
    </main>
  );
}
