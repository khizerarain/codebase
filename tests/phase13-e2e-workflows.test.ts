import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleModeCommand } from "../src/cli/phase12.js";
import { setConfigValue } from "../src/config/config.js";
import { exportContent } from "../src/export/export.js";
import { generateReport } from "../src/reports/reports.js";
import { generateMaintenanceSchedule } from "../src/agent/tools.js";
import { DiagnosticWorkflow } from "../src/workflows/diagnostics.js";
import { diyTasteSignals, oemTasteSignals } from "./helpers/fixtures.js";
import { createTestHarness, useTempCleanup } from "./helpers/harness.js";

describe("Phase 13 end-to-end workflows", () => {
  useTempCleanup();

  it("add vehicle → active → maintenance schedule", () => {
    const h = createTestHarness();
    const v = h.vehicles.add({
      year: 2020,
      make: "Ford",
      model: "Escape",
      currentMileage: 40000,
      fuelType: "gas",
    });
    h.vehicles.setActive(v.id);
    expect(h.vehicles.getActive()?.model).toBe("Escape");

    const schedule = generateMaintenanceSchedule({
      vehicles: h.vehicles,
      taste: h.taste,
      paths: h.paths,
    });
    expect(schedule).toMatch(/Escape|Maintenance|oil|Oil/i);
    expect(schedule).not.toMatch(/No vehicle available/);
  });

  it("taste signals update taste.md and skills", async () => {
    const h = createTestHarness({ withTacoma: true });
    for (const s of oemTasteSignals()) {
      await h.taste.record(s);
    }
    expect(h.taste.getSkill("oem-preferred")).not.toBeNull();
    expect(h.taste.readTasteMarkdown()).toMatch(/OEM|Learned|ACCEPT/i);

    for (const s of diyTasteSignals()) {
      await h.taste.record(s);
    }
    const diy = h.taste.selectRelevantSkills("DIY oil change checklist", []);
    expect(diy.some((s) => s.slug === "diy-first")).toBe(true);
  });

  it("diagnosis with sample symptoms yields structured safe report", async () => {
    const h = createTestHarness({ withTacoma: true });
    const v = h.vehicles.getActive()!;
    const dx = new DiagnosticWorkflow(h.paths, h.taste);
    let step = await dx.start("squeal when braking cold mornings", v);
    let guard = 0;
    while (step.type === "questions" && guard < 8) {
      step = await dx.continueWith("pedal firm, only cold, done", v);
      guard++;
    }
    if (step.type === "questions") {
      step = await dx.continueWith("done", v);
    }
    expect(step.type).toBe("report");
    expect(step.content).toMatch(/Possible causes/i);
    expect(step.content).toMatch(/Suggestion:/i);
    expect(step.content).toMatch(/Safety note:|not a certified|professional/i);
  });

  it("mock OBD → DTCs → diagnosis includes live codes", async () => {
    const h = createTestHarness({ withTacoma: true });
    await h.obd.connect("mock", { scenario: "fault_catalyst" });
    const dtcMd = await h.obd.dtc({ attachHistory: false });
    expect(dtcMd).toMatch(/P0420|catalyst|DTC/i);

    const dx = new DiagnosticWorkflow(h.paths, h.taste);
    dx.setLiveDataProvider(() => h.obd.liveContext());
    const v = h.vehicles.getActive()!;
    let step = await dx.start("check engine light rough idle", v);
    let guard = 0;
    while (step.type === "questions" && guard < 8) {
      step = await dx.continueWith("steady CEL, worse when warm, done", v);
      guard++;
    }
    if (step.type === "questions") step = await dx.continueWith("done", v);
    expect(step.type).toBe("report");
    expect(step.content).toMatch(/P0420|live|OBD|DTC/i);
    await h.obd.disconnect();
  });

  it("watchdogs flag overdue maintenance on high-mileage garage", async () => {
    const h = createTestHarness({
      withCivic: true,
      configure: (c) => {
        c.automation.assertiveness = "assertive";
        c.automation.maxBriefingAlerts = 8;
      },
    });
    // Civic is high mileage with no history → overdue oil etc.
    const civic = h.vehicles.list().find((v) => v.model === "Civic")!;
    h.vehicles.setActive(civic.id);
    const alerts = await h.watchdogs.run();
    expect(alerts.some((a) => a.watchdogId === "overdue_maintenance")).toBe(
      true,
    );
    const briefing = await h.watchdogs.briefing();
    expect(briefing.length).toBeGreaterThan(0);
  });

  it("ownership health report generates and exports under local root", () => {
    const h = createTestHarness({ withTacoma: true });
    const saved = generateReport("ownership", {
      paths: h.paths,
      vehicles: h.vehicles,
      taste: h.taste,
      ownership: h.ownership,
      exports: h.agent.exports,
    });
    expect(saved.path.startsWith(h.paths.reports)).toBe(true);
    expect(saved.path.startsWith(h.root)).toBe(true);
    expect(saved.markdown).toMatch(/Ownership|Disclaimer/i);
    expect(existsSync(saved.path)).toBe(true);

    h.agent.setLastExportable(saved.markdown, "service");
    const exported = exportContent(h.paths, h.agent.exports, "last", "md");
    expect(exported.path.startsWith(h.paths.exports)).toBe(true);
    expect(readFileSync(exported.path, "utf8")).toContain("Disclaimer");
  });

  it("config + garage mode switching persists", () => {
    const h = createTestHarness();
    expect(h.config.interaction.mode).toBe("normal");
    const next = handleModeCommand("/mode garage", h.config, h.paths);
    expect(next.interaction.mode).toBe("garage");

    const short = setConfigValue(next, "interaction.verbosity", "short");
    expect(short.interaction.verbosity).toBe("short");
  });
});
