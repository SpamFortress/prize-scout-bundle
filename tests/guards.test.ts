import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return [full];
  });
}

describe("source guards", () => {
  it("does not store profile fields in the browser or ship a classifier", () => {
    const source = files(path.join(process.cwd(), "src"));
    const joined = source.map((file) => readFileSync(file, "utf8")).join("\n");
    const ui = source
      .filter((file) => file.includes(`${path.sep}app${path.sep}`) || file.includes(`${path.sep}components${path.sep}`))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(joined).not.toContain("localStorage");
    expect(joined).not.toContain("sessionStorage");
    expect(ui).not.toContain("Approve Fortress");
    expect(ui).not.toContain("Approved in this tab");
    expect(ui).not.toContain("approved connection");
    expect(joined).not.toContain("DIRECTORY_INSPECTION");
    expect(ui).not.toContain("Infinite Sweeps");
    const profile = readFileSync(path.join(process.cwd(), "src/app/profile/page.tsx"), "utf8");
    expect(profile).toContain("FORTRESS_DRAFT_BUTTON");
    expect(profile).toContain("FORTRESS_DRAFT_EXPLAIN");
    expect(profile).toContain("prepareFortressDraft");
    expect(profile).toContain("Return to Prize Scout chat");
    expect(profile).toContain("<CleanupRow");
    const cleanup = readFileSync(path.join(process.cwd(), "src/components/cleanup-row.tsx"), "utf8");
    expect(cleanup).toContain('aria-disabled="true"');
    expect(cleanup).toContain("unpairedFortress()");
    expect(cleanup).not.toContain("onClick");
    expect(cleanup).not.toContain("opacity-");
    const about = readFileSync(path.join(process.cwd(), "src/app/about/page.tsx"), "utf8");
    expect(about).toContain("unpaired draft");
    expect(about).not.toContain("Directories that were not used");
    expect(source.some((file) => file.toLowerCase().includes("classifier"))).toBe(false);
    expect(joined).not.toContain("classifyWin");
    expect(joined).not.toContain("<iframe");
    expect(joined).not.toContain("new Audio");
  });
});
