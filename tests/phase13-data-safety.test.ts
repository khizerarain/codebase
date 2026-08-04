import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withSafetyFooter } from "../src/agent/safety.js";
import {
  ensureDataDirs,
  getDataPaths,
  loadConfig,
} from "../src/config/config.js";
import {
  formatDoctorReport,
  runDoctor,
} from "../src/data/doctor.js";
import { exportContent } from "../src/export/export.js";
import { VehicleSchema } from "../src/vehicles/schema.js";
import { createTestHarness, useTempCleanup } from "./helpers/harness.js";

describe("Phase 13 data safety & regression guards", () => {
  useTempCleanup();

  it("keeps user data under the harness root", () => {
    const h = createTestHarness({ withTacoma: true });
    const root = resolve(h.root);
    expect(resolve(h.paths.vehicles).startsWith(root)).toBe(true);
    expect(resolve(h.paths.taste).startsWith(root)).toBe(true);
    expect(resolve(h.paths.exports).startsWith(root)).toBe(true);
    expect(resolve(h.paths.obd).startsWith(root)).toBe(true);
    expect(resolve(h.paths.automation).startsWith(root)).toBe(true);
    // Vehicle JSON lives under vehicles/
    const files = h.vehicles.list().map((v) =>
      join(h.paths.vehicles, `${v.id}.json`),
    );
    for (const f of files) {
      expect(existsSync(f)).toBe(true);
      expect(resolve(f).startsWith(root)).toBe(true);
    }
  });

  it("exports only write inside paths.exports", () => {
    const h = createTestHarness();
    h.agent.setLastExportable(
      "# Diagnostic report\n\nPossible causes listed.\n",
      "diagnosis",
    );
    const result = exportContent(h.paths, h.agent.exports, "diagnosis", "md");
    expect(resolve(result.path).startsWith(resolve(h.paths.exports))).toBe(
      true,
    );
    expect(result.path).not.toMatch(/\.\./);
    // Does not escape into system temp outside root
    expect(resolve(result.path).startsWith(resolve(h.root))).toBe(true);
  });

  it("rejects invalid vehicle schema cleanly", () => {
    const bad = VehicleSchema.safeParse({
      id: "x",
      make: "",
      model: "Civic",
      year: 1700,
      currentMileage: -5,
    });
    expect(bad.success).toBe(false);

    const good = VehicleSchema.safeParse({
      id: "ok",
      make: "Honda",
      model: "Civic",
      year: 2015,
      currentMileage: 80000,
    });
    expect(good.success).toBe(true);
  });

  it("safety disclaimers appear on high-risk diagnostic text", () => {
    const stamped = withSafetyFooter(
      "Possible causes: master cylinder leak. Bleed brakes.",
      "soft brake pedal grinding",
    );
    expect(stamped).toMatch(/HIGH RISK|Safety note:/i);
    expect(stamped).toMatch(/Suggestion:/i);
  });

  it("broken knowledge/memory refs do not crash; doctor reports them", () => {
    const h = createTestHarness({ withTacoma: true });
    const v = h.vehicles.getActive()!;

    // Memory pointing at missing vehicle
    h.longTerm.add({
      text: "Orphan fact about ghost vehicle",
      kind: "context",
      vehicleIds: ["missing-vehicle-id-000"],
    });

    // Knowledge index entry with missing stored file
    const indexPath = join(h.paths.knowledge, "index.json");
    mkdirSync(join(h.paths.knowledge, "docs"), { recursive: true });
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          docs: [
            {
              id: "ghost-doc",
              title: "Missing manual",
              sourcePath: "/nowhere/manual.pdf",
              storedPath: join(h.paths.knowledge, "docs", "gone.txt"),
              vehicleIds: [v.id, "another-missing"],
              tags: [],
              addedAt: new Date().toISOString(),
              chunkCount: 0,
              kind: "text",
            },
          ],
          chunks: [],
        },
        null,
        2,
      ),
      "utf8",
    );

    // Search / list must not throw
    expect(() => h.knowledge.list()).not.toThrow();
    expect(() => h.knowledge.search("manual")).not.toThrow();
    expect(() => h.longTerm.list()).not.toThrow();
    expect(() => h.longTerm.promptSummary([v.id])).not.toThrow();

    const report = runDoctor(h.data);
    expect(report.error + report.warn).toBeGreaterThan(0);
    const text = formatDoctorReport(report);
    expect(text).toMatch(/memory|knowledge|missing/i);

    // Corrupt vehicle file → doctor error
    writeFileSync(
      join(h.paths.vehicles, "broken.json"),
      "{ not valid json",
      "utf8",
    );
    const report2 = runDoctor(h.data);
    expect(report2.error).toBeGreaterThan(0);
    expect(formatDoctorReport(report2)).toMatch(/Unreadable|Invalid|broken/i);
  });

  it("getDataPaths with exportDir override stays absolute under override", () => {
    const h = createTestHarness();
    const exportRoot = join(h.root, "custom-exports");
    const paths = ensureDataDirs(getDataPaths(h.root, exportRoot));
    expect(resolve(paths.exports)).toBe(resolve(exportRoot));
    expect(resolve(paths.reports).startsWith(resolve(exportRoot))).toBe(true);
    loadConfig(paths);
    expect(existsSync(paths.configFile)).toBe(true);
    // Config still under data root, not export override
    expect(resolve(paths.configFile).startsWith(resolve(h.root))).toBe(true);
    expect(readFileSync(paths.configFile, "utf8")).toMatch(/provider/);
  });
});
