"use client";

import { useState } from "react";

export function MailInPrintCard({
  addressLines,
  requiredFields,
  emptyNote,
}: {
  addressLines: string[] | null;
  requiredFields: string[];
  emptyNote?: string;
}) {
  const [printing, setPrinting] = useState(false);
  const filled = addressLines !== null && addressLines.length > 0;
  return (
    <div>
      <div
        className="mail-card-sheet border border-[#202124] bg-white p-3 text-[#202124]"
        data-printing={printing ? "yes" : "no"}
        data-mail-card={filled ? "filled" : "empty"}
      >
        <p className="text-[10px] font-medium tracking-wide text-[#70757a]">3 × 5 inch card</p>
        <p className="mt-1 text-xs font-medium">Mail to</p>
        {filled ? (
          addressLines.map((line) => (
            <p key={line} className="text-sm leading-5">
              {line}
            </p>
          ))
        ) : (
          <p className="text-sm leading-5">{emptyNote ?? "Mailing address was not read from an official rules page."}</p>
        )}
        {filled ? (
          <div className="mt-2">
            {(requiredFields.length > 0 ? requiredFields : ["Required fields were not named on the rules page"]).map((field) => (
              <p key={field} className="mt-2 border-b border-[#202124] text-xs leading-5">
                <span className="text-[#3c4043]">{field}: </span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#3c4043]">
        Postage and supplies are not included. A stamp and a card cost money. Write your own details on the paper at print time. Nothing you write is stored.
      </p>
      <button
        type="button"
        className="mt-2 h-8 rounded-full border border-[#dadce0] px-3 text-sm disabled:opacity-50"
        disabled={!filled}
        onClick={() => {
          setPrinting(true);
          window.setTimeout(() => {
            window.print();
            setPrinting(false);
          }, 0);
        }}
      >
        {filled ? "Print card" : "Print card unavailable"}
      </button>
    </div>
  );
}
