import { describe, expect, it } from "vitest";
import { APP_NAME, APP_VERSION, formatAbout, formatVersionLine } from "../src/version.js";
import { runStartupDiagnostics } from "../src/cli/startup.js";
import { ensureDataDirs, getDataPaths, loadConfig } from "../src/config/config.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SESSION_HELP } from "../src/agent/prompts.js";

describe("Phase 9 release readiness", () => {
  it("exposes a semver-ish version and about text", () => {
    expect(APP_NAME).toBe("bay");
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(formatVersionLine()).toContain(APP_VERSION);
    expect(formatAbout()).toMatch(/local-first|Privacy|Safety/i);
  });

  it("SESSION_HELP includes version/about and key phase commands", () => {
    expect(SESSION_HELP).toContain("/version");
    expect(SESSION_HELP).toContain("/about");
    expect(SESSION_HELP).toContain("/ownership");
    expect(SESSION_HELP).toContain("/report");
    expect(SESSION_HELP).toContain("/doctor");
    expect(SESSION_HELP).toContain("/diagnose");
  });

  it("startup diagnostics pass on a writable temp data dir", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-p9-"));
    try {
      const paths = ensureDataDirs(getDataPaths(root));
      const config = loadConfig(paths);
      const checks = runStartupDiagnostics(paths, config);
      expect(checks.some((c) => c.message.includes("writable"))).toBe(true);
      expect(checks.filter((c) => c.level === "error")).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
