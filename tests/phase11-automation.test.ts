import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WatchdogEngine } from "../src/automation/engine.js";
import { formatAlertList, formatWatchdogList } from "../src/automation/format.js";
import { ensureDataDirs, getDataPaths, loadConfig } from "../src/config/config.js";
import { ObdManager } from "../src/obd/manager.js";
import { TasteManager } from "../src/taste/taste.js";
import { VehicleStore } from "../src/vehicles/vehicles.js";

describe("Phase 11 automation", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function harness() {
    const root = mkdtempSync(join(tmpdir(), "codebase-auto-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const config = loadConfig(paths);
    config.automation.assertiveness = "assertive";
    config.automation.maxBriefingAlerts = 8;
    const vehicles = new VehicleStore(paths);
    const taste = new TasteManager(paths);
    const obd = new ObdManager(paths, config, vehicles);
    const engine = new WatchdogEngine(paths, config, vehicles, taste, obd);
    return { paths, config, vehicles, taste, obd, engine };
  }

  it("lists watchdogs and respects enable/disable", () => {
    const { engine } = harness();
    expect(engine.listDefinitions().length).toBeGreaterThan(3);
    expect(engine.isEnabled("overdue_maintenance")).toBe(true);
    engine.disable("overdue_maintenance");
    expect(engine.isEnabled("overdue_maintenance")).toBe(false);
    engine.enable("overdue_maintenance");
    expect(formatWatchdogList(engine)).toMatch(/overdue_maintenance/);
  });

  it("detects overdue maintenance and supports dismiss", async () => {
    const { engine, vehicles } = harness();
    // High mileage with empty history → oil change etc. often overdue
    vehicles.add({
      year: 2012,
      make: "Ford",
      model: "Focus",
      currentMileage: 145000,
      fuelType: "gas",
    });

    const alerts = await engine.run();
    expect(alerts.some((a) => a.watchdogId === "overdue_maintenance")).toBe(true);
    const hit = alerts.find((a) => a.watchdogId === "overdue_maintenance")!;
    expect(hit.reason.length).toBeGreaterThan(10);
    expect(hit.suggestedCommands.length).toBeGreaterThan(0);

    engine.dismiss(hit.id.slice(0, 8));
    const after = await engine.run();
    expect(after.every((a) => a.fingerprint !== hit.fingerprint)).toBe(true);

    expect(formatAlertList(alerts)).toMatch(/why:/i);
  });

  it("live_range_anomaly fires when mock OBD is hot", async () => {
    const { engine, obd, vehicles } = harness();
    vehicles.add({
      year: 2018,
      make: "Toyota",
      model: "Camry",
      currentMileage: 50000,
      fuelType: "gas",
    });
    await obd.connect("mock", { scenario: "hot" });
    const alerts = await engine.run({ ids: ["live_range_anomaly"] });
    expect(alerts.some((a) => a.watchdogId === "live_range_anomaly")).toBe(true);
    await obd.disconnect();
  });

  it("quiet briefing prefers stronger severities", async () => {
    const { engine, vehicles, config } = harness();
    config.automation.assertiveness = "quiet";
    config.automation.maxBriefingAlerts = 3;
    vehicles.add({
      year: 2010,
      make: "Honda",
      model: "Fit",
      currentMileage: 160000,
      fuelType: "gas",
    });
    const briefing = await engine.briefing();
    expect(briefing.length).toBeLessThanOrEqual(3);
  });
});
