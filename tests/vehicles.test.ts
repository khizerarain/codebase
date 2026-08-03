import { mkdtempSync, rmSync } from "node:fs";
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

  it("adds and lists vehicles", () => {
    const root = mkdtempSync(join(tmpdir(), "codebase-vehicles-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const store = new VehicleStore(paths);

    const v = store.add({
      year: 2018,
      make: "Toyota",
      model: "Tacoma",
      mileage: 92000,
      modifications: ["bilstein 5100"],
    });

    expect(v.id).toBeTruthy();
    expect(store.list()).toHaveLength(1);
    expect(store.formatList()).toContain("Tacoma");
    expect(store.promptSummary()).toContain("bilstein 5100");
  });
});
