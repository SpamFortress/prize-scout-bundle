import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeVerifiedToolResult, prizeDescriptionView } from "@/domain/normalize";
import { PRIZE_DESCRIPTION_LIMIT, PRIZE_DESCRIPTION_NOT_CAPTURED } from "@/domain/observations";
import { extractObservedGallery, extractPrizeDescription } from "@/domain/page-observations";
import { addSearchRequest, commitSearchRequest, linkResult, rememberObservedContest } from "@/domain/search-requests";
import { contrastRatio } from "@/domain/fortress";
import { observeHtml } from "@/domain/interpret";

const PAGE = "https://example.com/enter";
const NOW = new Date("2026-11-06T12:00:00Z");

function img(src: string, extra = ""): string {
  return `<img ${extra} src="${src}">`;
}

describe("official page gallery", () => {
  it("keeps one https photo and drops a logo, a pixel, and unsafe urls", () => {
    const html = `<main>
      <meta property="og:image" content="https://example.com/logo.png">
      ${img("https://example.com/pixel.gif", 'width="1" height="1" alt="tracking pixel"')}
      ${img("javascript:alert(1)", 'alt="Camera"')}
      ${img("data:image/png;base64,aaaa", 'alt="Camera"')}
      <div class="prize-gallery">${img("/photos/camera.jpg", 'alt="Camera body" width="20"')}</div>
    </main>`;
    const images = extractObservedGallery(html, PAGE);
    expect(images.images.map((item) => item.url)).toEqual(["https://example.com/photos/camera.jpg"]);
    expect(images.kind).toBe("gallery");
    expect(images.images[0]?.alt).toBe("Camera body");
    expect(images.images[0]?.evidenceUrl).toBe(PAGE);
  });

  it("keeps gallery photos in page order, picks one srcset url, and skips an unrelated offer", () => {
    const html = `<main>
      <meta property="og:image" content="https://example.com/summary.jpg">
      ${img("https://example.com/holiday.jpg", 'alt="Sponsor holiday offer"')}
      <div class="product-images">
        ${img("https://example.com/a.jpg", 'alt="Lens" srcset="https://example.com/a-small.jpg 400w, https://example.com/a-large.jpg 1200w"')}
        <a href="/photos/case.jpg">Open image</a>
        ${img("https://example.com/b.jpg", 'alt="Bag"')}
      </div>
    </main>`;
    const images = extractObservedGallery(html, PAGE);
    expect(images.kind).toBe("gallery");
    expect(images.images.map((item) => item.url)).toEqual([
      "https://example.com/summary.jpg",
      "https://example.com/a-large.jpg",
      "https://example.com/photos/case.jpg",
      "https://example.com/b.jpg",
    ]);
    const five = extractObservedGallery(
      `<div class="prize-gallery">${[1, 2, 3, 4, 5].map((n) => img(`/${n}.jpg`, `alt="Photo ${n}"`)).join("")}</div>`,
      PAGE,
    );
    expect(five.images).toHaveLength(5);
    expect(five.images[1]?.url).toBe("https://example.com/2.jpg");
    const promo = extractObservedGallery(
      `<main><div class="carousel">${img("https://example.com/holiday.jpg", 'alt="Sponsor summer sale"')}</div>
        <div class="prize-gallery">${img("https://example.com/photos/prize-banner.jpg", 'alt="Field camera"')}</div></main>`,
      PAGE,
    );
    expect(promo.images.map((item) => item.url)).toEqual(["https://example.com/photos/prize-banner.jpg"]);
    expect(promo.kind).toBe("gallery");
    const summary = extractObservedGallery(`<meta property="og:image" content="https://example.com/summary.jpg">`, PAGE);
    expect(summary.kind).toBe("summary");
    expect(summary.images).toHaveLength(1);
  });

  it("does not invent a logo when the page has no prize photo", () => {
    const images = extractObservedGallery(
      `<header>${img("https://example.com/brand-logo.svg", 'alt="Acme logo" class="site-logo"')}</header>`,
      PAGE,
    );
    expect(images.images).toEqual([]);
    expect(images.kind).toBeNull();
    const row = readFileSync(path.join(process.cwd(), "src/components/result-row.tsx"), "utf8");
    expect(row).toContain("images.length > 1");
    expect(row).toContain("shapes.length > 1");
  });

  it("keeps a nested prize carousel, drops a page carousel and an ad host, and stops at 24", () => {
    const pageCarousel = extractObservedGallery(
      `<main class="carousel"><h2>The prize</h2>${img("https://example.com/holiday.jpg", 'alt="Sponsor summer sale"')}</main>`,
      PAGE,
    );
    expect(pageCarousel.images).toEqual([]);
    expect(pageCarousel.kind).toBeNull();

    const nested = extractObservedGallery(
      `<article><h2>The prize</h2><div class="swiper">${img("https://example.com/kit.jpg", 'alt="Kit"')}</div></article>`,
      PAGE,
    );
    expect(nested.kind).toBe("gallery");
    expect(nested.images.map((item) => item.url)).toEqual(["https://example.com/kit.jpg"]);

    const headed = extractObservedGallery(
      `<div class="carousel"><h2>The prize</h2>${img("https://example.com/kit.jpg", 'alt="Kit"')}</div>`,
      PAGE,
    );
    expect(headed.images.map((item) => item.url)).toEqual(["https://example.com/kit.jpg"]);

    const hosts = extractObservedGallery(
      `<div class="prize-gallery">
        ${img("https://ads.example.com/camera.jpg", 'alt="Field camera"')}
        ${img("https://example.com/photos/prize-banner.jpg", 'alt="Field camera"')}
      </div>
      <div data-gallery="hero">${img("https://example.com/sale.jpg", 'alt="Sponsor summer sale"')}</div>
      <div data-gallery="prize">${img("https://example.com/body.jpg", 'alt="Kit"')}</div>`,
      PAGE,
    );
    expect(hosts.images.map((item) => item.url)).toEqual([
      "https://example.com/photos/prize-banner.jpg",
      "https://example.com/body.jpg",
    ]);

    const many = extractObservedGallery(
      `<div class="product-gallery">${Array.from({ length: 25 }, (_, n) => img(`https://example.com/p/${n}.jpg`, `alt="Photo ${n}"`)).join("")}</div>`,
      PAGE,
    );
    expect(many.images).toHaveLength(24);
    expect(many.images[0]?.url).toBe("https://example.com/p/0.jpg");
    expect(many.images[23]?.url).toBe("https://example.com/p/23.jpg");
  });
});

