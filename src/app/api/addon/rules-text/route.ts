import { NextResponse } from "next/server";
import { attachedRulesDocument, classifyRenderedPage, storeRenderedCheck } from "@/server/addon-check";
import { addonPersistence, allAddonChecks, appOriginAllowed } from "@/server/addon-pairing";

export const dynamic = "force-dynamic";

/** Classifies rules text the user pasted for one saved row. Nothing is fetched. */
export async function POST(request: Request) {
  if (!appOriginAllowed(request.headers.get("origin"))) {
    return NextResponse.json({ ok: false, message: "Open this from the practice app." }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The pasted rules were not JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? (body as { url?: unknown; text?: unknown }) : {};
  const url = typeof record.url === "string" ? record.url : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (!url.startsWith("https://") || text.length < 40) {
    return NextResponse.json({ ok: false, message: "Paste the rules text for an https contest row." }, { status: 400 });
  }
  const prior = (await allAddonChecks()).find((row) => row.url === url);
  const rulesHtml = `<article>${text.replace(/[<>&]/g, (char) => (char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&amp;"))}</article>`;
  const combined = attachedRulesDocument(prior?.html || "", rulesHtml, "pasted");
  const result = classifyRenderedPage(combined, url, new Date(), prior?.limits ?? []);
  storeRenderedCheck(result, new Date().toISOString(), combined);
  await addonPersistence();
  return NextResponse.json({ ok: true, ...result });
}
