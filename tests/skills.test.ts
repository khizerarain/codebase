import { describe, expect, it } from "vitest";
import { markdownToSkill, skillToMarkdown } from "../src/taste/skills.js";
import type { Skill } from "../src/taste/schema.js";

describe("skill markdown roundtrip", () => {
  it("serializes and parses skill files", () => {
    const skill: Skill = {
      slug: "budget-conscious",
      name: "Budget Conscious",
      description: "Prefer value options",
      whenToApply: "Parts and service cost tradeoffs",
      rules: ["Offer a good/better/best cost ladder", "Call out false economy"],
      confidence: 0.72,
      scope: "personal",
      vehicleIds: [],
      tags: ["budget", "value"],
      evidenceCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUpdated: "2026-01-02T00:00:00.000Z",
    };

    const md = skillToMarkdown(skill);
    const parsed = markdownToSkill(md, "budget-conscious");
    expect(parsed.slug).toBe("budget-conscious");
    expect(parsed.rules).toContain("Offer a good/better/best cost ladder");
    expect(parsed.confidence).toBeCloseTo(0.72);
  });
});
