import type { Agent } from "../agent/agent.js";
import type { DataPaths } from "../config/config.js";
import { friendlyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import {
  buildOwnershipDecision,
  buildPrePurchaseReport,
  type DecisionFrame,
} from "../ownership/decision.js";
import { OwnershipEngine } from "../ownership/engine.js";
import {
  ensureExampleMod,
  ModRegistry,
} from "../mods/registry.js";
import {
  generateReport,
  listReportKinds,
} from "../reports/reports.js";
import type { TasteManager } from "../taste/taste.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import type { GarageService } from "../garage/garage.js";

export interface Phase8Context {
  paths: DataPaths;
  vehicles: VehicleStore;
  taste: TasteManager;
  agent: Agent;
  ownership: OwnershipEngine;
  mods: ModRegistry;
  garage: GarageService;
}

export function createPhase8(
  paths: DataPaths,
  vehicles: VehicleStore,
  taste: TasteManager,
  agent: Agent,
  garage: GarageService,
): Phase8Context {
  ensureExampleMod(paths);
  const mods = new ModRegistry(paths);
  const ownership = new OwnershipEngine(vehicles, taste);
  return { paths, vehicles, taste, agent, ownership, mods, garage };
}

export function handleReportCommand(line: string, ctx: Phase8Context): void {
  const rest = line.replace(/^\/report\s*/, "").trim();
  if (!rest || rest === "help" || rest === "list") {
    console.log("\n" + listReportKinds() + "\n");
    return;
  }
  const [kind, ...argParts] = rest.split(/\s+/);
  try {
    const saved = generateReport(kind!, {
      paths: ctx.paths,
      vehicles: ctx.vehicles,
      taste: ctx.taste,
      ownership: ctx.ownership,
      exports: ctx.agent.exports,
      mods: ctx.mods,
      args: argParts.join(" "),
    });
    ctx.agent.setLastExportable(saved.markdown, kind);
    logger.agent(saved.markdown);
    logger.success(`Report saved: ${saved.path} (${saved.bytes} bytes)`);
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

export function handleOwnershipCommand(line: string, ctx: Phase8Context): void {
  const rest = line.replace(/^\/(ownership|costs)\s*/, "").trim().toLowerCase();
  try {
    if (rest === "garage" || rest === "all") {
      const text = ctx.ownership.formatGarageReport(ctx.ownership.garageOverview());
      ctx.agent.setLastExportable(text, "ownership");
      console.log("\n" + text + "\n");
      return;
    }
    const snap = ctx.ownership.activeOrThrow();
    const text = ctx.ownership.formatVehicleReport(snap);
    ctx.agent.setLastExportable(text, "ownership");
    console.log("\n" + text + "\n");
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

export function handleHealthCommand(line: string, ctx: Phase8Context): void {
  const rest = line.replace(/^\/health\s*/, "").trim().toLowerCase();
  try {
    const text = ctx.ownership.formatHealthSnapshot(
      rest === "garage" || rest === "all",
    );
    ctx.agent.setLastExportable(text, "health");
    console.log("\n" + text + "\n");
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

export function handleModsCommand(line: string, ctx: Phase8Context): void {
  const rest = line.replace(/^\/mods\s*/, "").trim();
  const [cmd, ...args] = rest.split(/\s+/);
  const id = args.join(" ").trim();

  try {
    if (!cmd || cmd === "list") {
      ctx.mods.refresh();
      console.log("\n" + ctx.mods.formatList() + "\n");
      return;
    }
    if (cmd === "path") {
      console.log("\n" + ctx.paths.mods + "\n");
      return;
    }
    if (cmd === "show" || cmd === "inspect") {
      if (!id) {
        logger.warn("Usage: /mods show <id>");
        return;
      }
      console.log("\n" + ctx.mods.formatOne(id) + "\n");
      return;
    }
    if (cmd === "enable") {
      if (!id) {
        logger.warn("Usage: /mods enable <id>");
        return;
      }
      const m = ctx.mods.enable(id);
      logger.success(`Enabled mod: ${m.manifest.id}`);
      return;
    }
    if (cmd === "disable") {
      if (!id) {
        logger.warn("Usage: /mods disable <id>");
        return;
      }
      const m = ctx.mods.disable(id);
      logger.success(`Disabled mod: ${m.manifest.id}`);
      return;
    }
    if (cmd === "skills") {
      const skills = ctx.mods.enabledSkills();
      if (!skills.length) {
        console.log("\nNo skills from enabled mods.\n");
        return;
      }
      console.log(
        "\n" +
          skills.map((s) => `• ${s.name} (${s.slug}) — ${s.description}`).join("\n") +
          "\n",
      );
      return;
    }
    logger.warn("Usage: /mods list|enable|disable|show|path|skills");
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

export function handleDecideCommand(line: string, ctx: Phase8Context): void {
  const rest = line.replace(/^\/decide\s*/, "").trim();
  if (!rest) {
    logger.warn(
      "Usage: /decide buy|keep|sell | /decide compare <idA> <idB>",
    );
    return;
  }
  try {
    const parts = rest.split(/\s+/);
    const head = parts[0]!.toLowerCase();
    if (head === "compare") {
      const md = buildOwnershipDecision(
        "compare",
        ctx.vehicles,
        ctx.taste,
        ctx.ownership,
        parts[1],
        parts[2],
      );
      ctx.agent.setLastExportable(md, "decision");
      logger.agent(md);
      return;
    }
    if (head !== "buy" && head !== "keep" && head !== "sell") {
      logger.warn("Frame must be buy, keep, sell, or compare.");
      return;
    }
    const md = buildOwnershipDecision(
      head as DecisionFrame,
      ctx.vehicles,
      ctx.taste,
      ctx.ownership,
      parts[1],
    );
    ctx.agent.setLastExportable(md, "decision");
    logger.agent(md);
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

/** Enhanced pre-purchase path used by /inspect pre-purchase */
export function handlePrePurchaseInspect(ctx: Phase8Context): void {
  const md = buildPrePurchaseReport(
    ctx.vehicles.getActive(),
    ctx.taste,
    ctx.ownership,
  );
  ctx.agent.setLastExportable(md, "checklist");
  ctx.agent.exports.checklist = md;
  logger.agent(md);
  logger.dim("Tip: /report prepurchase saves a dated copy under exports/reports/");
}

/** Try enabled mod slash commands before falling through to chat. */
export function tryModCommand(line: string, ctx: Phase8Context): boolean {
  const out = ctx.mods.tryCommand(line);
  if (out == null) return false;
  console.log("\n" + out + "\n");
  ctx.agent.setLastExportable(out, "mod");
  return true;
}
