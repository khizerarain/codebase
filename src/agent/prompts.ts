import { APP_DISPLAY_NAME, APP_TAGLINE, DATA_DIR_NAME } from "../brand.js";
import { SAFETY_SYSTEM_BLOCK } from "./safety.js";

export interface PromptContext {
  tasteSummary: string;
  relevantSkills: string;
  vehiclesSummary: string;
  activeVehicle: string;
  memoryNotes: string;
  longTermMemory: string;
  garagePrefs: string;
  mode?: string;
  approvedPlan?: string;
  /** Optional scored extras (service history, knowledge, garage focus). */
  extraContext?: string;
  /** Phase 12 interaction style */
  interactionMode?: "normal" | "garage";
  verbosity?: "short" | "normal" | "detailed";
}

export const GARAGE_MODE_BLOCK = `
## Interaction: GARAGE MODE
- Keep answers short and checklist-oriented.
- Lead with Action / next steps; keep Suggestion brief.
- Prefer bullets over paragraphs. Skip conversational filler.
- Still enforce safety language for high-risk systems — never drop disclaimers.
- Offer one clear confirm path (e.g. /approve, /log, /diagnose).
`.trim();

export const NORMAL_MODE_BLOCK = `
## Interaction: NORMAL MODE
- Be practical and concise; expand when the user asks for detail.
`.trim();

export function buildSystemPrompt(ctx: PromptContext): string {
  return [
    `You are ${APP_DISPLAY_NAME} — ${APP_TAGLINE}`,
    "You help the user maintain, diagnose, modify, and care for their vehicles.",
    "You are practical, safety-aware, and concise. Prefer checklists and clear next steps.",
    "When vehicle context is missing and it matters, ask for make/model/year/mileage.",
    "Follow the user's taste and relevant skills below. Do not invent preferences they never showed.",
    "Use tools when they improve accuracy (vehicle data, schedules, cost, recalls, checklists, search_knowledge).",
    "When using search_knowledge, clearly say you are citing the user's own documents vs general knowledge.",
    "You may chain multiple tools. After observations, give a clear final answer.",
    "Structure longer answers with Suggestion: (hypotheses/options) and Action: (steps if they proceed).",
    "Do not invent torque specs, part numbers, or TSBs. If unsure, say so and suggest verification.",
    "",
    SAFETY_SYSTEM_BLOCK,
    "",
    ctx.interactionMode === "garage" ? GARAGE_MODE_BLOCK : NORMAL_MODE_BLOCK,
    ctx.verbosity === "short"
      ? "Verbosity: SHORT — minimize prose; checklists and next actions first."
      : ctx.verbosity === "detailed"
        ? "Verbosity: DETAILED — include more reasoning when helpful; still stay structured."
        : "",
    "",
    ctx.mode ? `## Current Mode\n${ctx.mode}` : "",
    "",
    "## Active Vehicle",
    ctx.activeVehicle.trim(),
    "",
    "## User Vehicle Taste (compact)",
    ctx.tasteSummary.trim(),
    "",
    "## Garage Preferences",
    ctx.garagePrefs.trim(),
    "",
    "## Relevant Skills",
    ctx.relevantSkills.trim(),
    "",
    "## Vehicles",
    ctx.vehiclesSummary.trim(),
    "",
    "## Long-term Memory",
    ctx.longTermMemory.trim(),
    "",
    "## Recent Session Notes",
    ctx.memoryNotes.trim(),
    "",
    ctx.extraContext?.trim() ? ctx.extraContext.trim() : "",
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
${APP_DISPLAY_NAME} help — start here
────────────────────
Essentials
  /vehicles add <year> <make> <model> [mi] [fuel]
  /diagnose <symptoms>  Structured diagnosis (mock OBD enriches if connected)
  /service <job>        Service plan → /approve
  /garage · /due · /health · /attention
  /taste                What Bay has learned about you
  /obd connect mock     Demo live data (no hardware)
  /report ownership     Professional Markdown report
  /quick                Rapid action menu (garage-friendly)
  /help · /about · /safety · /exit

Taste
  /accept · /reject · /edit   Teach Bay after each answer (Enter = accept)
  /taste edit · /skills · /learn · /forget <text>

Vehicles & garage
  /vehicles · /active · /history · /garage · /insights · /compare
  /vehicles switch <id> · /lv (last vehicle)

Service
  /diagnose · /service · /prep · /log · /due · /schedule · /parts · /inspect

OBD (mock-first)
  /obd connect mock [scenario] · status · snapshot · dtc · monitor · disconnect

Ownership & decisions
  /ownership · /health · /report <kind> · /decide keep|sell|buy

Speed
  /mode garage|normal · /quick · /pretrip · /aliases · /snap

Planning
  /plan <goal> · /approve · /revise <feedback>

More (optional)
  /watchdogs · /knowledge · /memory · /mods · /export · /config
  /doctor · /backup · /rebuild · /status · /onboarding · /version

Tips
  • Data: ~/${DATA_DIR_NAME} — local-first & private
  • Outside chat: bay version · bay doctor
  • Safety: suggestions only — see /safety
`.trim();

/** Heuristic: non-trivial work should enter planning mode. */
export function shouldAutoPlan(message: string): boolean {
  const m = message.toLowerCase();
  if (m.length < 24 && !/\b(plan|schedule|diagnose|repair|overhaul|estimate)\b/.test(m)) {
    return false;
  }
  return /\b(plan|schedule|maintenance plan|diagnose|diagnostic|repair|rebuild|overhaul|estimate|cost|checklist|parts list|service plan|prep for|full (service|inspection))\b/i.test(
    m,
  );
}
