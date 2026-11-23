import { NextResponse } from "next/server";
import { classifyRenderedPage, storeRenderedCheck } from "@/server/addon-check";
import { allAddonChecks, appOriginAllowed } from "@/server/addon-pairing";
import { pdfBytesToHtml } from "@/server/pdf-text";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Classifies a PDF the user uploaded for one saved row. Nothing is fetched. */
export async function POST(request: Request) {
  if (!appOriginAllowed(request.headers.get("origin"))) {
    return NextResponse.json({ ok: false, message: "Open this from the practice app." }, { status: 403 });
  }
  const form = await request.formData();
  const url = String(form.get("url") ?? "");
  const file = form.get("file");
  if (!url.startsWith("https://") || !(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Choose a PDF for an https contest row." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfHtml = await pdfBytesToHtml(bytes);
  if (!pdfHtml) return NextResponse.json({ ok: false, message: "The PDF had no readable text." }, { status: 422 });
  const prior = (await allAddonChecks()).find((row) => row.url === url);
  const combined = `${prior?.html || ""}\n<section data-uploaded-rules="true">${pdfHtml}</section>`;
  const result = classifyRenderedPage(combined, url, new Date(), prior?.limits ?? []);
  storeRenderedCheck(result, new Date().toISOString(), combined);
  return NextResponse.json({ ok: true, ...result });
}
