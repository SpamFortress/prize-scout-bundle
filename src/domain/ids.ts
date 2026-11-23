import { sha256Hex } from "./sha256";

function canonicalize(value: unknown, seen = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string") return `s:${value.normalize("NFC")}`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("stableId does not accept non-finite numbers");
    return Object.is(value, -0) ? "n:0" : `n:${value}`;
  }
  if (typeof value === "boolean") return value ? "b:1" : "b:0";
  if (typeof value === "bigint") return `i:${value.toString()}`;
  if (typeof value === "undefined") return "u:";
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("stableId does not accept circular values");
    seen.add(value);
    const inner = value.map((part) => canonicalize(part, seen)).join(",");
    seen.delete(value);
    return `a:[${inner}]`;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new Error("stableId does not accept circular values");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const inner = Object.keys(record)
      .sort()
      .map((key) => `${canonicalize(key)}:${canonicalize(record[key], seen)}`)
      .join(",");
    seen.delete(value);
    return `o:{${inner}}`;
  }
  throw new Error(`stableId does not accept ${typeof value}`);
}

/** Stable id for arbitrary JSON-like values. Distinct inputs get distinct ids. */
export function stableId(parts: readonly unknown[]): string {
  return `ps_${sha256Hex(canonicalize(parts)).slice(0, 32)}`;
}

export function uniqueId(prefix: string): string {
  const entropy = globalThis.crypto.randomUUID().replace(/-/g, "");
  const safe = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "id";
  return `${safe}_${entropy}`;
}

export function opaqueRef(): string {
  return uniqueId("op");
}
