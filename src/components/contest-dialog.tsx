"use client";

import { daysLeftLabel } from "@/domain/dates";
import type { Contest, RuleProof } from "@/domain/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function money(contest: Contest): string {
  if (!contest.prizeValue) return "Value not stated";
  try {
    return `Prize value stated: ${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: contest.prizeValue.currency,
    }).format(contest.prizeValue.amount)}`;
  } catch {
    return `Prize value stated: ${contest.prizeValue.amount} ${contest.prizeValue.currency}`;
  }
}

export function ContestDialog({
  contest,
  proof,
  open,
  onOpenChange,
}: {
  contest: Contest | null;
  proof: RuleProof | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        {contest ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl leading-snug text-[#1a0dab]">{contest.title}</DialogTitle>
              <DialogDescription>{contest.officialUrl}</DialogDescription>
            </DialogHeader>
            {contest.imageUrl ? (
              // The address comes from the fetched page. There is no stand-in photo.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contest.imageUrl} alt="" className="max-h-48 w-full rounded-lg object-cover" />
            ) : null}
            <p className="text-[#4d5156]">{contest.shortDescription}</p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[#70757a]">End date</dt>
                <dd>{contest.due.proven ? contest.due.isoDate : "End date not stated"}</dd>
                <dd className="text-[#70757a]">{daysLeftLabel(contest.due, new Date())}</dd>
              </div>
              <div>
                <dt className="text-[#70757a]">Cost</dt>
                <dd>{contest.entryCost === "free" ? "Free" : contest.entryCost === "paid" ? "Paid" : "Not stated"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[#70757a]">Entry method</dt>
                <dd>{contest.entryMethod}</dd>
              </div>
              <div>
                <dt className="text-[#70757a]">Prize value</dt>
                <dd>{money(contest)}</dd>
              </div>
              <div>
                <dt className="text-[#70757a]">Readiness</dt>
                <dd>
                  {contest.readiness === "form_checked"
                    ? "Form and rules observed"
                    : contest.hubOnly
                      ? "Directory or social page — not an entry"
                      : "Fetched — form not confirmed"}
                </dd>
              </div>
            </dl>
            <div>
              <h3 className="text-sm font-medium">Red flags</h3>
              {contest.redFlags.length === 0 ? (
                <p className="text-sm text-[#70757a]">None stated on the fetched page.</p>
              ) : (
                <ul className="list-disc pl-5 text-sm">
                  {contest.redFlags.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              )}
            </div>
            {contest.restrictions.length > 0 ? (
              <p className="text-sm text-[#4d5156]">Restrictions stated on the page: {contest.restrictions.join(", ")}.</p>
            ) : null}
            {proof ? (
              <div className="rounded-lg bg-[#f8f9fa] p-3 text-sm">
                <p className="font-medium">Rule proof</p>
                <ul className="mt-1 list-disc pl-5 text-[#4d5156]">
                  {proof.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <a href={contest.officialUrl} target="_blank" rel="noreferrer" className="text-sm text-[#1a0dab] hover:underline">
              View the official page (does not submit)
            </a>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
