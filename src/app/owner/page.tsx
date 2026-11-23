import { notFound } from "next/navigation";
import { ownerTokenMatches } from "@/server/owner-gate";
import { getUsageSummary, saveOwnerSettings } from "@/server/usage-store";

export const dynamic = "force-dynamic";

function money(value: number | null): string {
  if (value === null) return "Not set";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = params.token ?? "";
  if (!ownerTokenMatches(token)) notFound();
  const summary = await getUsageSummary();

  async function save(formData: FormData) {
    "use server";
    const provided = String(formData.get("token") ?? "");
    if (!ownerTokenMatches(provided)) return;
    const read = (name: string) => {
      const value = Number(formData.get(name));
      return Number.isFinite(value) && value >= 0 ? value : undefined;
    };
    await saveOwnerSettings({
      startingCreditUsd: read("startingCreditUsd"),
      costPerRequestUsd: read("costPerRequestUsd"),
      lowCreditUsd: read("lowCreditUsd"),
    });
  }

  return (
    <main className="mx-auto max-w-xl px-4 pt-20 pb-16 text-[#202124]">
      <h1 className="text-3xl font-normal">Usage</h1>
      {summary.low ? (
        <p className="mt-4 rounded-md bg-[#fce8e6] px-3 py-2 text-sm text-[#202124]" data-low-credit="yes">
          Credit is low.
        </p>
      ) : null}
      <dl className="mt-6 grid grid-cols-2 gap-y-2 text-sm">
        <dt>Searches today</dt>
        <dd className="text-right tabular-nums">{summary.searchesToday}</dd>
        <dt>Searches, 7 days</dt>
        <dd className="text-right tabular-nums">{summary.searches7Days}</dd>
        <dt>Searches, all time</dt>
        <dd className="text-right tabular-nums">{summary.searchesAllTime}</dd>
        <dt>Brave requests</dt>
        <dd className="text-right tabular-nums">{summary.braveRequestsAllTime}</dd>
        <dt>Visitors today</dt>
        <dd className="text-right tabular-nums">{summary.visitorsToday}</dd>
        <dt>Remaining</dt>
        <dd className="text-right tabular-nums">{money(summary.remainingUsd)}</dd>
        <dt>Searches left</dt>
        <dd className="text-right tabular-nums">{summary.searchesLeft ?? "Not set"}</dd>
      </dl>
      <form action={save} className="mt-8 space-y-3 text-sm">
        <input type="hidden" name="token" value={token} />
        <label className="block">
          Starting credit, USD
          <input name="startingCreditUsd" defaultValue={summary.startingCreditUsd ?? ""} inputMode="decimal" className="mt-1 block h-9 w-40 rounded-md border border-[#dadce0] px-2" />
        </label>
        <label className="block">
          Cost per request, USD
          <input name="costPerRequestUsd" defaultValue={summary.costPerRequestUsd} inputMode="decimal" className="mt-1 block h-9 w-40 rounded-md border border-[#dadce0] px-2" />
        </label>
        <label className="block">
          Low-credit alert, USD
          <input name="lowCreditUsd" defaultValue={summary.lowCreditUsd} inputMode="decimal" className="mt-1 block h-9 w-40 rounded-md border border-[#dadce0] px-2" />
        </label>
        <button type="submit" className="h-9 rounded-full border border-[#dadce0] px-4">
          Save
        </button>
      </form>
    </main>
  );
}
