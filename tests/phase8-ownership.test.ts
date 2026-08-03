import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import {
  buildOwnershipDecision,
  buildPrePurchaseReport,
} from "../src/ownership/decision.js";
import { OwnershipEngine } from "../src/ownership/engine.js";
import {
  ensureExampleMod,
  ModRegistry,
} from "../src/mods/registry.js";
import { generateReport, listReportKinds } from "../src/reports/reports.js";
import { TasteManager } from "../src/taste/taste.js";
import { VehicleStore } from "../src/vehicles/vehicles.js";

describe("Phase 8 ownership, reports, mods", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function harness() {
    const root = mkdtempSync(join(tmpdir(), "codebase-p8-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const vehicles = new VehicleStore(paths);
    const taste = new TasteManager(paths);
    const v = vehicles.add({
      year: 2016,
      make: "Subaru",
      model: "Outback",
      currentMileage: 110000,
      fuelType: "gas",
    });
    vehicles.update(v.id, {
      knownIssues: ["Valve cover seepage"],
    });
    vehicles.addServiceRecord(v.id, {
      date: "2024-01-10",
      mileage: 100000,
      description: "Oil + filter",
      cost: 70,
      diy: true,
    });
    vehicles.addServiceRecord(v.id, {
      date: "2025-06-01",
      mileage: 108000,
      description: "Front brakes",
      cost: 420,
      diy: false,
    });
    const fresh = vehicles.get(v.id)!;
    const ownership = new OwnershipEngine(vehicles, taste);
    return { paths, vehicles, taste, ownership, v: fresh };
  }

  it("computes ownership health and cost/mi", () => {
    const { ownership, v } = harness();
    const snap = ownership.analyzeVehicle(v);
    expect(snap.cost.loggedPartsAndService).toBe(490);
    expect(snap.cost.costPerMile).toBeGreaterThan(0);
    expect(snap.health.score).toBeGreaterThan(0);
    expect(snap.health.grade).toMatch(/[A-F]/);
    expect(ownership.formatVehicleReport(snap)).toContain("Ownership");
  });

  it("builds garage overview and decision support", () => {
    const { ownership, vehicles, taste, v } = harness();
    const overview = ownership.garageOverview();
    expect(overview.vehicleCount).toBe(1);
    expect(overview.totalLoggedSpend).toBe(490);

    const keep = buildOwnershipDecision("keep", vehicles, taste, ownership);
    expect(keep).toMatch(/decision support|Should I keep/i);
    expect(keep).toContain("not");

    const ppi = buildPrePurchaseReport(v, taste, ownership);
    expect(ppi).toMatch(/Pre-purchase|Pre-Purchase/i);
    expect(ppi).toContain("checklist");
  });

  it("saves professional reports under exports/reports", () => {
    const { paths, vehicles, taste, ownership } = harness();
    expect(listReportKinds()).toContain("ownership");
    const saved = generateReport("ownership", {
      paths,
      vehicles,
      taste,
      ownership,
      exports: { last: "" },
    });
    expect(saved.path).toContain("reports");
    expect(saved.markdown).toContain("Ownership Cost Report");
    expect(saved.markdown).toContain("Disclaimer");
  });

  it("loads declarative mods, enable/disable, and commands", () => {
    const { paths } = harness();
    ensureExampleMod(paths);
    const mods = new ModRegistry(paths);
    const example = mods.get("example-fleet-notes");
    expect(example).toBeTruthy();
    // seeded disabled
    expect(example!.enabled).toBe(false);
    mods.enable("example-fleet-notes");
    expect(mods.get("example-fleet-notes")!.enabled).toBe(true);
    expect(mods.enabledSkills().some((s) => s.slug === "mod-fleet-cadence")).toBe(
      true,
    );
    const cmd = mods.tryCommand("/fleetnotes");
    expect(cmd).toContain("Fleet notes");
    mods.disable("example-fleet-notes");
    expect(mods.tryCommand("/fleetnotes")).toBeNull();
  });
});
