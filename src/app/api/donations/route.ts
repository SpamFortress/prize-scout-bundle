import { NextResponse } from "next/server";
import { meterLine } from "@/domain/donations";
import { applyBrowserCookie, browserIdFromRequest } from "@/server/browser-id";
import { claimDonations, publicMeter } from "@/server/donation-store";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const identity = await browserIdFromRequest(request);
  const limited = rateLimit({ id: identity.id, ip: clientIp(request) });
  if (!limited.ok) return NextResponse.json({ ok: false, message: limited.message }, { status: 429 });
  const meter = await publicMeter(identity.id);
  const response = NextResponse.json({
    ok: true,
    line: meterLine(meter.coveredUsd, meter.budgetUsd),
    coveredUsd: meter.coveredUsd,
    budgetUsd: meter.budgetUsd,
    bonus: meter.bonus,
    claimCode: meter.claimCode,
    donationUrl: meter.donationUrl || null,
    poolSearches: meter.poolSearches,
  });
  return applyBrowserCookie(response, identity.sealed, request);
}

export async function POST(request: Request) {
  const identity = await browserIdFromRequest(request);
  const limited = rateLimit({ id: identity.id, ip: clientIp(request) });
  if (!limited.ok) return NextResponse.json({ ok: false, message: limited.message }, { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The body was not JSON." }, { status: 400 });
  }
  const code = body && typeof body === "object" && "code" in body ? String((body as { code?: unknown }).code ?? "") : "";
  const result = await claimDonations(identity.id, code);
  const response = NextResponse.json({ ok: true, claimed: result.claimed, bonus: result.bonus });
  return applyBrowserCookie(response, identity.sealed, request);
}

