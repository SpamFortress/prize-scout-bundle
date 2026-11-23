"use client";

import { daysLeftLabel } from "@/domain/dates";
import type { CalendarContest } from "@/domain/calendar-ics";
import { AddToCalendarButton, ExportAllCalendarButton } from "@/components/calendar-actions";
import { Button } from "@/components/ui/button";
import { useScout } from "@/components/scout-provider";

function calendarFromEntry(entry: { id: string; title: string; officialUrl: string; nextDue: { proven: boolean; isoDate?: string } }): CalendarContest {
  return {
    uid: entry.id,
    title: entry.title,
    url: entry.officialUrl,
    endDate: entry.nextDue.proven && entry.nextDue.isoDate ? entry.nextDue.isoDate : null,
    endTime: null,
    timeZone: null,
    entryClock: "unstated",
    enteredAt: null,
  };
}

export default function EntriesPage() {
  const scout = useScout();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-normal text-[#202124]">Entries</h1>
      <p className="mt-2 text-sm text-[#70757a]">
        These are local notes that a rule check passed. Prize Scout has not submitted them to any sponsor.
      </p>
      {scout.entries.length > 0 ? <div className="mt-4"><ExportAllCalendarButton items={scout.entries.map(calendarFromEntry)} /></div> : null}
      {scout.entries.length === 0 ? (
        <p className="mt-8 text-sm text-[#70757a]">No local entries in this tab.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[#ebebeb]">
          {scout.entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg text-[#1a0dab]">{entry.title}</p>
                <p className="text-2xl text-[#202124]">{daysLeftLabel(entry.nextDue, new Date())}</p>
                <p className="text-sm text-[#70757a]">
                  {entry.observation === "form_prepared" ? "Form prepared, not entered." : "Entered."}{" "}
                  {entry.nextDue.proven ? entry.nextDue.isoDate : "End date not stated"} · Not submitted to the sponsor
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <AddToCalendarButton item={calendarFromEntry(entry)} />
                <Button type="button" variant="outline" className="rounded-full" onClick={() => scout.removeEntry(entry.id)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
