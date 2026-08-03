import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import { KnowledgeBase } from "../src/knowledge/knowledge.js";

describe("KnowledgeBase", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("indexes markdown and searches with USER DOCUMENT labels", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-knowledge-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const kb = new KnowledgeBase(paths);

    const manual = join(root, "manual.md");
    writeFileSync(
      manual,
      "# Torque specs\n\nFront wheel lug nuts: 85 ft-lbs. Always tighten in a star pattern.\n",
      "utf8",
    );

    const doc = kb.add(manual, { tags: ["torque"] });
    expect(doc.chunkCount).toBeGreaterThan(0);

    const hit = kb.search("lug nuts torque");
    expect(hit).toContain("USER DOCUMENT");
    expect(hit.toLowerCase()).toContain("85");
  });
});
