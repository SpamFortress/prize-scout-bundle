import { countryName } from "./geo";
import { SOURCES, type Source } from "./types";

const LABELS: Record<Source, string> = {
  web: "Web",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
};

export function normalizeSources(input: readonly string[]): Source[] {
  const chosen = new Set<Source>();
  for (const item of input) {
    const value = item.trim().toLowerCase();
    if ((SOURCES as readonly string[]).includes(value)) chosen.add(value as Source);
  }
  const ordered = SOURCES.filter((source) => chosen.has(source));
  return ordered.length > 0 ? [...ordered] : [...SOURCES];
}

export function formatSourceList(sources: readonly Source[]): string {
  const labels = sources.map((source) => LABELS[source]);
  if (labels.length <= 1) return labels[0] ?? "Web";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function regionPhrase(regionCode: string): string {
  const code = regionCode.trim().toUpperCase() || "US";
  if (code === "US") return "the US";
  return countryName(code);
}

/** Full sentence placed beside the Prize Scout chat link. */
export function buildChatAsk(query: string, sources: readonly Source[], regionCode: string): string {
  const words = query.trim() || "giveaways";
  return `Open Prize Scout and ask: Search ${words} on ${formatSourceList(sources)} in ${regionPhrase(regionCode)}.`;
}

export const CHAT_LINK_LABEL = "Start in Prize Scout chat";

export const FORTRESS_CHAT_ASK =
  "Open Prize Scout and ask: I give explicit pairing consent for the unpaired Email Fortress draft. Do not connect it from the app.";
