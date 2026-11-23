"use client";

import { buildCalendar, calendarButtonLabel, calendarHasEnd, downloadCalendar, type CalendarContest } from "@/domain/calendar-ics";

function fileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "contest"}.ics`;
}

export function AddToCalendarButton({ item }: { item: CalendarContest }) {
  const label = calendarButtonLabel(item);
  const enabled = calendarHasEnd(item) || item.enteredAt !== null;
  return (
    <button
      type="button"
      data-add-calendar={item.uid}
      className="text-sm font-medium text-[#174ea6] underline decoration-[#174ea6] underline-offset-2 disabled:text-[#80868b] disabled:no-underline"
      disabled={!enabled}
      onClick={() => downloadCalendar(fileName(item.title), buildCalendar([item], new Date()))}
    >
      {label}
    </button>
  );
}

export function ExportAllCalendarButton({ items }: { items: CalendarContest[] }) {
  const ready = items.some((item) => calendarHasEnd(item) || item.enteredAt !== null);
  return (
    <button
      type="button"
      data-export-calendar="all"
      className="rounded-full border border-[#dadce0] px-3 py-1.5 text-sm text-[#174ea6] disabled:text-[#80868b]"
      disabled={!ready}
      onClick={() => downloadCalendar("prize-scout.ics", buildCalendar(items, new Date()))}
    >
      Export all
    </button>
  );
}
