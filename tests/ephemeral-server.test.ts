import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareIsolatedTypeScriptConfig } from "./ephemeral-server";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("vitest next server", () => {
  it("lets Next rewrite a copy and leaves tsconfig.json unchanged", () => {
    const root = mkdtempSync(path.join(tmpdir(), "prize-scout-tsconfig-"));
    roots.push(root);
    const original = `${JSON.stringify({ compilerOptions: { strict: true }, include: ["next-env.d.ts", "**/*.ts", ".next/types/**/*.ts"] }, null, 2)}\n`;
    writeFileSync(path.join(root, "tsconfig.json"), original);
    const isolated = prepareIsolatedTypeScriptConfig(root);
    writeFileSync(path.join(root, "tsconfig.vitest.json"), "{}\n");
    isolated.cleanup();
    expect(readFileSync(path.join(root, "tsconfig.json"), "utf8")).toBe(original);
    expect(isolated.env.PRIZE_SCOUT_TSCONFIG).toBe("tsconfig.vitest.json");
    expect(isolated.env.PRIZE_SCOUT_DIST_DIR).toBe(".next-vitest");
  });
});
