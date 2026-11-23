import { useEffect, useId, useRef, useState } from "react";
import type { ObservedImage } from "@/domain/observations";
import type { Source } from "@/domain/types";
import { runOncePerGesture } from "@/lib/single-toggle";
import { type DetailBrief, statedValue } from "@/components/detail-facts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const SOURCE_LABEL: Record<Source, string> = {
  web: "Web",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
};

const HOVER_DELAY_MS = 1000;

export function ResultRow({
  title,
  description,
  url,
  source,
  imageUrl,
  endLines,
  illustration = false,
  onOpen,
  saveChecked,
  saveDisabled = false,
  onSaveChange,
  saveCaption,
  detailText,
  detailSample = false,
  detailBrief,
  onEnter,
  gallery = [],
  galleryKind = null,
  sampleShapes = [],
}: {
  title: string;
  description: string;
  url: string;
  source: Source;
  imageUrl: string | null;
  endLines: string[];
  illustration?: boolean;
  onOpen?: () => void;
  saveChecked?: boolean;
  saveDisabled?: boolean;
  onSaveChange?: (checked: boolean) => void;
  saveCaption?: string;
  /** Observed page text, or labeled illustration copy. Omit on search rows. */
  detailText?: string;
  detailSample?: boolean;
  /** Structured sample details. Production rows omit this and keep the plain text popup. */
  detailBrief?: DetailBrief;
  onEnter?: () => void;
  gallery?: ObservedImage[];
  galleryKind?: "gallery" | "summary" | null;
  sampleShapes?: Array<"circle" | "square" | "triangle">;
}) {
  const sourceLabel = SOURCE_LABEL[source];
  const toggleGate = useRef({ held: false });
  const hoverTimer = useRef<number | null>(null);
  const suppressFocusOpen = useRef(false);
  const titleRef = useRef<HTMLButtonElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const detailId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const slideCount = sampleShapes.length > 0 ? sampleShapes.length : gallery.length;
  const savedTools = Boolean(detailText || onEnter);

  function toggleSave() {
    if (!onSaveChange || saveDisabled) return;
    runOncePerGesture(toggleGate.current, () => onSaveChange(!saveChecked));
  }

  function clearHover() {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function scheduleDetails() {
    if (!detailText) return;
    clearHover();
    hoverTimer.current = window.setTimeout(() => setDetailsOpen(true), HOVER_DELAY_MS);
  }

  function closeDetails() {
    clearHover();
    suppressFocusOpen.current = true;
    setDetailsOpen(false);
    titleRef.current?.focus();
  }

  useEffect(() => {
    if (!detailsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        clearHover();
        suppressFocusOpen.current = true;
        setDetailsOpen(false);
        titleRef.current?.focus();
      }
    }
    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (detailRef.current?.contains(target) || titleRef.current?.contains(target)) return;
      clearHover();
      suppressFocusOpen.current = true;
      setDetailsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [detailsOpen]);

  useEffect(() => () => clearHover(), []);

  useEffect(() => {
    if (!zoom) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setZoom(false);
      if (event.key === "ArrowRight") setImageIndex((current) => Math.min(slideCount - 1, current + 1));
      if (event.key === "ArrowLeft") setImageIndex((current) => Math.max(0, current - 1));
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [zoom, slideCount]);

  const thumbVisual = illustration ? (
    <div data-result-thumb className="flex size-[120px] items-center justify-center bg-[#e8eaed] text-center text-xs text-[#3c4043]" aria-hidden="true">
      Illustration
    </div>
  ) : imageUrl ? (
    // Shown only when the checked page supplied an https image.
    // eslint-disable-next-line @next/next/no-img-element
    <img data-result-thumb src={imageUrl} alt="" className="size-[120px] object-cover" />
  ) : (
    <div data-result-thumb className="flex size-[120px] items-center justify-center bg-[#f1f3f4] text-center text-sm text-[#3c4043]">
      No image
    </div>
  );

  const thumb = savedTools ? (
    <button
      ref={thumbRef}
      type="button"
      className="block rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]"
      aria-label={illustration ? `Enlarge illustration for ${title}` : imageUrl ? `Enlarge image for ${title}` : `No image for ${title}`}
      onClick={() => {
        setImageIndex(0);
        setZoom(true);
      }}
    >
      {thumbVisual}
    </button>
  ) : (
    thumbVisual
  );

  const titleClass = "mt-0.5 text-left text-xl text-[#1a0dab] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]";

  return (
    <article data-image-open={zoom ? "open" : "closed"} className="relative flex flex-wrap items-start gap-3 border-b border-[#ebebeb] py-4 sm:flex-nowrap sm:gap-4">
      {onSaveChange ? (
        <div className="flex h-[120px] shrink-0 items-center" onClick={toggleSave}>
          <Checkbox
            data-result-save
            checked={saveChecked}
            disabled={saveDisabled}
            aria-label={`Save contest ${title}`}
            onCheckedChange={toggleSave}
          />
        </div>
      ) : null}
      <div className="shrink-0">
        {thumb}
        {saveCaption ? <p className="mt-1 w-[120px] text-center text-[11px] leading-4 text-[#3c4043]">{saveCaption}</p> : null}
      </div>
      <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
        <p className="text-sm text-[#202124]">{sourceLabel}</p>
        {detailText ? (
          <button
            ref={titleRef}
            type="button"
            className={titleClass}
            aria-expanded={detailsOpen}
            aria-controls={detailId}
            onMouseEnter={scheduleDetails}
            onMouseLeave={clearHover}
            onFocus={() => {
              if (suppressFocusOpen.current) {
                suppressFocusOpen.current = false;
                return;
              }
              clearHover();
              setDetailsOpen(true);
            }}
            onClick={onOpen}
          >
            {title}
          </button>
        ) : onOpen ? (
          <button type="button" className={titleClass} onClick={onOpen}>
            {title}
          </button>
        ) : (
          <h2 className="mt-0.5 text-xl text-[#1a0dab]">{title}</h2>
        )}
        <a
          href={url}
          data-result-url={url}
          className="mt-0.5 block truncate text-sm text-[#006621] hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          {url}
        </a>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#4d5156]">{description}</p>
        {detailText ? (
          <button type="button" className="mt-1 text-sm text-[#1a0dab] hover:underline" onClick={() => setDetailsOpen(true)}>
            Details
          </button>
        ) : null}
        <div className="mt-2 text-sm leading-5 text-[#202124] sm:hidden">
          {endLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {detailsOpen && detailText ? (
          detailBrief ? (
            <div
              ref={detailRef}
              id={detailId}
              role="dialog"
              aria-label={`Details for ${title}`}
              data-detail-popup="open"
              className="absolute top-full right-0 left-0 z-30 mt-2 flex max-h-[50vh] flex-col overflow-hidden rounded-lg border border-[#dadce0] bg-white text-sm leading-6 text-[#202124] shadow-[0_1px_6px_rgba(32,33,36,0.28)]"
            >
              <button type="button" className="absolute top-2 right-2 text-sm text-[#1a0dab] underline" onClick={closeDetails}>
                Close
              </button>
              <div data-detail-pin className="shrink-0 border-b border-[#ebebeb] px-4 pt-3 pr-16 pb-2">
                {detailSample ? (
                  <p className="mb-2 text-xs leading-5 font-normal text-[#70757a]">Sample only. This text is illustration copy, not observed on an official page.</p>
                ) : null}
                <p>
                  <span className="font-medium">Entry limit: </span>
                  {statedValue(detailBrief.entryLimit)}
                </p>
                <p>
                  <span className="font-medium">Eligibility: </span>
                  {statedValue(detailBrief.eligibility)}
                </p>
              </div>
              <div data-detail-body className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <h3 className="text-base font-medium text-[#202124]">{detailBrief.prizeHeading}</h3>
                {detailBrief.prizeBody.split(/\n\n+/).map((paragraph) => (
                  <p key={paragraph} className="mt-2">
                    {paragraph}
                  </p>
                ))}
                <h3 className="mt-4 text-base font-medium text-[#202124]">How to enter</h3>
                <p className="mt-1">{statedValue(detailBrief.howToEnter)}</p>
                {detailBrief.rulesHref ? (
                  <a href={detailBrief.rulesHref} className="mt-3 inline-block text-[#1a0dab] hover:underline" target="_blank" rel="noreferrer">
                    Official rules
                  </a>
                ) : (
                  <p className="mt-3">Official rules: Not stated</p>
                )}
                <button type="button" className="mt-3 block text-sm text-[#1a0dab] hover:underline" onClick={closeDetails}>
                  Close details
                </button>
              </div>
            </div>
          ) : (
            <div
              ref={detailRef}
              id={detailId}
              role="dialog"
              aria-label={`Details for ${title}`}
              data-detail-popup="open"
              className="absolute top-full right-0 left-0 z-30 mt-2 max-h-[50vh] overflow-auto rounded-lg border border-[#dadce0] bg-white p-4 pr-16 text-sm leading-6 whitespace-pre-wrap text-[#202124] shadow-[0_1px_6px_rgba(32,33,36,0.28)]"
            >
              <button type="button" className="absolute top-2 right-2 text-sm text-[#1a0dab] underline" onClick={closeDetails}>
                Close
              </button>
              {detailSample ? (
                <p className="mb-2 text-xs font-medium text-[#3c4043]">Sample only. This text is illustration copy, not observed on an official page.</p>
              ) : null}
              <p>{detailText}</p>
              <button type="button" className="mt-3 text-sm text-[#1a0dab] hover:underline" onClick={closeDetails}>
                Close details
              </button>
            </div>
          )
        ) : null}
      </div>
      {onEnter ? (
        <div className="flex shrink-0 items-center self-center">
          <button
            type="button"
            className="enter-oval focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]"
            title="Starts the checks this app can do. It does not submit a form."
            aria-describedby={`${detailId}-enter`}
            onClick={onEnter}
          >
            Enter
          </button>
          <span id={`${detailId}-enter`} className="sr-only">
            Starts the checks this app can do. It does not submit a form.
          </span>
        </div>
      ) : null}
      <div className="hidden shrink-0 text-right text-sm leading-5 text-[#202124] sm:block sm:pt-6">
        {endLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {savedTools ? (
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent
            className="sm:max-w-3xl"
            style={{ backgroundColor: "#ffffff", color: "#202124", opacity: 1, animation: "none" }}
            aria-describedby={undefined}
          >
            <DialogTitle>
              {sampleShapes.length > 0 || illustration
                ? "Illustration only"
                : slideCount > 0
                  ? galleryKind === "summary"
                    ? `Page photos, ${imageIndex + 1} of ${slideCount}`
                    : `Image ${imageIndex + 1} of ${slideCount}`
                  : "Prize photos were not captured on this page"}
            </DialogTitle>
            {sampleShapes.length > 0 || illustration ? (
              <p className="text-xs font-medium text-[#3c4043]">Illustration only. Not a prize photo.</p>
            ) : null}
            {sampleShapes.length > 0 ? (
              <SampleGallery shapes={sampleShapes} index={imageIndex} onIndex={setImageIndex} />
            ) : gallery.length > 0 ? (
              <PhotoGallery images={gallery} index={imageIndex} onIndex={setImageIndex} />
            ) : illustration ? (
              <div className="flex items-center justify-center text-xl text-[#202124]" style={{ backgroundColor: "#e8eaed", minHeight: 280 }}>
                Illustration only. Not a prize photo.
              </div>
            ) : (
              <p>Prize photos were not captured on this page.</p>
            )}
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setZoom(false)}>
              Close image
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}
    </article>
  );
}

function SampleShape({ kind }: { kind: "circle" | "square" | "triangle" }) {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" role="img" aria-label={`Illustration ${kind}`}>
      {kind === "circle" ? <circle cx="60" cy="60" r="36" fill="#7ba3d4" /> : null}
      {kind === "square" ? <rect x="28" y="28" width="64" height="64" fill="#8fbf9f" /> : null}
      {kind === "triangle" ? <polygon points="60,24 100,96 20,96" fill="#d4b483" /> : null}
    </svg>
  );
}

function SampleGallery({
  shapes,
  index,
  onIndex,
}: {
  shapes: Array<"circle" | "square" | "triangle">;
  index: number;
  onIndex: (index: number) => void;
}) {
  const safe = Math.min(index, shapes.length - 1);
  const shape = shapes[safe] ?? "circle";
  return (
    <div>
      <div className="flex items-center gap-2">
        {shapes.length > 1 ? (
          <button type="button" className="h-10 w-10 rounded-full border border-[#dadce0]" aria-label="Previous image" onClick={() => onIndex(Math.max(0, safe - 1))}>
            ‹
          </button>
        ) : null}
        <div className="flex min-h-64 flex-1 items-center justify-center" style={{ backgroundColor: "#e8eaed" }} aria-label={`Image ${safe + 1} of ${shapes.length}`}>
          <div className="h-40 w-40">
            <SampleShape kind={shape} />
          </div>
        </div>
        {shapes.length > 1 ? (
          <button type="button" className="h-10 w-10 rounded-full border border-[#dadce0]" aria-label="Next image" onClick={() => onIndex(Math.min(shapes.length - 1, safe + 1))}>
            ›
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-center text-sm text-[#3c4043]">{safe + 1} of {shapes.length}</p>
      {shapes.length > 1 ? (
        <div className="mt-3 flex justify-center gap-2">
          {shapes.map((item, itemIndex) => (
            <button
              key={`${item}-${itemIndex}`}
              type="button"
              className="h-14 w-14 border border-[#dadce0] p-1"
              style={{ backgroundColor: itemIndex === safe ? "#ffffff" : "#f1f3f4" }}
              aria-label={`Show image ${itemIndex + 1} of ${shapes.length}`}
              aria-current={itemIndex === safe ? "true" : undefined}
              onClick={() => onIndex(itemIndex)}
            >
              <SampleShape kind={item} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhotoGallery({
  images,
  index,
  onIndex,
}: {
  images: ObservedImage[];
  index: number;
  onIndex: (index: number) => void;
}) {
  const safe = Math.min(index, images.length - 1);
  const image = images[safe];
  if (!image) return <p>Prize photos were not captured on this page.</p>;
  return (
    <div>
      <div className="flex items-center gap-2">
        {images.length > 1 ? (
          <button type="button" className="h-10 w-10 shrink-0 rounded-full border border-[#dadce0]" aria-label="Previous image" onClick={() => onIndex(Math.max(0, safe - 1))}>
            ‹
          </button>
        ) : null}
        <div className="min-h-64 flex-1" aria-label={`Image ${safe + 1} of ${images.length}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt ?? ""} className="max-h-[70vh] w-full object-contain" />
          {image.caption ? <p className="mt-2 text-sm text-[#3c4043]">{image.caption}</p> : null}
        </div>
        {images.length > 1 ? (
          <button type="button" className="h-10 w-10 shrink-0 rounded-full border border-[#dadce0]" aria-label="Next image" onClick={() => onIndex(Math.min(images.length - 1, safe + 1))}>
            ›
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-center text-sm text-[#3c4043]">{safe + 1} of {images.length}</p>
      {images.length > 1 ? (
        <div className="mt-3 flex justify-center gap-2 overflow-x-auto">
          {images.map((item, itemIndex) => (
            <button
              key={item.url}
              type="button"
              className="h-14 w-14 shrink-0 border border-[#dadce0]"
              aria-label={`Show image ${itemIndex + 1} of ${images.length}`}
              aria-current={itemIndex === safe ? "true" : undefined}
              onClick={() => onIndex(itemIndex)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
