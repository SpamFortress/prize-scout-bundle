import { CheckedByYouMark } from "@/components/checked-by-you";
import { formatAddonEnd } from "@/domain/dates";
import { classifyRenderedPage } from "@/server/addon-check";

const HTML = `<!doctype html><html><head><title>Family Cruise</title></head><body><p>No purchase necessary. Official rules. Sponsored by JetBlue. Enter to win a cruise. Open to legal residents of the United States who are 18 years or older. The sweepstakes ends on December 31, 2026.</p><form><input type="email" name="email"><button type="submit">Enter</button></form></body></html>`;

export default function CheckedByYouPage() {
  const row = classifyRenderedPage(HTML, "https://www.jetbluevacations.com/cruises", new Date("2026-11-16T12:00:00.000Z"));
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <article data-live-result={row.url} className="border-b border-[#ebebeb] py-4">
        <p className="text-xl text-[#1a0dab]">{row.title}</p>
        <p className="text-sm text-[#006621]">{row.url}</p>
        <p className="mt-2 flex flex-wrap gap-2">
          {row.checkedByYou && row.listingGroup === "verified" ? <CheckedByYouMark /> : null}
        </p>
        <p data-rules-note className="mt-2 text-sm leading-5 text-[#3c4043]">{row.rulesNote}</p>
        {formatAddonEnd(row.endIso) ? <p data-addon-end className="mt-1 text-sm leading-5 text-[#3c4043]">{formatAddonEnd(row.endIso)}</p> : null}
        <p data-last-checked className="mt-1 text-xs leading-4 text-[#3c4043]">Last checked {row.lastChecked}</p>
      </article>
    </main>
  );
}
