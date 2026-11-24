import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { afterEach, describe, expect, it } from "vitest";
import { d1DocumentStore, fsDocumentStore } from "@/server/document-store";

const dirs: string[] = [];
const flares: Miniflare[] = [];

afterEach(async () => {
  for (const flare of flares.splice(0)) await flare.dispose();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("document store", () => {
  it("keeps the file backend as the local default shape", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "docs-"));
    dirs.push(dir);
    const store = fsDocumentStore(dir);
    expect(await store.read("addon-pairing")).toBeNull();
    await store.write("addon-pairing", "{\"token\":\"local-only\"}\n");
    expect(await store.read("addon-pairing")).toContain("local-only");
  });

  it("reads and writes the same document in local D1", async () => {
    const flare = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: "export default { async fetch() { return new Response('ok'); } };",
      d1Databases: { PRIZE_SCOUT_DB: "local-d1" },
      compatibilityDate: "2026-11-01",
    }));
    flares.push(flare);
    const db = await flare.getD1Database("PRIZE_SCOUT_DB");
    await db.prepare("CREATE TABLE app_documents (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
    const store = d1DocumentStore(db);
    await store.write("addon-checks", "[{\"url\":\"https://example.com/enter\"}]");
    expect(await store.read("addon-checks")).toContain("https://example.com/enter");
    await store.write("addon-checks", "[]");
    expect(await store.read("addon-checks")).toBe("[]");
  });
});
