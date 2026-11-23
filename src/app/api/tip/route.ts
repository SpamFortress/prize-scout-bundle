import { NextResponse } from "next/server";
import { DEFAULT_COST_USD, searchesPerDollar } from "@/domain/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const url = process.env.PRIZE_SCOUT_TIP_URL?.trim() || "";
  if (!url) return NextResponse.json({ url: null, searchesPerDollar: 0 });
  const cost = Number(process.env.PRIZE_SCOUT_BRAVE_COST_USD);
  const per = searchesPerDollar(Number.isFinite(cost) && cost > 0 ? cost : DEFAULT_COST_USD);
  return NextResponse.json({ url, searchesPerDollar: per });
}
