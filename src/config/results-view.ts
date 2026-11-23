/** Trial default. Set to "ranked" to restore the single list from 1c4c4f4. */
export const RESULTS_VIEW = "verified-only" as "verified-only" | "ranked";

/** A known entry widget has the end date, and the rules text is not on the page. */
export const WIDGET_RULES_NOTE = "Rules are inside the entry widget — check before entering.";

export interface ResultBucketRow {
  listingGroup?: string;
  placement?: "main" | "related";
  rulesNote?: string;
}

export interface ResultBuckets<T> {
  main: T[];
  needsChecking: T[];
  paid: T[];
  related: T[];
}

/** Verified-only puts leads and store rows in collapsed sections. Ranked keeps them on the main list. */
export function bucketRows<T extends ResultBucketRow>(rows: readonly T[], view: "verified-only" | "ranked" = RESULTS_VIEW): ResultBuckets<T> {
  const related = rows.filter((row) => row.placement === "related");
  const visible = rows.filter((row) => row.placement !== "related");
  if (view === "ranked") {
    return { main: visible, needsChecking: [], paid: [], related };
  }
  const needsChecking = visible.filter((row) => row.listingGroup !== "verified" && row.listingGroup !== "store");
  const widgetRules = needsChecking.filter((row) => row.rulesNote === WIDGET_RULES_NOTE);
  const otherChecks = needsChecking.filter((row) => row.rulesNote !== WIDGET_RULES_NOTE);
  return {
    main: visible.filter((row) => row.listingGroup === "verified"),
    paid: visible.filter((row) => row.listingGroup === "store"),
    needsChecking: [...widgetRules, ...otherChecks],
    related,
  };
}
