import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { Agent } from "./agent/agent.js";
import { createLLMProvider } from "./agent/llm.js";
import { SESSION_HELP } from "./agent/prompts.js";
import { SAFETY_HELP } from "./agent/safety.js";
import { executeTool } from "./agent/tools.js";
import {
  ensureDataDirs,
  formatConfigForDisplay,
  getDataPaths,
  loadConfig,
  saveConfig,
  setConfigValue,
  type Config,
} from "./config/config.js";
import {
  handleCompareCommand,
  handleGarageCommand,
  handleInsights,
  handleKnowledgeCommand,
  handleMemoryCommand,
  handleSkillCommand,
} from "./cli/phase5.js";
import {
  continueDiagnosis,
  createPhase6,
  handleDiagnoseCommand,
  handleDueCommand,
  handleInspectCommand,
  handleLogCommand,
  handlePrepCommand,
  handleServiceCommand,
} from "./cli/phase6.js";
import {
  handleAttentionCommand,
  handleBackupCommand,
  handleDoctorCommand,
  handleRebuildCommand,
  handleStatusCommand,
  handleVerboseToggle,
} from "./cli/phase7.js";
import {
  createPhase8,
  handleDecideCommand,
  handleHealthCommand,
  handleModsCommand,
  handleOwnershipCommand,
  handlePrePurchaseInspect,
  handleReportCommand,
  tryModCommand,
} from "./cli/phase8.js";
import { printStartupDiagnostics } from "./cli/startup.js";
import { formatDoctorReport, runDoctor } from "./data/doctor.js";
import { LocalDataStore } from "./data/store.js";
import { setVerbose } from "./utils/verbose.js";
import { exportContent } from "./export/export.js";
import { GarageService } from "./garage/garage.js";
import { KnowledgeBase } from "./knowledge/knowledge.js";
import { LongTermMemory } from "./memory/longterm.js";
import { MemoryStore } from "./memory/memory.js";
import {
  markOnboardingComplete,
  needsOnboarding,
  printEmptyGarageHint,
  printOnboarding,
} from "./onboarding/onboarding.js";
import { PlanStore } from "./plans/plans.js";
import type { LearningInsight } from "./taste/schema.js";
import { TasteManager } from "./taste/taste.js";
import { friendlyError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";
import type { FuelType } from "./vehicles/schema.js";
import { VehicleStore } from "./vehicles/vehicles.js";
import { APP_VERSION, formatAbout, formatVersionLine } from "./version.js";

interface PendingAnswer {
  response: string;
  userMessage: string;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("codebase")
    .description("Terminal-first AI vehicle agent that learns your taste")
    .version(APP_VERSION);

  program
    .command("chat", { isDefault: true })
    .description("Start an interactive Codebase session")
    .option("--provider <provider>", "openrouter | ollama")
    .action(async (opts: { provider?: string }) => {
      await runChatSession(opts.provider);
    });

  program
    .command("version")
    .description("Print version")
    .action(() => {
      console.log(formatVersionLine());
    });

  program
    .command("about")
    .description("Product summary, privacy, and safety pointers")
    .action(() => {
      console.log(formatAbout());
    });

  program
    .command("doctor")
    .description("Check local data health and basic install readiness")
    .action(() => {
      const paths = ensureDataDirs();
      const config = loadConfig(paths);
      printStartupDiagnostics(paths, config, { verbose: true });
      const taste = new TasteManager(paths);
      const vehicles = new VehicleStore(paths);
      const memory = new MemoryStore(paths, false);
      const data = new LocalDataStore({
        paths,
        config,
        vehicles,
        taste,
        memory,
        longTerm: new LongTermMemory(paths),
        knowledge: new KnowledgeBase(paths),
        plans: new PlanStore(paths),
      });
      console.log("\n" + formatDoctorReport(runDoctor(data)) + "\n");
    });

  program
    .command("taste")
    .description("Print current taste summary + top skills")
    .action(() => {
      const paths = ensureDataDirs();
      const taste = new TasteManager(paths);
      console.log(taste.formatSummaryForDisplay());
    });

  program
    .command("skills")
    .description("List learned skills")
    .argument("[name]", "optional skill name or slug")
    .action((name?: string) => {
      const paths = ensureDataDirs();
      const taste = new TasteManager(paths);
      if (!name) {
        console.log(taste.engine.skills.formatList());
        return;
      }
      const skill = taste.getSkill(name);
      if (!skill) {
        logger.warn(`Skill not found: ${name}`);
        return;
      }
      console.log(taste.engine.skills.formatOne(skill));
    });

  program
    .command("learn")
    .description("Force a full re-analysis of all taste signals")
    .action(async () => {
      const paths = ensureDataDirs();
      const config = loadConfig(paths);
      const taste = new TasteManager(paths, createLLMProvider(config));
      const spinner = ora("Re-learning from all signals…").start();
      const insight = await taste.relearn();
      spinner.stop();
      logLearning(insight);
    });

  program
    .command("vehicles")
    .description("List saved vehicles")
    .action(() => {
      const paths = ensureDataDirs();
      const vehicles = new VehicleStore(paths);
      console.log(vehicles.formatList());
    });

  return program;
}

async function runChatSession(providerOverride?: string): Promise<void> {
  let paths = ensureDataDirs(getDataPaths());
  let config = loadConfig(paths);
  if (config.exportDir) {
    paths = ensureDataDirs(getDataPaths(undefined, config.exportDir));
  }
  if (providerOverride === "openrouter" || providerOverride === "ollama") {
    config.provider = providerOverride;
  }

  const taste = new TasteManager(paths);
  const memory = new MemoryStore(paths, config.recoverLastSession);
  const vehicles = new VehicleStore(paths);

  if (config.defaultVehicleId) {
    try {
      vehicles.setActive(config.defaultVehicleId);
    } catch {
      // ignore invalid saved default
    }
  }

  setVerbose(Boolean(config.verbose));
  const agent = new Agent(config, taste, memory, vehicles, paths);
  const garage = new GarageService(vehicles, taste, paths);
  const phase6 = createPhase6(paths, taste, agent);
  const phase8 = createPhase8(paths, vehicles, taste, agent, garage);
  agent.setMods(phase8.mods);
  let diagnosing = false;

  // Smart default active vehicle when none / invalid pointer
  const smart = agent.data.ensureSmartActive();
  const active = smart ?? vehicles.getActive();
  if (active) memory.setActiveVehicle(active.id);

  logger.banner();
  printStartupDiagnostics(paths, config, { verbose: Boolean(config.verbose) });

  const firstTime = needsOnboarding(paths, vehicles);
  if (firstTime) {
    printOnboarding(vehicles.list().length === 0);
    markOnboardingComplete(paths);
  } else if (vehicles.list().length === 0) {
    printEmptyGarageHint();
  }

  if (
    config.recoverLastSession &&
    memory.getSession().messages.length > 0 &&
    !firstTime
  ) {
    logger.info(
      `Recovered session (${memory.getSession().messages.length} messages). /clear to start fresh.`,
    );
  }

  logger.info(`Data: ${paths.root}`);
  logger.info(`Provider: ${config.provider}`);
  if (config.provider === "openrouter") {
    logger.dim(`  model: ${config.openrouter.model}`);
  } else {
    logger.dim(`  model: ${config.ollama.model} @ ${config.ollama.baseUrl}`);
  }
  if (active) {
    logger.info(
      `Active vehicle: ${active.year} ${active.make} ${active.model} (${active.currentMileage.toLocaleString()} mi)`,
    );
  } else {
    logger.dim("No active vehicle yet — add one with /vehicles add …");
  }
  logger.dim("Type a question, or /help · /about · /safety for guidance.\n");

  const rl = readline.createInterface({ input, output, terminal: true });
  let pending: PendingAnswer | null = null;
  let running = true;
  let busy = false;

  const shutdown = () => {
    if (!running) return;
    running = false;
    try {
      memory.persistSession();
    } catch {
      // ignore persist errors on exit
    }
    console.log();
    logger.info(busy ? "Interrupted. Session saved." : "Session saved. See you next wrench.");
    rl.close();
  };

  process.on("SIGINT", () => {
    if (busy) {
      logger.warn("Cancelling current operation…");
      busy = false;
    }
    shutdown();
    process.exit(0);
  });

  while (running) {
    let line: string;
    try {
      line = (await rl.question(chalk.bold.green("you › "))).trim();
    } catch {
      break;
    }

    if (!line) {
      if (pending) {
        const { insight } = await taste.record({
          type: "accept",
          originalResponse: pending.response,
          userMessage: pending.userMessage,
          vehicleIds: memory.getSession().vehicleIds,
        });
        logger.success("Accepted (Enter).");
        logLearning(insight);
        pending = null;
      }
      continue;
    }

    if (line === "/exit" || line === "/quit") {
      shutdown();
      break;
    }

    if (line === "/help") {
      console.log("\n" + SESSION_HELP + "\n");
      continue;
    }

    if (line === "/version") {
      console.log("\n" + formatVersionLine() + "\n");
      continue;
    }

    if (line === "/about") {
      console.log("\n" + formatAbout() + "\n");
      continue;
    }

    if (line === "/safety") {
      console.log("\n" + SAFETY_HELP + "\n");
      continue;
    }

    if (line === "/onboarding") {
      printOnboarding(vehicles.list().length === 0);
      continue;
    }

    if (line === "/config" || line.startsWith("/config ")) {
      const handled = handleConfigCommand(line, config, paths, vehicles);
      config = handled.config;
      if (handled.paths) paths = handled.paths;
      continue;
    }

    if (line === "/clear") {
      memory.clearSession();
      pending = null;
      logger.success("Session cleared.");
      continue;
    }

    if (line === "/taste") {
      console.log("\n" + taste.formatSummaryForDisplay() + "\n");
      continue;
    }

    if (line === "/taste edit") {
      const edited = await openInEditor(paths.tasteFile);
      if (edited == null) logger.warn("Editor cancelled or failed.");
      else logger.success("taste.md saved from editor.");
      continue;
    }

    if (
      line === "/skill" ||
      line.startsWith("/skill ") ||
      line === "/skills" ||
      line.startsWith("/skills ")
    ) {
      await handleSkillCommand(line, taste, vehicles);
      continue;
    }

    if (line === "/garage" || line.startsWith("/garage ")) {
      handleGarageCommand(line, garage, paths);
      continue;
    }

    if (line === "/insights") {
      handleInsights(garage);
      continue;
    }

    if (line === "/compare" || line.startsWith("/compare ")) {
      handleCompareCommand(line, garage);
      continue;
    }

    if (line === "/knowledge" || line.startsWith("/knowledge ")) {
      handleKnowledgeCommand(line, agent.knowledge, vehicles);
      continue;
    }

    if (line === "/memory" || line.startsWith("/memory ")) {
      handleMemoryCommand(line, agent.longTerm, vehicles);
      continue;
    }

    if (line === "/status" || line === "/info") {
      handleStatusCommand(agent.data);
      continue;
    }

    if (line === "/doctor") {
      handleDoctorCommand(agent.data);
      continue;
    }

    if (line === "/backup") {
      handleBackupCommand(agent.data);
      continue;
    }

    if (line === "/rebuild") {
      handleRebuildCommand(agent.data);
      continue;
    }

    if (line === "/attention") {
      handleAttentionCommand(agent.data);
      continue;
    }

    if (line === "/verbose" || line.startsWith("/verbose ")) {
      handleVerboseToggle(line, agent.data);
      continue;
    }

    if (line.startsWith("/forget")) {
      const query = line.replace(/^\/forget\s*/, "").trim();
      if (!query) {
        logger.warn("Usage: /forget <preference or skill>");
        continue;
      }
      logLearning(taste.forget(query));
      continue;
    }

    if (line === "/learn") {
      const spinner = ora({ text: "Re-learning from all signals…", color: "cyan" }).start();
      try {
        const insight = await taste.relearn();
        spinner.stop();
        logLearning(insight);
      } catch (err) {
        spinner.stop();
        logger.error(err instanceof Error ? err.message : String(err));
      }
      continue;
    }

    if (line === "/active") {
      const v = vehicles.getActive();
      console.log(v ? "\n" + vehicles.formatDetail(v) + "\n" : "\nNo active vehicle.\n");
      continue;
    }

    if (line === "/history") {
      const v = vehicles.getActive();
      if (!v) logger.warn("No active vehicle.");
      else console.log("\n" + vehicles.formatHistory(v) + "\n");
      continue;
    }

    if (line === "/schedule" || line.startsWith("/schedule ")) {
      const out = await executeTool(
        "generate_maintenance_schedule",
        {},
        { vehicles, taste, paths },
      );
      agent.setLastExportable(out.output, "schedule");
      logger.agent(out.output);
      pending = { response: out.output, userMessage: line };
      continue;
    }

    if (line === "/diagnose" || line.startsWith("/diagnose ")) {
      diagnosing =
        handleDiagnoseCommand(line, phase6, vehicles, agent) === "collecting";
      continue;
    }

    if (line === "/service" || line.startsWith("/service ")) {
      handleServiceCommand(line, vehicles, taste, agent, paths);
      continue;
    }

    if (line === "/prep" || line.startsWith("/prep ")) {
      handlePrepCommand(line, vehicles, taste, agent);
      continue;
    }

    if (line === "/inspect" || line.startsWith("/inspect ")) {
      handleInspectCommand(line, vehicles, agent, () =>
        handlePrePurchaseInspect(phase8),
      );
      continue;
    }

    if (line === "/report" || line.startsWith("/report ")) {
      handleReportCommand(line, phase8);
      continue;
    }

    if (
      line === "/ownership" ||
      line.startsWith("/ownership ") ||
      line === "/costs" ||
      line.startsWith("/costs ")
    ) {
      handleOwnershipCommand(line, phase8);
      continue;
    }

    if (line === "/health" || line.startsWith("/health ")) {
      handleHealthCommand(line, phase8);
      continue;
    }

    if (line === "/mods" || line.startsWith("/mods ")) {
      handleModsCommand(line, phase8);
      continue;
    }

    if (line === "/decide" || line.startsWith("/decide ")) {
      handleDecideCommand(line, phase8);
      continue;
    }

    if (line === "/due" || line.startsWith("/due ")) {
      handleDueCommand(line, vehicles, taste, agent);
      continue;
    }

    if (line === "/log" || line.startsWith("/log ")) {
      handleLogCommand(line, vehicles);
      continue;
    }

    if (line === "/parts" || line.startsWith("/parts ")) {
      const part = line.replace(/^\/parts\s*/, "").trim() || "recommended service parts";
      const result = await agent.respond(`Research and compare parts options for: ${part}`, {
        forcePlan: true,
        mode: "parts",
      });
      logger.agent(result.response);
      if (result.kind !== "plan") pending = result;
      continue;
    }

    if (line === "/export" || line.startsWith("/export ")) {
      const arg = line.replace(/^\/export\s*/, "").trim() || "last";
      const format =
        arg.endsWith(".txt") || arg === "txt" ? "txt" : config.exportFormat;
      const kind = arg.replace(/\.(md|txt)$/i, "") || "last";
      try {
        if (!agent.exports.last && agent.getLastExportable()) {
          agent.setLastExportable(agent.getLastExportable());
        }
        const result = exportContent(
          paths,
          agent.exports,
          kind,
          format,
          agent.getPendingPlan(),
        );
        logger.success(`Exported ${result.kind} → ${result.path} (${result.bytes} bytes)`);
      } catch (err) {
        logger.warn(friendlyError(err));
      }
      continue;
    }

    if (line === "/plan" || line.startsWith("/plan ")) {
      const goal = line.replace(/^\/plan\s*/, "").trim();
      if (!goal) {
        logger.warn("Usage: /plan <goal>");
        continue;
      }
      const spinner = ora({ text: "Planning…", color: "cyan" }).start();
      try {
        const result = await agent.createPlan(goal, "general");
        spinner.stop();
        logger.agent(result.response);
      } catch (err) {
        spinner.stop();
        logger.error(err instanceof Error ? err.message : String(err));
      }
      continue;
    }

    if (line === "/approve") {
      const spinner = ora({ text: "Executing approved plan…", color: "cyan" }).start();
      try {
        const result = await agent.approveAndExecute();
        spinner.stop();
        logger.agent(result.response);
        pending = result;
      } catch (err) {
        spinner.stop();
        logger.error(err instanceof Error ? err.message : String(err));
      }
      continue;
    }

    if (line.startsWith("/revise")) {
      const feedback = line.replace(/^\/revise\s*/, "").trim();
      if (!feedback) {
        logger.warn("Usage: /revise <feedback>");
        continue;
      }
      const result = await agent.revisePending(feedback);
      logger.agent(result.response);
      continue;
    }

    if (line === "/vehicles" || line.startsWith("/vehicles ")) {
      await handleVehiclesCommand(line, vehicles, memory);
      continue;
    }

    if (line.startsWith("/accept")) {
      if (!pending) {
        logger.warn("Nothing to accept yet.");
        continue;
      }
      const reason = line.replace(/^\/accept\s*/, "") || undefined;
      const { insight } = await taste.record({
        type: "accept",
        originalResponse: pending.response,
        userMessage: pending.userMessage,
        reason,
        vehicleIds: memory.getSession().vehicleIds,
      });
      logger.success("Accepted.");
      logLearning(insight);
      pending = null;
      continue;
    }

    if (line.startsWith("/reject")) {
      if (!pending) {
        logger.warn("Nothing to reject yet.");
        continue;
      }
      const reason = line.replace(/^\/reject\s*/, "") || undefined;
      const { insight } = await taste.record({
        type: "reject",
        originalResponse: pending.response,
        userMessage: pending.userMessage,
        reason,
        vehicleIds: memory.getSession().vehicleIds,
      });
      logger.success("Rejected.");
      logLearning(insight);
      pending = null;
      continue;
    }

    if (line === "/edit") {
      if (!pending) {
        logger.warn("Nothing to edit yet.");
        continue;
      }
      const corrected = await editInEditor(pending.response);
      if (corrected == null) {
        logger.warn("Edit cancelled or editor failed.");
        continue;
      }
      const { insight } = await taste.record({
        type: "edit",
        originalResponse: pending.response,
        userCorrection: corrected,
        userMessage: pending.userMessage,
        vehicleIds: memory.getSession().vehicleIds,
      });
      memory.addNote(`User correction preference: ${corrected.slice(0, 280)}`);
      logger.success("Edit saved.");
      logLearning(insight);
      pending = null;
      continue;
    }

    // Declarative mod slash commands (local JSON/Markdown only)
    if (line.startsWith("/") && tryModCommand(line, phase8)) {
      continue;
    }

    // Active structured diagnosis: free-text answers clarifying questions
    if (diagnosing && phase6.diagnostics.isCollecting() && !line.startsWith("/")) {
      diagnosing =
        continueDiagnosis(line, phase6, vehicles, agent) === "collecting";
      continue;
    }

    // Pending plan: free-text feedback revises the plan
    if (agent.getPendingPlan() && !line.startsWith("/")) {
      const result = await agent.revisePending(line);
      logger.agent(result.response);
      continue;
    }

    // Auto-accept previous answer when user moves on
    if (pending) {
      const { insight } = await taste.record({
        type: "accept",
        originalResponse: pending.response,
        userMessage: pending.userMessage,
        reason: "implicit accept (continued conversation)",
        vehicleIds: memory.getSession().vehicleIds,
      });
      logLearning(insight);
      pending = null;
    }

    const spinner = ora({ text: "Thinking…", color: "cyan" }).start();
    busy = true;
    try {
      const result = await agent.respond(line);
      spinner.stop();
      busy = false;
      logger.agent(result.response);
      if (result.kind === "plan") {
        logger.dim("Plan ready: /approve · /revise <feedback> · or type feedback");
      } else {
        logger.dim("Signal: Enter//accept · /reject [reason] · /edit");
        pending = result;
        if (result.memoryProposals?.length) {
          for (const proposal of result.memoryProposals) {
            const pendingMem = agent.longTerm.proposeExtraction(
              proposal,
              "personal",
              memory.getSession().vehicleIds,
            );
            logger.info(
              `Memory proposal (${pendingMem.id.slice(0, 8)}): ${pendingMem.text}`,
            );
            logger.dim("  /memory confirm · /memory reject · /memory pending");
          }
        }
      }
    } catch (err) {
      spinner.stop();
      busy = false;
      logger.error(friendlyError(err));
    }
  }
}

function handleConfigCommand(
  line: string,
  config: Config,
  paths: ReturnType<typeof getDataPaths>,
  vehicles: VehicleStore,
): { config: Config; paths?: ReturnType<typeof getDataPaths> } {
  const rest = line.replace(/^\/config\s*/, "").trim();
  if (!rest) {
    console.log("\n" + formatConfigForDisplay(config, paths) + "\n");
    return { config };
  }

  if (rest.startsWith("set ")) {
    const body = rest.slice(4).trim();
    const sp = body.indexOf(" ");
    if (sp === -1) {
      logger.warn("Usage: /config set <key> <value>");
      return { config };
    }
    const key = body.slice(0, sp);
    const value = body.slice(sp + 1).trim();
    try {
      const next = setConfigValue(config, key, value);
      if (key === "defaultVehicleId" && next.defaultVehicleId) {
        vehicles.setActive(next.defaultVehicleId);
      }
      saveConfig(next, paths);
      let newPaths = paths;
      if (key === "exportDir" && next.exportDir) {
        newPaths = ensureDataDirs(getDataPaths(undefined, next.exportDir));
      }
      logger.success(`Config updated: ${key}`);
      return { config: next, paths: newPaths };
    } catch (err) {
      logger.warn(friendlyError(err));
      return { config };
    }
  }

  logger.warn("Usage: /config | /config set <key> <value>");
  return { config };
}

function logLearning(insight: LearningInsight): void {
  for (const line of insight.summaryLines) {
    console.log(chalk.cyan("  Learned:"), chalk.white(line));
  }
}

async function handleVehiclesCommand(
  line: string,
  vehicles: VehicleStore,
  memory: MemoryStore,
): Promise<void> {
  const parts = line.trim().split(/\s+/);
  const cmd = parts[1];

  if (!cmd) {
    console.log("\n" + vehicles.formatList() + "\n");
    return;
  }

  if (cmd === "add") {
    const year = Number(parts[2]);
    const make = parts[3];
    const model = parts[4];
    const mileage = parts[5] != null ? Number(parts[5]) : undefined;
    const fuelType = (parts[6] as FuelType | undefined) ?? "gas";

    if (!year || !make || !model) {
      logger.warn(
        "Usage: /vehicles add <year> <make> <model> [mileage] [gas|diesel|hybrid|ev|other]",
      );
      return;
    }

    const v = vehicles.add({
      year,
      make,
      model,
      currentMileage: mileage != null && !Number.isNaN(mileage) ? mileage : 0,
      fuelType: ["gas", "diesel", "hybrid", "ev", "other"].includes(fuelType)
        ? fuelType
        : "gas",
    });
    memory.setActiveVehicle(v.id);
    memory.addNote(`Added vehicle: ${v.year} ${v.make} ${v.model}`);
    logger.success(`Added & activated ${v.year} ${v.make} ${v.model}`);
    return;
  }

  if (cmd === "switch" || cmd === "use") {
    const id = parts[2];
    if (!id) {
      logger.warn("Usage: /vehicles switch <id>");
      return;
    }
    try {
      const v = vehicles.setActive(id);
      if (!v) {
        logger.warn("Vehicle not found.");
        return;
      }
      memory.setActiveVehicle(v.id);
      logger.success(`Active: ${v.year} ${v.make} ${v.model}`);
    } catch (err) {
      logger.error(friendlyError(err));
    }
    return;
  }

  if (cmd === "edit") {
    // /vehicles edit mileage 95000  OR  /vehicles edit notes "text..."
    const field = parts[2];
    const value = parts.slice(3).join(" ").replace(/^["']|["']$/g, "");
    const active = vehicles.getActive();
    if (!active) {
      logger.warn("No active vehicle.");
      return;
    }
    if (!field || value === "") {
      logger.warn(
        "Usage: /vehicles edit <mileage|notes|engine|trim|fuelType|vin|mod|issue> <value>",
      );
      return;
    }
    try {
      let updated;
      switch (field) {
        case "mileage":
        case "currentMileage":
          updated = vehicles.update(active.id, { currentMileage: Number(value) });
          break;
        case "notes":
          updated = vehicles.update(active.id, { notes: value });
          break;
        case "engine":
          updated = vehicles.update(active.id, { engine: value });
          break;
        case "trim":
          updated = vehicles.update(active.id, { trim: value });
          break;
        case "fuelType":
        case "fuel":
          updated = vehicles.update(active.id, {
            fuelType: value as FuelType,
          });
          break;
        case "vin":
          updated = vehicles.update(active.id, { vin: value });
          break;
        case "mod":
        case "modification":
          updated = vehicles.update(active.id, {
            modifications: [...active.modifications, value],
          });
          break;
        case "issue":
          updated = vehicles.update(active.id, {
            knownIssues: [...active.knownIssues, value],
          });
          break;
        default:
          logger.warn(`Unknown field: ${field}`);
          return;
      }
      logger.success("Vehicle updated.");
      console.log(vehicles.formatDetail(updated));
    } catch (err) {
      logger.error(friendlyError(err));
    }
    return;
  }

  if (cmd === "delete" || cmd === "rm") {
    const id = parts[2] ?? vehicles.getActiveId();
    if (!id) {
      logger.warn("Usage: /vehicles delete <id>");
      return;
    }
    const v = vehicles.get(id);
    if (!v || !vehicles.remove(id)) {
      logger.warn("Vehicle not found.");
      return;
    }
    const next = vehicles.getActive();
    memory.setActiveVehicle(next?.id ?? null);
    logger.success(`Deleted ${v.year} ${v.make} ${v.model}`);
    return;
  }

  if (cmd === "show") {
    const id = parts[2];
    const v = id ? vehicles.get(id) : vehicles.getActive();
    if (!v) logger.warn("Vehicle not found.");
    else console.log("\n" + vehicles.formatDetail(v) + "\n");
    return;
  }

  logger.warn(
    "Usage: /vehicles | add | switch <id> | edit <field> <value> | delete <id> | show [id]",
  );
}

async function editInEditor(original: string): Promise<string | null> {
  const dir = mkdtempSync(join(tmpdir(), "codebase-edit-"));
  const file = join(dir, "response.md");
  writeFileSync(file, original, "utf8");
  return openInEditor(file);
}

async function openInEditor(file: string): Promise<string | null> {
  const editor =
    process.env.EDITOR ||
    process.env.VISUAL ||
    (process.platform === "win32" ? "notepad" : "vi");

  return new Promise((resolvePromise) => {
    const child = spawn(editor, [file], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code !== 0) {
        resolvePromise(null);
        return;
      }
      try {
        const next = readFileSync(file, "utf8");
        resolvePromise(next.trim() ? next : null);
      } catch {
        resolvePromise(null);
      }
    });
    child.on("error", () => resolvePromise(null));
  });
}
