import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureDataDirs, getDataPaths } from "../src/config/config.js";
import { PlanStore } from "../src/plans/plans.js";

describe("PlanStore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("creates, approves, and persists plans as markdown", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-plans-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const store = new PlanStore(paths);

    const plan = store.create({
      title: "Oil service plan",
      goal: "Plan a DIY oil change",
      steps: ["Load vehicle", "Build checklist", "Estimate cost"],
      mode: "maintenance",
    });

    expect(plan.status).toBe("awaiting_approval");
    expect(store.get(plan.id)?.steps).toHaveLength(3);

    store.approve(plan.id);
    expect(store.get(plan.id)?.status).toBe("approved");

    store.markDone(plan.id, "All done");
    const done = store.get(plan.id)!;
    expect(done.status).toBe("done");
    expect(done.resultMarkdown).toContain("All done");

    const md = store.markdownPath(plan.id);
    expect(existsSync(md)).toBe(true);
    expect(readFileSync(md, "utf8")).toContain("Oil service plan");
  });
});
