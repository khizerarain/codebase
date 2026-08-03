import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeTool } from "../src/agent/tools.js";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import { TasteManager } from "../src/taste/taste.js";
import { VehicleStore } from "../src/vehicles/vehicles.js";

describe("Phase 3 tools", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("generates maintenance schedule and compares parts with taste", async () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-tools3-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const vehicles = new VehicleStore(paths);
    const taste = new TasteManager(paths);

    vehicles.add({
      year: 2018,
      make: "Toyota",
      model: "Tacoma",
      currentMileage: 92000,
      fuelType: "gas",
    });

    await taste.record({
      type: "accept",
      originalResponse: "OEM pads",
      userMessage: "pads?",
      reason: "OEM preferred quality parts",
    });
    await taste.record({
      type: "accept",
      originalResponse: "OEM again",
      userMessage: "confirm",
      reason: "OEM parts please",
    });
    await taste.record({
      type: "accept",
      originalResponse: "OEM third",
      userMessage: "again",
      reason: "stick with OEM",
    });

    const schedule = await executeTool(
      "generate_maintenance_schedule",
      {},
      { vehicles, taste, paths },
    );
    expect(schedule.ok).toBe(true);
    expect(schedule.output).toContain("Maintenance schedule");
    expect(schedule.output).toContain("Tacoma");

    const cmp = await executeTool(
      "compare_parts",
      { title: "Brake pads", part: "front brake pads" },
      { vehicles, taste, paths },
    );
    expect(cmp.ok).toBe(true);
    expect(cmp.output.toLowerCase()).toContain("oem");

    const checklist = await executeTool(
      "create_checklist",
      {
        title: "Oil change",
        steps: ["Warm engine", "Drain oil", "Replace filter", "Refill"],
      },
      { vehicles, taste, paths },
    );
    expect(checklist.output).toContain("[ ]");
  });
});
