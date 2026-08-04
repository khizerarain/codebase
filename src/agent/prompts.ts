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
    "You are Codebase — a terminal-first AI vehicle agent and personal garage intelligence system.",
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
Codebase help
─────────────
Chat & taste
  /accept [reason]      Mark last answer good (Enter also accepts)
  /reject [reason]      Mark last answer bad
  /edit                 Edit last answer in $EDITOR → teach taste
  /taste                Taste summary + top skills
  /taste edit           Open taste.md
  /skills [name]        List or show a skill
  /forget <text>        Remove a preference/skill
  /learn                Re-analyze all signals

Planning
  /plan <goal>          Create a plan (also auto for big tasks)
  /approve              Execute approved plan
  /revise <feedback>    Revise pending plan

Vehicles
  /vehicles             List garage
  /vehicles add <year> <make> <model> [mileage] [fuel]
  /vehicles switch <id> Set active vehicle
  /vehicles edit <field> <value>
  /vehicles delete <id>
  /active               Show active vehicle
  /history              Service history

Service intelligence
  /diagnose <symptoms>  Structured multi-step diagnosis (+ live OBD if connected)
  /service <job>        Full service/repair plan (parts/tools/steps)
  /prep <job>           Parts + tools staging checklist
  /log <desc> [mi] [$] [diy|shop]
  /due [garage]         Overdue / due-soon predictions
  /inspect [pre-purchase|periodic]
  /schedule             Full maintenance schedule table
  /parts [part]         OEM vs aftermarket research

Live OBD (mock-first)
  /obd connect [mock|serial] [scenario]
  /obd status|snapshot|dtc|monitor|trends|disconnect

Automation (local watchdogs)
  /watchdogs list|enable|disable|run|briefing
  /watchdogs dismiss <id> [days] · clear-dismissals · history

Speed / garage
  /mode garage|normal   Hands-busy shorter output
  /quick                Rapid action menu
  /pretrip              Pre-trip checklist + due
  /aliases              Short command aliases (/d /g /snap …)
  /lv                   Switch to last vehicle
  /interpret            Quick OBD snapshot + codes

Ownership & reports
  /ownership [/costs]   Cost/mi, health, predictions (add garage)
  /health [garage]      Quick ownership health snapshot
  /report <kind>        health|diagnostic|service|ownership|prepurchase|garage|decision
  /decide buy|keep|sell Decision support (not advice)
  /decide compare <a> <b>
  /mods                 list|enable|disable|show|path|skills

Garage & knowledge
  /garage               Multi-vehicle overview
  /insights             Upcoming work & ownership-aware insights
  /compare <idA> <idB>  Compare two vehicles
  /compare approaches <topic>
  /skill …              Skills: list|create|edit|enable|disable|delete|show
  /skills [name]        Alias for /skill list|show
  /knowledge …          add|list|remove|search local manuals/notes
  /memory …             list|add|remove|pin|unpin|prune|pending|confirm|reject

Data health & performance
  /status · /info       System health snapshot
  /doctor               Check data integrity
  /backup               Export a local backup of all user data
  /rebuild              Rebuild knowledge index + prune memory
  /attention            Garage-wide what-needs-attention

Export & settings
  /export plan|schedule|checklist|diagnosis|service|last
  /config               View / set settings (incl. verbose)
  /safety               Safety & limitations
  /onboarding           Show welcome guide again

Session & about
  /version              Package version
  /about                Product summary + privacy/safety
  /clear                Clear conversation (keeps vehicles/taste/memory)
  /help                 This help
  /exit                 Quit

Tips
  • Data stays in ~/.codebase — local-first & private
  • Non-trivial work opens Plan → /approve → execute
  • Reports → exports/reports/ · mods are declarative (no remote code)
  • Install issues: docs/troubleshooting.md · outside chat: codebase doctor
  • OBD mock: /obd connect mock · docs/obd.md (no hardware required)
  • Quiet by default: /watchdogs · automation.assertiveness quiet|normal|assertive
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
