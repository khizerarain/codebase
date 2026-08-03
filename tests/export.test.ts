import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import {
  exportContent,
  rememberExport,
  type ExportBuffers,
} from "../src/export/export.js";

describe("export system", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("exports schedule and plain text", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-export-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const buffers: ExportBuffers = { last: "" };

    rememberExport(
      buffers,
      "Maintenance schedule — 2018 Toyota Tacoma\nEngine oil & filter  due_soon",
      "schedule",
    );

    const md = exportContent(paths, buffers, "schedule", "md");
    expect(existsSync(md.path)).toBe(true);
    expect(readFileSync(md.path, "utf8")).toContain("Maintenance schedule");

    const txt = exportContent(paths, buffers, "schedule", "txt");
    expect(txt.path.endsWith(".txt")).toBe(true);
  });
});
