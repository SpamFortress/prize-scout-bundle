"use client";

import type { ReactNode } from "react";
import type { ObservedImage } from "@/domain/observations";
import type { Source } from "@/domain/types";
import type { DetailBrief } from "@/components/detail-facts";
import { ResultRow } from "@/components/result-row";

export interface SavedContestView {
  id: string;
  title: string;
  description: string;
  url: string;
  source: Source;
  imageUrl: string | null;
  endLines: string[];
  illustration?: boolean;
  status?: string;
  saveCaption?: string;
  detailText: string;
  detailSample?: boolean;
  detailBrief?: DetailBrief;
  onEnter: () => void;
  gallery?: ObservedImage[];
  galleryKind?: "gallery" | "summary" | null;
  sampleShapes?: Array<"circle" | "square" | "triangle">;
  actions?: ReactNode;
}

export function SavedLayout({
  lede,
  banner,
  notice,
  contestEmpty,
  contestHint,
  contests,
  onUncheck,
  footer,
}: {
  lede: string;
  banner?: string;
  notice?: string | null;
  contestEmpty: string;
  contestHint?: string;
  contests: SavedContestView[];
  onUncheck: (id: string) => void;
  footer?: ReactNode;
}) {
  return (
    <div data-saved-layout>
      {banner ? <p className="bg-[#fef7e0] px-4 py-3 text-sm font-medium text-[#202124]">{banner}</p> : null}
      <h1 className={`${banner ? "mt-6" : ""} text-3xl font-normal text-[#202124]`}>Saved</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#70757a]">{lede}</p>
      {notice ? (
        <p className="mt-4 text-sm text-[#3c4043]" role="status">
          {notice}
        </p>
      ) : null}
      {contestHint ? <p className="mt-4 max-w-2xl text-sm leading-6 text-[#3c4043]">{contestHint}</p> : null}
      {contests.length === 0 ? (
        <p className="mt-6 text-sm text-[#70757a]">{contestEmpty}</p>
      ) : (
        <ul className="mt-4">
          {contests.map((item) => (
            <li key={item.id}>
              <ResultRow
                title={item.title}
                description={item.description}
                url={item.url}
                source={item.source}
                imageUrl={item.imageUrl}
                endLines={item.endLines}
                illustration={item.illustration}
                saveChecked
                saveCaption={item.saveCaption}
                detailText={item.detailText}
                detailSample={item.detailSample}
                detailBrief={item.detailBrief}
                onEnter={item.onEnter}
                gallery={item.gallery}
                galleryKind={item.galleryKind}
                sampleShapes={item.sampleShapes}
                onSaveChange={(checked) => {
                  if (!checked) onUncheck(item.id);
                }}
              />
              {item.status ? <p className="pb-3 text-xs leading-5 text-[#70757a]">{item.status}</p> : null}
              {item.actions}
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  );
}
