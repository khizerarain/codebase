import { SAFETY_SYSTEM_BLOCK } from "./safety.js";

export interface PromptContext {
  tasteSummary: string;
  relevantSkills: string;
  vehiclesSummary: string;
  activeVehicle: string;
  memoryNotes: string;
  mode?: string;
  approvedPlan?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  return [
    "You are Codebase — a terminal-first AI vehicle agent.",
    "You help the user maintain, diagnose, modify, and care for their vehicles.",
    "You are practical, safety-aware, and concise. Prefer checklists and clear next steps.",
    "When vehicle context is missing and it matters, ask for make/model/year/mileage.",
    "Follow the user's taste and relevant skills below. Do not invent preferences they never showed.",
    "Use tools when they improve accuracy (vehicle data, schedules, cost, recalls, checklists).",
    "You may chain multiple tools. After observations, give a clear final answer.",
    "Do not invent torque specs, part numbers, or TSBs. If unsure, say so and suggest verification.",
    "",
    SAFETY_SYSTEM_BLOCK,
    "",
    ctx.mode ? `## Current Mode\n${ctx.mode}` : "",
    "",
    "## Active Vehicle",
    ctx.activeVehicle.trim(),
    "",
    "## User Vehicle Taste (compact)",
    ctx.tasteSummary.trim(),
    "",
    "## Relevant Skills",
    ctx.relevantSkills.trim(),
    "",
    "## Vehicles",
    ctx.vehiclesSummary.trim(),
    "",
    "## Recent Memory Notes",
    ctx.memoryNotes.trim(),
    "",
    ctx.approvedPlan
      ? `## Approved Plan (execute this)\n${ctx.approvedPlan}`
      : "",
  ]
    .filter((block) => block !== "")
    .join("\n");
}

export function buildPlanPrompt(goal: string, ctx: PromptContext): string {
  return [
    buildSystemPrompt(ctx),
    "",
    "## Planning Task",
    "Create a clear, numbered execution plan for the user's goal.",
    "Return ONLY a JSON object: {\"title\":\"...\",\"steps\":[\"step 1\", \"step 2\", ...]}",
    "Steps should be concrete tool/actions the agent can perform. 4-8 steps.",
    "Respect taste (DIY vs shop, budget, OEM, risk).",
    "",
    `User goal: ${goal}`,
  ].join("\n");
}

export const SESSION_HELP = `
Session commands:
  /accept [reason]     Mark last answer as good (Enter also accepts)
  /reject [reason]     Mark last answer as bad
  /edit                Edit last answer in $EDITOR and save as correction
  /plan [goal]         Force planning mode (Plan → approve → execute)
  /approve             Approve pending plan and execute
  /revise <feedback>   Revise pending plan
  /vehicles            List vehicles
  /vehicles add|switch|edit|delete ...
  /active              Show active vehicle
  /schedule            Maintenance schedule for active vehicle
  /diagnose [symptoms] Structured diagnostic mode
  /parts [part]        Parts research / comparison mode
  /history             Service history for active vehicle
  /export [name]       Export last plan/output as Markdown
  /taste               Show taste summary + top skills
  /taste edit          Open taste.md in $EDITOR
  /skills              List learned skills
  /skills <name>       Show a specific skill
  /forget <preference> Remove a preference or skill
  /learn               Re-analyze all signals into taste + skills
  /clear               Clear current session history
  /help                Show this help
  /exit                Quit
`.trim();

/** Heuristic: non-trivial work should enter planning mode. */
export function shouldAutoPlan(message: string): boolean {
  const m = message.toLowerCase();
  if (m.length < 24 && !/\b(plan|schedule|diagnose|repair|overhaul|estimate)\b/.test(m)) {
    return false;
  }
  return /\b(plan|schedule|maintenance plan|diagnose|diagnostic|repair|rebuild|overhaul|estimate|cost|checklist|parts list|service plan|full (service|inspection))\b/i.test(
    m,
  );
}
