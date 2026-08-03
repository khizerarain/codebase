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
import { ensureDataDirs, getDataPaths, loadConfig } from "./config/config.js";
import { MemoryStore } from "./memory/memory.js";
import type { LearningInsight } from "./taste/schema.js";
import { TasteManager } from "./taste/taste.js";
import { logger } from "./utils/logger.js";
import { VehicleStore } from "./vehicles/vehicles.js";

interface PendingAnswer {
  response: string;
  userMessage: string;
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("codebase")
    .description("Terminal-first AI vehicle agent that learns your taste")
    .version("0.2.0");

  program
    .command("chat", { isDefault: true })
    .description("Start an interactive Codebase session")
    .option("--provider <provider>", "openrouter | ollama")
    .action(async (opts: { provider?: string }) => {
      await runChatSession(opts.provider);
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
  const paths = ensureDataDirs(getDataPaths());
  const config = loadConfig(paths);
  if (providerOverride === "openrouter" || providerOverride === "ollama") {
    config.provider = providerOverride;
  }

  const taste = new TasteManager(paths);
  const memory = new MemoryStore(paths);
  const vehicles = new VehicleStore(paths);
  const agent = new Agent(config, taste, memory, vehicles);

  logger.banner();
  logger.info(`Data: ${paths.root}`);
  logger.info(`Provider: ${config.provider}`);
  if (config.provider === "openrouter") {
    logger.dim(`  model: ${config.openrouter.model}`);
    if (!config.openrouter.apiKey) {
      logger.warn("OPENROUTER_API_KEY not set — set it or use --provider ollama");
    }
  } else {
    logger.dim(`  model: ${config.ollama.model} @ ${config.ollama.baseUrl}`);
  }
  logger.dim("Type a question, or /help for session commands.\n");

  const rl = readline.createInterface({ input, output, terminal: true });
  let pending: PendingAnswer | null = null;
  let running = true;

  const shutdown = () => {
    if (!running) return;
    running = false;
    memory.persistSession();
    console.log();
    logger.info("Session saved. See you next wrench.");
    rl.close();
  };

  process.on("SIGINT", () => {
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
      if (edited == null) {
        logger.warn("Editor cancelled or failed.");
      } else {
        logger.success("taste.md saved from editor.");
      }
      continue;
    }

    if (line === "/skills" || line.startsWith("/skills ")) {
      handleSkillsCommand(line, taste);
      continue;
    }

    if (line.startsWith("/forget")) {
      const query = line.replace(/^\/forget\s*/, "").trim();
      if (!query) {
        logger.warn("Usage: /forget <preference or skill>");
        continue;
      }
      const insight = taste.forget(query);
      logLearning(insight);
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

    // Auto-accept previous answer when user moves on with a new question
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
    try {
      const result = await agent.respond(line);
      spinner.stop();
      logger.agent(result.response);
      logger.dim("Signal: Enter//accept · /reject [reason] · /edit");
      pending = result;
    } catch (err) {
      spinner.stop();
      logger.error(err instanceof Error ? err.message : String(err));
    }
  }
}

function handleSkillsCommand(line: string, taste: TasteManager): void {
  const name = line.replace(/^\/skills\s*/, "").trim();
  if (!name) {
    console.log("\n" + taste.engine.skills.formatList() + "\n");
    return;
  }
  const skill = taste.getSkill(name);
  if (!skill) {
    logger.warn(`Skill not found: ${name}`);
    return;
  }
  console.log("\n" + taste.engine.skills.formatOne(skill) + "\n");
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
  if (parts.length === 1) {
    console.log("\n" + vehicles.formatList() + "\n");
    return;
  }

  if (parts[1] === "add") {
    const year = Number(parts[2]);
    const make = parts[3];
    const model = parts[4];
    const mileage = parts[5] != null ? Number(parts[5]) : undefined;

    if (!year || !make || !model) {
      logger.warn("Usage: /vehicles add <year> <make> <model> [mileage]");
      return;
    }

    const v = vehicles.add({
      year,
      make,
      model,
      ...(mileage != null && !Number.isNaN(mileage) ? { mileage } : {}),
    });
    memory.setVehicleIds([...memory.getSession().vehicleIds, v.id]);
    memory.addNote(`Added vehicle: ${v.year} ${v.make} ${v.model}`);
    logger.success(`Added ${v.year} ${v.make} ${v.model}`);
    return;
  }

  logger.warn("Usage: /vehicles | /vehicles add <year> <make> <model> [mileage]");
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
