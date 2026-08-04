import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths, loadConfig } from "../src/config/config.js";
import { ObdManager } from "../src/obd/manager.js";
import { MockVehicleDataProvider } from "../src/obd/mock.js";
import { assessLiveRanges } from "../src/obd/ranges.js";
import { SerialObdProvider } from "../src/obd/serial.js";
import { TasteManager } from "../src/taste/taste.js";
import { VehicleStore } from "../src/vehicles/vehicles.js";
import { DiagnosticWorkflow } from "../src/workflows/diagnostics.js";

describe("Phase 10 OBD", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function harness() {
    const root = mkdtempSync(join(tmpdir(), "codebase-obd-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const config = loadConfig(paths);
    const vehicles = new VehicleStore(paths);
    const v = vehicles.add({
      year: 2019,
      make: "Mazda",
      model: "CX-5",
      currentMileage: 64000,
      fuelType: "gas",
    });
    const obd = new ObdManager(paths, config, vehicles);
    return { paths, config, vehicles, v, obd };
  }

  it("mock provider connects and returns core PIDs + snapshot", async () => {
    const mock = new MockVehicleDataProvider();
    await mock.connect();
    expect(mock.isConnected()).toBe(true);
    const pids = await mock.getSupportedPids();
    expect(pids).toContain("rpm");
    mock.setScenario("cruise");
    const snap = await mock.getSnapshot();
    expect(snap.values.speed).toBeGreaterThan(0);
    expect(snap.provider).toBe("mock");
    await mock.disconnect();
    expect(mock.isConnected()).toBe(false);
  });

  it("ObdManager mock flow: status, dtc, snapshot, history attach", async () => {
    const { obd, v, vehicles } = harness();
    await obd.connect("mock", { scenario: "fault_catalyst" });
    const status = await obd.status();
    expect(status).toMatch(/connected/i);
    expect(status).toMatch(/RPM|Coolant/i);

    const dtc = await obd.dtc();
    expect(dtc).toMatch(/P0420/);

    const { snap, markdown } = await obd.snapshot(true);
    expect(snap.vehicleId).toBe(v.id);
    expect(markdown).toMatch(/OBD Snapshot/);
    expect(obd.store.listSnapshots(v.id).length).toBeGreaterThan(0);

    const updated = vehicles.get(v.id)!;
    expect(
      updated.serviceHistory.some((r) => /OBD/i.test(r.description)),
    ).toBe(true);

    await obd.disconnect();
  });

  it("serial skeleton fails gracefully without claiming connection", async () => {
    const serial = new SerialObdProvider({ port: "COM99" });
    await expect(serial.connect()).rejects.toThrow(/not fully wired|adapter-ready/i);
    expect(serial.isConnected()).toBe(false);
  });

  it("range assessor flags hot coolant", () => {
    const checks = assessLiveRanges({ coolant_temp_c: 112, battery_v: 14.1, rpm: 900 });
    expect(checks.some((c) => c.pid === "coolant_temp_c" && c.status === "high")).toBe(
      true,
    );
  });

  it("diagnose includes live DTCs when OBD connected", async () => {
    const { paths, obd, v } = harness();
    const taste = new TasteManager(paths);
    await obd.connect("mock", { scenario: "fault_catalyst" });
    const dx = new DiagnosticWorkflow(paths, taste);
    dx.setLiveDataProvider(() => obd.liveContext());
    let step = await dx.start("check engine light rough idle", v);
    while (step.type === "questions") {
      step = await dx.continueWith("done", v);
    }
    expect(step.type).toBe("report");
    expect(step.content).toMatch(/Live OBD|P0420|catalytic/i);
    await obd.disconnect();
  });
});