describe("prize description", () => {
  it("keeps the prize section and drops rules, dates, and eligibility", () => {
    const prize = "A brass field camera with a linen bellows and a walnut grip. It is the item being given away.";
    const html = `<main>
      <h2>The prize</h2>
      <p>${prize}</p>
      <h2>Official rules</h2>
      <p>Open to legal residents 18 or older. Ends December 31, 2026. No purchase necessary. One entry per person.</p>
    </main>`;
    const captured = extractPrizeDescription(html);
    expect(captured.kind).toBe("prize");
    expect(captured.text).toContain(prize);
    expect(captured.text).not.toContain("Ends December");
    expect(captured.text).not.toContain("18 or older");
    expect(captured.truncated).toBe(false);
    const nested = extractPrizeDescription(`<article>
      <h2>Prize details</h2>
      <div>
        <h3>Included pieces</h3>
        <p>Walnut grip and linen bellows. Includes a two-year warranty.</p>
        <h3>Prize eligibility</h3>
        <p>Must be 18 and a legal resident.</p>
      </div>
      <h2>Official rules about this prize</h2>
      <p>Ends December 31, 2026. No purchase necessary.</p>
      <h2>End date for prize</h2>
      <p>Closing date December 31, 2026.</p>
      <h2>Contest prize entry period</h2>
      <p>Entry period opens January 1.</p>
      <h2>How the prize is awarded, eligibility</h2>
      <p>Random drawing among eligible entries.</p>
      <p>A plain paragraph with no prize heading.</p>
    </article>`);
    expect(nested.text).toContain("Included pieces");
    expect(nested.text).toContain("Walnut grip and linen bellows.");
    expect(nested.text).toContain("two-year warranty");
    expect(nested.text).not.toContain("Must be 18");
    expect(nested.text).not.toContain("Ends December");
    expect(nested.text).not.toContain("Entry period");
    expect(nested.text).not.toContain("Random drawing");
    expect(nested.text).not.toContain("plain paragraph");
    expect(extractPrizeDescription("<main><p>Only a loose paragraph about a camera.</p></main>").text).toBeNull();
    expect(extractPrizeDescription(`<h2>The product</h2><p>Walnut field camera with a linen bellows.</p>`).text).toContain(
      "Walnut field camera",
    );
    const claimed = extractPrizeDescription(`<h2>Prize details</h2>
      <h3>Product specifications</h3><p>Brass body, linen bellows.</p>
      <h3>Features</h3><p>Includes a two-year warranty.</p>
      <h3>How to claim this prize</h3><p>Mail the claim form.</p>
      <h2>Contest prize contact info</h2><p>Email the sponsor.</p>
      <h2>Entry availability for prize</h2><p>Entries close Friday.</p>
      <h2>How prize ends</h2><p>The drawing is Friday.</p>`);
    expect(claimed.text).toContain("Product specifications");
    expect(claimed.text).toContain("Brass body, linen bellows.");
    expect(claimed.text).toContain("Features");
    expect(claimed.text).toContain("two-year warranty");
    expect(claimed.text).not.toContain("claim form");
    expect(claimed.text).not.toContain("Email the sponsor");
    expect(claimed.text).not.toContain("Entries close");
    expect(claimed.text).not.toContain("drawing is Friday");
  });

  it("stores at most the declared limit and does not upgrade an old short paragraph", () => {
    const long = "Walnut camera body. ".repeat(800);
    const captured = extractPrizeDescription(`<h2>Product description</h2><p>${long}</p>`);
    expect(captured.truncated).toBe(true);
    expect(captured.text?.length).toBe(PRIZE_DESCRIPTION_LIMIT);
    expect(PRIZE_DESCRIPTION_LIMIT).toBe(12_000);
    const stale = normalizeVerifiedToolResult(
      {
        verified: true,
        evidenceUrl: PAGE,
        tool: "evidence.fetch",
        payload: {
          title: "Camera",
          officialUrl: PAGE,
          source: "web",
          pageObservedDetailedDescription: "No purchase necessary. Ends December 31, 2026.",
          formFound: true,
          rulesLinkFound: true,
          hubOnly: false,
        },
      },
      NOW,
    );
    expect(stale.ok).toBe(true);
    if (!stale.ok) return;
    expect(stale.contest.pageObservedDescriptionKind).toBeNull();
    expect(prizeDescriptionView(stale.contest).text).toBe(PRIZE_DESCRIPTION_NOT_CAPTURED);
    const observed = observeHtml(
      `<html><head><title>Camera</title></head><body><h2>The prize</h2><p>${"A field camera. ".repeat(20)}</p><h2>Official rules</h2><p>Ends December 31, 2026.</p></body></html>`,
      PAGE,
      NOW,
    );
    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    expect(observed.contest.pageObservedDescriptionKind).toBe("prize");
    expect(observed.contest.pageObservedDetailedDescription).toContain("A field camera.");
    expect(observed.contest.pageObservedDetailedDescription).not.toContain("Ends December");
  });
});

