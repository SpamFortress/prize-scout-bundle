import { NextResponse } from "next/server";
import { classifyRenderedPage, storeRenderedCheck } from "@/server/addon-check";
import { addonCorsHeaders, addonPersistence, authorizeAddonPost, preparePairing } from "@/server/addon-pairing";
import { lookupPublic } from "@/server/check-page";
import { PdfReadError, pdfBytesToHtml } from "@/server/pdf-text";
import { hostIsBlocked, ipIsBlocked } from "@/server/ssrf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: addonCorsHeaders(request.headers.get("origin")) });
}

/** Reads the single PDF the user already opened. It does not search. */
export async function POST(request: Request) {
  const headers = addonCorsHeaders(request.headers.get("origin"));
  await preparePairing();
  const auth = authorizeAddonPost(request);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The check body was not JSON." }, { status: 400, headers });
  }
  const url = body && typeof body === "object" && "url" in body && typeof (body as { url?: unknown }).url === "string" ? (body as { url: string }).url : "";
  if (!url.startsWith("https://")) {
    return NextResponse.json({ ok: false, message: "A https PDF address is required." }, { status: 400, headers });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, message: "A https PDF address is required." }, { status: 400, headers });
  }
  if (hostIsBlocked(parsed.hostname)) {
    return NextResponse.json({ ok: false, message: "That host is not public. The PDF was not fetched." }, { status: 400, headers });
  }
  const ips = await lookupPublic(parsed.hostname);
  if (ips.length === 0 || ips.some((ip) => ipIsBlocked(ip))) {
    return NextResponse.json({ ok: false, message: "That host is not public. The PDF was not fetched." }, { status: 400, headers });
  }
  const response = await fetch(parsed.toString(), { redirect: "manual" });
  if (!response.ok) {
    return NextResponse.json({ ok: false, message: `The PDF returned HTTP ${response.status}.` }, { status: 422, headers });
  }
  let html = "";
  try {
    html = await pdfBytesToHtml(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    const message = error instanceof PdfReadError ? error.message : "The PDF had no readable text.";
    return NextResponse.json({ ok: false, message }, { status: 422, headers });
  }
  if (!html) return NextResponse.json({ ok: false, message: "The PDF had no readable text." }, { status: 422, headers });
  const result = classifyRenderedPage(html, url, new Date());
  storeRenderedCheck(result, new Date().toISOString(), html);
  await addonPersistence();
  return NextResponse.json({ ok: true, ...result }, { headers });
}
