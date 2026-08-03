import { describe, expect, it } from "vitest";
import {
  assessRisk,
  withSafetyFooter,
} from "../src/agent/safety.js";

describe("safety layer", () => {
  it("classifies risk levels", () => {
    expect(assessRisk("change cabin air filter")).toBe("low");
    expect(assessRisk("rough idle misfire diagnosis")).toBe("medium");
    expect(assessRisk("soft brake pedal and grinding")).toBe("high");
  });

  it("stamps suggestion/action and footer on high-risk content", () => {
    const out = withSafetyFooter(
      "Possible causes include pad wear. Check thickness.",
      "brake grinding noise",
    );
    expect(out).toMatch(/HIGH RISK/);
    expect(out).toMatch(/Safety note:/);
    expect(out).toMatch(/Suggestion:/i);
  });
});
