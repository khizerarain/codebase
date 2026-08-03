import { describe, expect, it } from "vitest";
import { calculateTool } from "../src/agent/tools.js";

describe("calculateTool", () => {
  it("evaluates basic arithmetic", () => {
    expect(calculateTool("2 + 2")).toBe("4");
    expect(calculateTool("(10 + 5) * 2")).toBe("30");
  });

  it("rejects unsafe input", () => {
    expect(() => calculateTool("process.exit(1)")).toThrow();
    expect(() => calculateTool("2 + foo")).toThrow();
  });
});
