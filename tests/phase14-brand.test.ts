import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_DISPLAY_NAME,
  APP_NAME,
  APP_TAGLINE,
  DATA_DIR_NAME,
  ENV_HOME,
  PUBLIC_SAFETY_BLURB,
} from "../src/brand.js";
import { SESSION_HELP } from "../src/agent/prompts.js";
import { formatAbout, formatVersionLine } from "../src/version.js";
import { resolveDataRoot } from "../src/config/config.js";

describe("Phase 14 brand freeze", () => {
  it("locks Bay identity constants", () => {
    expect(APP_NAME).toBe("bay");
    expect(APP_DISPLAY_NAME).toBe("Bay");
    expect(APP_TAGLINE.toLowerCase()).toMatch(/local-first|garage|vehicles/);
    expect(DATA_DIR_NAME).toBe(".bay");
    expect(ENV_HOME).toBe("BAY_HOME");
    expect(PUBLIC_SAFETY_BLURB).toMatch(/not a certified mechanic/i);
  });

  it("package.json binary and name match Bay", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { name: string; bin: Record<string, string>; version: string };
    expect(pkg.name).toBe("bay");
    expect(pkg.bin.bay).toBeTruthy();
    expect(pkg.bin.codebase).toBeUndefined();
    expect(pkg.bin.cb).toBeUndefined();
    expect(pkg.version).toMatch(/^0\.14\./);
  });

  it("about + help are launch-ready", () => {
    expect(formatVersionLine()).toMatch(/^bay /);
    const about = formatAbout();
    expect(about).toMatch(/Bay/);
    expect(about).toMatch(/local-first|Privacy|Safety/i);
    expect(about).not.toMatch(/Codebase —/);

    expect(SESSION_HELP).toMatch(/Bay help|start here/i);
    expect(SESSION_HELP).toContain("/diagnose");
    expect(SESSION_HELP).toContain("/vehicles add");
    expect(SESSION_HELP).toContain("/obd connect mock");
    expect(SESSION_HELP).toContain("/taste");
    expect(SESSION_HELP).toContain("/report ownership");
    expect(SESSION_HELP).toMatch(/~\/\.bay/);
  });

  it("resolveDataRoot prefers BAY_HOME when set", () => {
    const prev = process.env.BAY_HOME;
    process.env.BAY_HOME = "/tmp/bay-test-home-xyz";
    try {
      expect(resolveDataRoot()).toBe("/tmp/bay-test-home-xyz");
    } finally {
      if (prev === undefined) delete process.env.BAY_HOME;
      else process.env.BAY_HOME = prev;
    }
  });
});
