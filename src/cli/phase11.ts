import type { Agent } from "../agent/agent.js";
import { WatchdogEngine } from "../automation/engine.js";
import {
  formatAlertList,
  formatGarageBriefing,
  formatProactiveAppendix,
  formatWatchdogList,
} from "../automation/format.js";
import type { Config, DataPaths } from "../config/config.js";
import type { KnowledgeBase } from "../knowledge/knowledge.js";
import type { ObdManager } from "../obd/manager.js";
import type { TasteManager } from "../taste/taste.js";
import { friendlyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { VehicleStore } from "../vehicles/vehicles.js";

export interface Phase11Context {
  watchdogs: WatchdogEngine;
}

export function createPhase11(
  paths: DataPaths,
  config: Config,
  vehicles: VehicleStore,
  taste: TasteManager,
  obd: ObdManager,
  knowledge: KnowledgeBase,
): Phase11Context {
  return {
    watchdogs: new WatchdogEngine(paths, config, vehicles, taste, obd, knowledge),
  };
}

export async function handleWatchdogsCommand(
  line: string,
  ctx: Phase11Context,
  agent: Agent,
): Promise<void> {
  const rest = line.replace(/^\/watchdogs?\s*/, "").trim();
  const [cmd, ...args] = rest.split(/\s+/);
  const argstr = args.join(" ").trim();

  try {
    if (!cmd || cmd === "list" || cmd === "ls") {
      console.log("\n" + formatWatchdogList(ctx.watchdogs) + "\n");
      return;
    }

    if (cmd === "enable") {
      if (!argstr) {
        logger.warn("Usage: /watchdogs enable <id>");
        return;
      }
      const d = ctx.watchdogs.enable(argstr);
      logger.success(`Enabled watchdog: ${d.id}`);
      return;
    }

    if (cmd === "disable") {
      if (!argstr) {
        logger.warn("Usage: /watchdogs disable <id>");
        return;
      }
      const d = ctx.watchdogs.disable(argstr);
      logger.success(`Disabled watchdog: ${d.id}`);
      return;
    }

    if (cmd === "run") {
      const alerts = await ctx.watchdogs.run();
      const text = formatAlertList(alerts, "Watchdog run");
      agent.setLastExportable(text, "checklist");
      console.log("\n" + text + "\n");
      return;
    }

    if (cmd === "briefing") {
      const alerts = await ctx.watchdogs.briefing();
      const text = formatGarageBriefing(alerts);
      agent.setLastExportable(text, "checklist");
      console.log("\n" + text + "\n");
      return;
    }

    if (cmd === "dismiss") {
      if (!argstr) {
        logger.warn("Usage: /watchdogs dismiss <alert-id|fingerprint> [days]");
        return;
      }
      const daysRaw = args[1];
      const days = daysRaw && /^\d+$/.test(daysRaw) ? Number(daysRaw) : undefined;
      ctx.watchdogs.dismiss(args[0]!, days);
      logger.success(
        days != null
          ? `Dismissed for ${days} day(s).`
          : "Dismissed until you clear dismissals.",
      );
      return;
    }

    if (cmd === "clear-dismissals" || cmd === "clear") {
      const n = ctx.watchdogs.store.clearDismissals();
      logger.success(`Cleared ${n} dismissal(s).`);
      return;
    }

    if (cmd === "history") {
      const hist = ctx.watchdogs.store.history(15);
      console.log("\n" + formatAlertList(hist, "Alert history (recent)") + "\n");
      return;
    }

    logger.warn(
      "Usage: /watchdogs list|enable|disable|run|briefing|dismiss|clear-dismissals|history",
    );
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

/** Optional quiet session-start briefing. */
export async function printStartupBriefing(
  ctx: Phase11Context,
  config: Config,
): Promise<void> {
  if (!config.automation?.briefingOnStart) return;
  try {
    const alerts = await ctx.watchdogs.briefing();
    if (!alerts.length) {
      if (config.automation.assertiveness !== "quiet") {
        logger.dim("  Garage briefing: all quiet from enabled watchdogs.");
      }
      return;
    }
    console.log("\n" + formatGarageBriefing(alerts) + "\n");
  } catch {
    // never block session start
  }
}

/** Append proactive appendix to an existing printed report. */
export async function appendProactive(
  ctx: Phase11Context,
  baseText: string,
): Promise<string> {
  try {
    const alerts = await ctx.watchdogs.briefing();
    return baseText + formatProactiveAppendix(alerts);
  } catch {
    return baseText;
  }
}
