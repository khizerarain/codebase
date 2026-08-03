import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths, loadConfig } from "../src/config/config.js";
import { ContextAssembler } from "../src/data/context.js";
import {
  backupUserData,
  formatDoctorReport,
  rebuildIndexes,
  runDoctor,
} from "../src/data/doctor.js";
import { pickTopByRelevance, scoreRelevance } from "../src/data/relevance.js";
import { LocalDataStore } from "../src/data/store.js";
import { KnowledgeBase } from "../src/knowledge/knowledge.js";
import { MemoryStore } from "../src/memory/memory.js";
import { LongTermMemory } from "../src/memory/longterm.js";
import { PlanStore } from "../src/plans/plans.js";
import { TasteManager } from "../src/taste/taste.js";
import { VehicleStore } from "../src/vehicles/vehicles.js";

describe("Phase 7 data layer", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function harness() {
    const root = mkdtempSync(join(tmpdir(), "codebase-p7-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const config = loadConfig(paths);
    const vehicles = new VehicleStore(paths);
    const taste = new TasteManager(paths);
    const memory = new MemoryStore(paths);
    const longTerm = new LongTermMemory(paths);
    const knowledge = new KnowledgeBase(paths);
    const plans = new PlanStore(paths);
    const data = new LocalDataStore({
      paths,
      config,
      vehicles,
      taste,
      memory,
      longTerm,
      knowledge,
      plans,
    });
    return { paths, data, vehicles, longTerm, knowledge };
  }

  it("scores relevance and picks top items", () => {
    expect(scoreRelevance("brake pad squeal", "front brake pads squealing")).toBeGreaterThan(
      scoreRelevance("brake pad squeal", "cabin air filter"),
    );
    const top = pickTopByRelevance(
      ["oil filter", "brake rotor", "spark plug"],
      "brake noise",
      (s) => s,
      1,
    );
    expect(top[0]).toBe("brake rotor");
  });

  it("pins memory and prefers pinned in prompt summary", () => {
    const { longTerm, vehicles } = harness();
    const v = vehicles.add({
      year: 2018,
      make: "Toyota",
      model: "Tacoma",
      currentMileage: 90000,
      fuelType: "gas",
    });
    const a = longTerm.add({ text: "Prefer Motul 5W-30", kind: "personal" });
    longTerm.add({ text: "Temporary note about weather", kind: "context" });
    longTerm.pin(a.id.slice(0, 8));
    const summary = longTerm.promptSummary([v.id], {
      query: "oil change",
      limit: 4,
    });
    expect(summary).toContain("Motul");
    expect(summary).toContain("pinned");
  });

  it("assembles lean context with service extras when relevant", () => {
    const { data, vehicles } = harness();
    const v = vehicles.add({
      year: 2015,
      make: "Honda",
      model: "Civic",
      currentMileage: 120000,
      fuelType: "gas",
    });
    vehicles.addServiceRecord(v.id, {
      date: new Date().toISOString(),
      mileage: 119000,
      description: "Front brake pads replaced",
      cost: 180,
      diy: true,
    });
    const ctx = new ContextAssembler(data).assemble(
      "when did I last change the brake pads?",
    );
    expect(ctx.activeVehicle).toContain("Civic");
    expect(ctx.extraContext ?? "").toMatch(/brake/i);
  });

  it("runs doctor and backup cleanly", () => {
    const { data, vehicles, paths } = harness();
    vehicles.add({
      year: 2020,
      make: "Ford",
      model: "F-150",
      currentMileage: 40000,
      fuelType: "gas",
    });
    const report = runDoctor(data);
    expect(report.error).toBe(0);
    expect(formatDoctorReport(report)).toContain("Data doctor");

    const dest = backupUserData(data);
    expect(dest).toContain("backups");
    expect(dest.startsWith(paths.root)).toBe(true);
  });

  it("rebuilds knowledge index from stored docs", () => {
    const { data, knowledge, paths } = harness();
    const note = join(paths.root, "note.md");
    writeFileSync(note, "# Torque\n\nLug nuts 100 ft-lb\n", "utf8");
    knowledge.add(note, { title: "Torque notes" });
    const out = rebuildIndexes(data);
    expect(out).toContain("knowledge:");
    expect(knowledge.list()).toHaveLength(1);
  });

  it("suggests active vehicle when none set", () => {
    const { data, vehicles } = harness();
    vehicles.add({
      year: 2010,
      make: "Mazda",
      model: "3",
      currentMileage: 150000,
      fuelType: "gas",
    });
    // clear active if set
    const suggested = data.suggestActiveVehicle();
    expect(suggested?.model).toBe("3");
    expect(data.ensureSmartActive()?.model).toBe("3");
  });
});
