import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import { TasteManager } from "../src/taste/taste.js";

describe("TasteManager + TasteEngine", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("records accept/reject/edit signals and updates taste.md", async () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-taste-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const taste = new TasteManager(paths);

    await taste.record({
      type: "accept",
      originalResponse: "Change oil every 5k with synthetic.",
      userMessage: "oil interval?",
      reason: "prefer preventive maintenance schedule",
    });
    await taste.record({
      type: "reject",
      originalResponse: "Ignore the CEL.",
      userMessage: "CEL on",
      reason: "unsafe advice",
    });
    await taste.record({
      type: "edit",
      originalResponse: "Use cheapest pads.",
      userCorrection: "Prefer OEM ceramic pads for daily driving.",
      userMessage: "brake pads?",
    });

    const summary = taste.summarize();
    expect(summary.totalSignals).toBe(3);
    expect(summary.accepts).toBe(1);
    expect(summary.rejects).toBe(1);
    expect(summary.edits).toBe(1);
    expect(taste.readTasteMarkdown()).toContain("Learned Signals");
    expect(taste.readTasteMarkdown()).toContain("REJECT");
    expect(taste.engine.loadProfile().version).toBeGreaterThanOrEqual(3);
  });

  it("promotes repeated DIY signals into a skill and injects compact taste", async () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-skills-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const taste = new TasteManager(paths);

    for (let i = 0; i < 3; i++) {
      await taste.record({
        type: "accept",
        originalResponse: "Here is a DIY oil change checklist.",
        userMessage: "how do I change oil DIY?",
        reason: "love DIY step-by-step checklists",
      });
    }

    const diy = taste.getSkill("diy-first");
    expect(diy).not.toBeNull();
    expect(diy!.confidence).toBeGreaterThanOrEqual(0.55);

    const relevant = taste.selectRelevantSkills("DIY oil change checklist", []);
    expect(relevant.some((s) => s.slug === "diy-first")).toBe(true);

    const compact = taste.compactTasteSummary();
    expect(compact).toMatch(/Personal/i);
    expect(compact.toLowerCase()).toContain("diy");
  });

  it("supports forget and relearn", async () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-forget-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const taste = new TasteManager(paths);

    await taste.record({
      type: "edit",
      originalResponse: "Buy the cheapest filter.",
      userCorrection: "Always prefer OEM filters.",
      userMessage: "oil filter?",
    });
    await taste.record({
      type: "accept",
      originalResponse: "OEM filter is the way.",
      userMessage: "confirm filter",
      reason: "OEM preferred",
    });
    await taste.record({
      type: "accept",
      originalResponse: "Stick with OEM.",
      userMessage: "again",
      reason: "OEM quality parts please",
    });

    expect(taste.getSkill("oem-preferred")).not.toBeNull();

    const forgot = taste.forget("oem");
    expect(forgot.preferencesRemoved.length).toBeGreaterThan(0);

    const insight = await taste.relearn();
    expect(insight.summaryLines[0]).toMatch(/Re-analyzed/i);
  });
});
