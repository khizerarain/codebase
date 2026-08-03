import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import { VehicleStore } from "../src/vehicles/vehicles.js";

describe("VehicleStore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("adds, activates, and lists rich vehicles", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-vehicles-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const store = new VehicleStore(paths);

    const v = store.add({
      year: 2018,
      make: "Toyota",
      model: "Tacoma",
      mileage: 92000,
      fuelType: "gas",
      modifications: ["bilstein 5100"],
      knownIssues: ["rear tip-in clunk"],
    });

    expect(v.id).toBeTruthy();
    expect(v.currentMileage).toBe(92000);
    expect(store.getActiveId()).toBe(v.id);
    expect(store.list()).toHaveLength(1);
    expect(store.formatList()).toContain("Tacoma");
    expect(store.promptSummary()).toContain("bilstein 5100");

    store.update(v.id, { currentMileage: 93500, engine: "3.5 V6" });
    store.addServiceRecord(v.id, {
      date: "2026-01-15",
      mileage: 93000,
      description: "Oil + filter",
      cost: 65,
      diy: true,
    });

    const updated = store.get(v.id)!;
    expect(updated.currentMileage).toBe(93500);
    expect(updated.serviceHistory).toHaveLength(1);
    expect(store.formatHistory(updated)).toContain("Oil + filter");
  });

  it("migrates legacy mileage field", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-legacy-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const file = join(paths.vehicles, "legacy.json");
    writeFileSync(
      file,
      JSON.stringify({
        id: "legacy",
        make: "Honda",
        model: "Civic",
        year: 2012,
        mileage: 140000,
        notes: "daily",
      }),
      "utf8",
    );

    const store = new VehicleStore(paths);
    const v = store.get("legacy");
    expect(v?.currentMileage).toBe(140000);
    expect(v?.fuelType).toBe("gas");
  });
});