describe("search requests", () => {
  it("keeps a finished request when a blank editor is added", () => {
    const editor = { query: "official-page fixture", sources: ["web"] as const, region: "US" };
    const firstGroup = commitSearchRequest([], editor, "group-1");
    const withPage = linkResult(firstGroup, "group-1", "same-page");
    const closed = addSearchRequest(withPage, { query: "", sources: ["web"], region: "US" });
    expect(closed.cleared).toBe(true);
    expect(closed.groups).toHaveLength(1);
    expect(closed.groups[0]).toMatchObject({ id: "group-1", query: "official-page fixture", active: false, resultIds: ["same-page"] });
    const secondGroup = commitSearchRequest(closed.groups, { query: "second fixture request", sources: ["web"], region: "US" }, "group-2");
    expect(secondGroup.find((group) => group.id === "group-2")?.resultIds).toEqual([]);
    const linked = linkResult(secondGroup, "group-2", "same-page");
    expect(linked.find((group) => group.id === "group-1")?.resultIds).toEqual(["same-page"]);
    expect(linked.find((group) => group.id === "group-2")?.resultIds).toEqual(["same-page"]);
    const ungrouped = rememberObservedContest(undefined, { id: "loose", checkedDuringRequestId: null, checkedWithoutRequest: false }, null);
    const stillLoose = rememberObservedContest(ungrouped, { ...ungrouped }, "group-2");
    expect(stillLoose.checkedWithoutRequest).toBe(true);
    expect(stillLoose.checkedDuringRequestId).toBeNull();
    const firstSeen = rememberObservedContest(undefined, { id: "same-page", checkedDuringRequestId: null }, "group-1");
    const secondSeen = rememberObservedContest(firstSeen, { ...firstSeen }, "group-2");
    expect(secondSeen.checkedDuringRequestId).toBe("group-1");
    expect(secondSeen.id).toBe("same-page");
  });
});

describe("enter button contrast", () => {
  it("keeps the shaded oval readable in light and dark", () => {
    expect(contrastRatio("#174ea6", "#e8f0fe")).toBeGreaterThan(4.5);
    expect(contrastRatio("#e8f0fe", "#1a3a5c")).toBeGreaterThan(4.5);
  });
});
