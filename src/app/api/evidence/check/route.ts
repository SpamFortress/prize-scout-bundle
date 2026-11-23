import { NextResponse } from "next/server";
import { checkOfficialPage, lookupPublic } from "@/server/check-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The request was not JSON. No page was fetched." }, { status: 400 });
  }
  const url = body && typeof body === "object" && "url" in body ? String((body as { url?: unknown }).url ?? "") : "";
  try {
    const result = await checkOfficialPage(url, {
      fetchImpl: fetch,
      lookupImpl: lookupPublic,
      now: () => new Date(),
    });
    return NextResponse.json(
      {
        ok: result.ok,
        message: result.message,
        contest: result.ok ? result.contest : undefined,
        proof: result.ok ? result.proof : undefined,
        submitted: false,
      },
      { status: result.status },
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "The page could not be read. No contest was added.", submitted: false },
      { status: 502 },
    );
  }
}
