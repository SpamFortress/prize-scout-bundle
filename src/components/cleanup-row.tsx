import { cleanupRowState, CLEANUP_DISABLED_BG, CLEANUP_DISABLED_TEXT, unpairedFortress } from "@/domain/fortress";

export function CleanupRow() {
  const row = cleanupRowState(unpairedFortress());
  return (
    <div
      role="group"
      aria-disabled="true"
      aria-label={`${row.title}. ${row.condition}`}
      className="mt-4 rounded-2xl border border-[#e8eaed] p-4"
      style={{ backgroundColor: CLEANUP_DISABLED_BG, color: CLEANUP_DISABLED_TEXT }}
    >
      <p className="text-sm font-medium">{row.title}</p>
      <p className="mt-1 text-sm">{row.condition}</p>
      <p className="mt-2 text-sm">{row.detail}</p>
    </div>
  );
}
