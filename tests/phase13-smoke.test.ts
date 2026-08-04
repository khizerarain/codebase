/**
 * Fast smoke subset — critical invariants without heavy multi-step workflows.
 * Run: pnpm test:smoke
 */
import { describe, expect, it } from "vitest";
import { expandAlias } from "../src/cli/aliases.js";
import { assessRisk } from "../src/agent/safety.js";
import { calculateTool } from "../src/agent/tools.js";
import { APP_VERSION } from "../src/version.js";
import { MockLLMProvider } from "../src/testing/mock-llm.js";
import { MockVehicleDataProvider } from "../src/obd/mock.js";
import { createTestHarness, useTempCleanup } from "./helpers/harness.js";

describe("Phase 13 smoke", () => {
  useTempCleanup();

  it("package version is semver-shaped", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("aliases + safety + calculate stay wired", () => {
    expect(expandAlias("/d brake squeal")).toBe("/diagnose brake squeal");
    expect(assessRisk("soft brake pedal")).toBe("high");
    expect(calculateTool("3*7")).toContain("21");
  });

  it("MockLLM and MockOBD connect without network", async () => {
    const llm = new MockLLMProvider();
    llm.enqueueText("ok");
    expect((await llm.chat([{ role: "user", content: "hi" }])).content).toBe(
      "ok",
    );

    const obd = new MockVehicleDataProvider();
    await obd.connect();
    expect(obd.isConnected()).toBe(true);
    const snap = await obd.getSnapshot();
    expect(snap.provider).toBe("mock");
    await obd.disconnect();
  });

  it("harness boots with vehicle + empty doctor path", () => {
    const h = createTestHarness({ withTacoma: true });
    expect(h.vehicles.list()).toHaveLength(1);
    expect(h.llm.name).toBe("mock");
    expect(h.paths.root).toContain(h.root);
  });
});
