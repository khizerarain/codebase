export interface PromptContext {
  tasteSummary: string;
  relevantSkills: string;
  vehiclesSummary: string;
  memoryNotes: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  return [
    "You are Codebase — a terminal-first AI vehicle agent.",
    "You help the user maintain, diagnose, modify, and care for their vehicles.",
    "You are practical, safety-aware, and concise. Prefer checklists and clear next steps.",
    "Always note when a job should be left to a professional (brakes, airbags, high-voltage EV systems, structural work, etc.).",
    "When vehicle context is missing and it matters, ask for make/model/year/mileage.",
    "Follow the user's taste and relevant skills below. Do not invent preferences they never showed.",
    "",
    "You may use tools when helpful. Think step-by-step, then act, then answer.",
    "Do not invent torque specs, part numbers, or TSBs. If unsure, say so and suggest verification.",
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
  ].join("\n");
}

export const SESSION_HELP = `
Session commands:
  /accept [reason]     Mark last answer as good (Enter also accepts)
  /reject [reason]     Mark last answer as bad
  /edit                Edit last answer in $EDITOR and save as correction
  /vehicles            List vehicles
  /vehicles add <year> <make> <model> [mileage]
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
