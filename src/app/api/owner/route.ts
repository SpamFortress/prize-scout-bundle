import { NextResponse } from "next/server";
import { ownerTokenMatches } from "@/server/owner-gate";
import { getUsageSummary, saveOwnerSettings } from "@/server/usage-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenOf(request: Request, body: unknown): string {
  const header = request.headers.get("x-owner-token");
  if (header) return header;
  if (body && typeof body === "object" && "token" in body) return String((body as { token?: unknown }).token ?? "");
  return "";
}

export async function GET(request: Request) {
  if (!ownerTokenMatches(tokenOf(request, null))) return new NextResponse(null, { status: 404 });
  return NextResponse.json(await getUsageSummary());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (!ownerTokenMatches(tokenOf(request, body))) return new NextResponse(null, { status: 404 });
  const record = body as { startingCreditUsd?: unknown; costPerRequestUsd?: unknown; lowCreditUsd?: unknown };
  const numberOrUndefined = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);
  const summary = await saveOwnerSettings({
    startingCreditUsd: numberOrUndefined(record.startingCreditUsd),
    costPerRequestUsd: numberOrUndefined(record.costPerRequestUsd),
    lowCreditUsd: numberOrUndefined(record.lowCreditUsd),
  });
  return NextResponse.json(summary);
}
