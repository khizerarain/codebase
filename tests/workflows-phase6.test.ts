import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import { TasteManager } from "../src/taste/taste.js";
import { VehicleStore } from "../src/vehicles/vehicles.js";
import { DiagnosticWorkflow } from "../src/workflows/diagnostics.js";
import { formatDueReport } from "../src/workflows/due.js";
import { buildServicePlan } from "../src/workflows/servicePlans.js";

describe("Phase 6 workflows", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("runs structured diagnosis through questions to ranked report", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-dx-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const taste = new TasteManager(paths);
    const vehicles = new VehicleStore(paths);
    const v = vehicles.add({
      year: 2018,
      make: "Toyota",
      model: "Tacoma",
      currentMileage: 92000,
    });

    const dx = new DiagnosticWorkflow(paths, taste);
    const first = dx.start("squeal when braking", v);
    expect(first.type).toBe("questions");
    expect(first.content).toMatch(/clarifying/i);

    let step = first;
    let guard = 0;
    while (step.type === "questions" && guard < 8) {
      step = dx.continueWith("cold mornings, pedal feels normal", v);
      guard++;
    }
    if (step.type === "questions") {
      step = dx.continueWith("done", v);
    }
    expect(step.type).toBe("report");
    expect(step.content).toMatch(/Possible causes/i);
    expect(step.content).toMatch(/Suggestion:/i);
    expect(step.content.toLowerCase()).toContain("brake");
  });

  it("builds taste-aware brake service plan and due report", async () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-svc-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const taste = new TasteManager(paths);
    const vehicles = new VehicleStore(paths);
    const v = vehicles.add({
      year: 2016,
      make: "Honda",
      model: "Civic",
      currentMileage: 118000,
      fuelType: "gas",
    });

    await taste.record({
      type: "accept",
      originalResponse: "OEM pads",
      userMessage: "pads",
      reason: "OEM preferred for brakes",
    });
    await taste.record({
      type: "accept",
      originalResponse: "OEM again",
      userMessage: "yes",
      reason: "stick with OEM parts",
    });
    await taste.record({
      type: "accept",
      originalResponse: "OEM third",
      userMessage: "ok",
      reason: "OEM quality please",
    });

    const { markdown } = buildServicePlan("front brake pads", v, taste);
    expect(markdown).toMatch(/Parts/i);
    expect(markdown).toMatch(/Procedure outline/i);
    expect(markdown.toLowerCase()).toContain("oem");

    vehicles.addServiceRecord(v.id, {
      date: "2024-01-01",
      mileage: 110000,
      description: "Oil + filter",
      cost: 55,
      diy: true,
    });

    const due = formatDueReport(vehicles, taste, { garage: true });
    expect(due).toMatch(/Due soon|OVERDUE/i);
    expect(due).toContain("Civic");
  });
});
