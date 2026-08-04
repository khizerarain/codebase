import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "../src/testing/mock-llm.js";
import { createTestHarness, useTempCleanup } from "./helpers/harness.js";

describe("Phase 13 MockLLM + agent paths", () => {
  useTempCleanup();

  it("scripts text and tool-call responses deterministically", async () => {
    const llm = new MockLLMProvider({
      defaultResponse: { content: "fallback" },
    });
    llm.enqueueText("hello world", "greet");
    llm.enqueueToolCall("calculate", { expression: "2+2" }, "", "math");

    const a = await llm.chat([{ role: "user", content: "please greet me" }]);
    expect(a.content).toBe("hello world");

    const b = await llm.chat([{ role: "user", content: "do math" }], []);
    expect(b.toolCalls?.[0]?.name).toBe("calculate");
    expect(b.toolCalls?.[0]?.arguments).toEqual({ expression: "2+2" });

    const c = await llm.chat([{ role: "user", content: "anything" }]);
    expect(c.content).toBe("fallback");
    expect(llm.calls).toHaveLength(3);
  });

  it("creates a plan from scripted JSON without network", async () => {
    const h = createTestHarness({ withTacoma: true });
    h.llm.enqueuePlan("Oil DIY plan", [
      "Gather OEM filter + 5W-30",
      "Warm engine briefly",
      "Drain, replace filter, refill",
      "Torque drain plug to spec",
    ]);

    const result = await h.agent.createPlan(
      "Plan a DIY oil change",
      "maintenance",
    );
    expect(result.kind).toBe("plan");
    expect(result.plan?.title).toBe("Oil DIY plan");
    expect(result.plan?.steps.length).toBe(4);
    expect(result.response).toMatch(/awaiting_approval|Steps/i);
    expect(h.llm.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("runs tool-call then final answer via MockLLM", async () => {
    const h = createTestHarness({ withTacoma: true });
    h.llm.enqueueToolCall("calculate", { expression: "10+5" });
    h.llm.enqueueText(
      "Calculation complete: 15. Suggestion only — verify before acting.",
    );

    const result = await h.agent.answer("What is 10+5 for a tip calc?");
    expect(result.response).toMatch(/15/);
    expect(h.llm.calls.length).toBe(2);
    // Safety footer applied on agent answers
    expect(result.response).toMatch(/Safety note:|Suggestion:/i);
  });

  it("plan → approve → execute stays offline with scripts", async () => {
    const h = createTestHarness({ withTacoma: true });
    h.llm.enqueuePlan("Pad inspect", [
      "Measure pad thickness",
      "Check rotor surface",
      "Log findings",
    ]);
    // execute path calls answer()
    h.llm.enqueueText(
      "Pads look OK at 6mm. Suggestion: recheck at next oil change.",
    );

    const planned = await h.agent.createPlan(
      "Inspect front brake pads",
      "maintenance",
    );
    expect(planned.plan?.status).toBe("awaiting_approval");

    const done = await h.agent.approveAndExecute();
    expect(done.plan?.status).toBe("done");
    expect(done.response).toMatch(/Pads look OK|6mm/i);
    expect(done.response).toMatch(/Suggestion:/i);
  });
});
