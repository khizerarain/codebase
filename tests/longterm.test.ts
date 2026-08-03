import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import { LongTermMemory } from "../src/memory/longterm.js";

describe("LongTermMemory", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("stores facts and confirms pending proposals", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-ltm-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const mem = new LongTermMemory(paths);

    mem.add({ text: "Prefer Motul 5W-30", kind: "personal" });
    expect(mem.formatList()).toContain("Motul");

    const pending = mem.proposeExtraction("Always torque lug nuts to OEM spec", "personal");
    expect(mem.listPending()).toHaveLength(1);
    const confirmed = mem.confirmPending(pending.id.slice(0, 8));
    expect(confirmed?.text).toContain("lug nuts");
    expect(mem.listPending()).toHaveLength(0);
  });
});
