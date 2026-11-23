import { NextResponse } from "next/server";
import { browserIdFromRequest, requestIsLoopback } from "@/server/browser-id";
import { ownerDonationView } from "@/server/donation-store";
import { ownerRequestAllowed, ownerTokenExpected } from "@/server/owner-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const expected = await ownerTokenExpected();
  const token = request.headers.get("x-owner-token") ?? "";
  const identity = await browserIdFromRequest(request);
  if (!ownerRequestAllowed({ loopback: requestIsLoopback(request), token, browserId: identity.id, expectedToken: expected })) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...(await ownerDonationView()) });
}
