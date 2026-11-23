import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runOncePerGesture } from "@/lib/single-toggle";

describe("checkbox activation", () => {
  it("lets the wrapper click and onCheckedChange share one toggle", async () => {
    const gate = { held: false };
    let calls = 0;
    expect(runOncePerGesture(gate, () => { calls += 1; })).toBe(true);
    expect(runOncePerGesture(gate, () => { calls += 1; })).toBe(false);
    expect(calls).toBe(1);
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    expect(runOncePerGesture(gate, () => { calls += 1; })).toBe(true);
    expect(calls).toBe(2);
  });

  it("forwards aria-label onto the checkbox root and names every source and save box", () => {
    const checkbox = readFileSync(path.join(process.cwd(), "src/components/ui/checkbox.tsx"), "utf8");
    const rendered = checkbox.slice(checkbox.indexOf("return ("));
    const spread = rendered.indexOf("{...props}");
    const label = rendered.indexOf('"aria-label": ariaLabel');
    expect(spread).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(spread);
    const home = readFileSync(path.join(process.cwd(), "src/components/search-home.tsx"), "utf8");
    const preview = ["page.tsx", "sample-browse.tsx", "sample-data.ts"]
      .map((name) => readFileSync(path.join(process.cwd(), "src/app/design-preview", name), "utf8"))
      .join("\n");
    const row = readFileSync(path.join(process.cwd(), "src/components/result-row.tsx"), "utf8");
    expect(home).toContain("aria-label={SOURCE_LABEL[source]}");
    for (const name of ["All", "Only pages that state this country", "Save all visible contests"]) {
      expect(home).toContain(`aria-label="${name}"`);
    }
    expect(preview).toContain("aria-label={SOURCE_LABEL[source]}");
    expect(preview).toContain('aria-label="Save all visible contests"');
    expect(row).toContain("aria-label={`Save contest ${title}`}");
    expect(row).toContain("runOncePerGesture");
    expect(row.split("onSaveChange(!saveChecked)").length - 1).toBe(1);
  });
});
