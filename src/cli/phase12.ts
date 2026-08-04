import type { Agent } from "../agent/agent.js";
import { GARAGE_MODE_BLOCK, NORMAL_MODE_BLOCK } from "../agent/prompts.js";
import type { Config } from "../config/config.js";
import { saveConfig } from "../config/config.js";
import type { DataPaths } from "../config/config.js";
import { aliasHelp } from "./aliases.js";
import type { LastVehicleMemory } from "./history.js";
import { logger } from "../utils/logger.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import type { Phase10Context } from "./phase10.js";
import type { Phase11Context } from "./phase11.js";
import { formatDueReport } from "../workflows/due.js";
import type { TasteManager } from "../taste/taste.js";
import { buildInspectionChecklist } from "../workflows/servicePlans.js";
import { OwnershipEngine } from "../ownership/engine.js";

export type InteractionMode = "normal" | "garage";

export function setInteractionMode(
  config: Config,
  paths: DataPaths,
  mode: InteractionMode,
): Config {
  config.interaction.mode = mode;
  saveConfig(config, paths);
  return config;
}

export function handleModeCommand(
  line: string,
  config: Config,
  paths: DataPaths,
): Config {
  const rest = line.replace(/^\/mode\s*/, "").trim().toLowerCase();
  if (!rest || rest === "show" || rest === "status") {
    console.log(
      `\nInteraction mode: ${config.interaction.mode}` +
        `\nVerbosity: ${config.interaction.verbosity}` +
        `\nAliases: ${config.interaction.aliases ? "on" : "off"}` +
        `\nVoice: ${config.interaction.voiceEnabled ? "enabled (skeleton)" : "off"}` +
        `\n\n/mode garage · /mode normal\n`,
    );
    return config;
  }
  if (rest === "garage" || rest === "g") {
    const next = setInteractionMode(config, paths, "garage");
    logger.success("Garage mode ON — shorter checklists, stronger next-actions.");
    logger.dim(GARAGE_MODE_BLOCK.split("\n")[0] ?? "");
    return next;
  }
  if (rest === "normal" || rest === "n" || rest === "default") {
    const next = setInteractionMode(config, paths, "normal");
    logger.success("Normal mode ON.");
    return next;
  }
  logger.warn("Usage: /mode garage|normal|show");
  return config;
}

export function handleAliasesCommand(): void {
  console.log("\n" + aliasHelp() + "\n");
}

export function handleQuickMenu(): void {
  console.log(
    `
Quick actions (garage-friendly)
───────────────────────────────
  /attn  or /a     What needs attention
  /du              Due soon (active)
  /dueg            Due garage-wide
  /d <symptoms>    Diagnose
  /snap            OBD snapshot (connect first)
  /dtc             Read codes
  /log "…" mi $    Log service
  /pretrip         Pre-trip checklist + due
  /h               Health snapshot
  /br              Watchdog briefing
  /mg · /mn        Garage / normal mode
  /lv              Switch to last vehicle
  /aliases         Full alias list
`.trim() + "\n",
  );
}

export async function handlePretrip(
  vehicles: VehicleStore,
  taste: TasteManager,
  agent: Agent,
): Promise<void> {
  const v = vehicles.getActive();
  const checklist = buildInspectionChecklist("periodic", v);
  const due = formatDueReport(vehicles, taste, { garage: false });
  const ownership = new OwnershipEngine(vehicles, taste);
  let health = "";
  try {
    if (v) health = ownership.formatVehicleReport(ownership.analyzeVehicle(v));
  } catch {
    health = "";
  }
  const md = [
    "# Pre-trip quick check",
    "",
    "> Assistive checklist — not a certification. See /safety.",
    "",
    "## Due / attention",
    due,
    "",
    health ? `## Ownership snapshot\n${health}\n` : "",
    "## Walk-around / systems",
    checklist.replace(/^# .+\n/, ""),
    "",
    "Next: fix urgent due items · `/snap` if OBD connected · drive only if safe.",
  ]
    .filter(Boolean)
    .join("\n");
  agent.setLastExportable(md, "checklist");
  logger.agent(md);
}

export async function handleQuickSnap(
  phase10: Phase10Context,
  agent: Agent,
): Promise<void> {
  if (!phase10.obd.isConnected()) {
    logger.warn("OBD not connected. Try: /obd connect mock   then /snap");
    return;
  }
  const { markdown } = await phase10.obd.snapshot(true);
  agent.setLastExportable(markdown, "diagnosis");
  logger.agent(markdown);
}

export async function handleQuickInterpret(
  phase10: Phase10Context,
  phase11: Phase11Context,
  agent: Agent,
): Promise<void> {
  if (!phase10.obd.isConnected()) {
    await phase10.obd.connect("mock");
    logger.dim("Connected mock OBD for quick interpret.");
  }
  const { markdown } = await phase10.obd.snapshot(false);
  const dtc = await phase10.obd.dtc({ attachHistory: false });
  const briefing = await phase11.watchdogs.briefing();
  const md = [
    "# Quick OBD interpret",
    "",
    markdown,
    "",
    dtc,
    "",
    briefing.length
      ? `## Related alerts\n${briefing.map((a) => `• ${a.title} — ${a.reason}`).join("\n")}`
      : "",
    "",
    "Suggestion: use `/diagnose …` if symptoms remain. Action: `/dtc` / `/snap` as needed.",
  ]
    .filter(Boolean)
    .join("\n");
  agent.setLastExportable(md, "diagnosis");
  logger.agent(md);
}

export function handleLastVehicle(
  vehicles: VehicleStore,
  last: LastVehicleMemory,
): void {
  const id = last.get();
  if (!id) {
    logger.warn("No last vehicle remembered yet. Switch with /vehicles switch <id>.");
    return;
  }
  try {
    const current = vehicles.getActive();
    if (current && current.id === id) {
      logger.info(`Already on ${current.year} ${current.make} ${current.model}.`);
      return;
    }
    if (current) last.set(current.id);
    const v = vehicles.setActive(id);
    if (!v) {
      logger.warn("Last vehicle id no longer valid. Use /vehicles list.");
      return;
    }
    logger.success(
      `Active: ${v.year} ${v.make} ${v.model} (${v.id.slice(0, 8)})`,
    );
  } catch {
    logger.warn("Last vehicle id no longer valid. Use /vehicles list.");
  }
}

export function interactionPromptSuffix(config: Config): string {
  if (config.interaction.mode === "garage") {
    return `\n${GARAGE_MODE_BLOCK}`;
  }
  if (config.interaction.verbosity === "short") {
    return `\n${NORMAL_MODE_BLOCK}\nPrefer concise answers unless asked for detail.`;
  }
  if (config.interaction.verbosity === "detailed") {
    return `\n${NORMAL_MODE_BLOCK}\nUser prefers more detail when useful.`;
  }
  return "";
}
