import { NextResponse } from "next/server";
import { classifyRenderedPage, storeRenderedCheck, withAddonVersion } from "@/server/addon-check";
import { addonCorsHeaders, authorizeAddonPost } from "@/server/addon-pairing";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: addonCorsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = addonCorsHeaders(origin);
  const auth = authorizeAddonPost(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The check body was not JSON." }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as { url?: unknown; html?: unknown; limits?: unknown; addonVersion?: unknown }) : {};
  const url = typeof record.url === "string" ? record.url : "";
  const html = typeof record.html === "string" ? record.html : "";
  const addonVersion = typeof record.addonVersion === "string" ? record.addonVersion : "";
  const limits = Array.isArray(record.limits) ? record.limits.filter((item): item is string => typeof item === "string") : [];
  if (!url.startsWith("https://") || html.length === 0) {
    return NextResponse.json({ ok: false, message: "A https tab snapshot is required." }, { status: 400, headers });
  }
  const snapshot = html.slice(0, 1_500_000);
  const result = withAddonVersion(classifyRenderedPage(snapshot, url, new Date(), limits), addonVersion);
  storeRenderedCheck(result, new Date().toISOString(), snapshot);
  return NextResponse.json({ ok: true, ...result }, { headers });
}
