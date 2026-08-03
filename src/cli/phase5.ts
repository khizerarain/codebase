import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { DataPaths } from "../config/config.js";
import { GarageService } from "../garage/garage.js";
import type { KnowledgeBase } from "../knowledge/knowledge.js";
import type { LongTermMemory, MemoryKind } from "../memory/longterm.js";
import type { TasteManager } from "../taste/taste.js";
import { friendlyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { VehicleStore } from "../vehicles/vehicles.js";

export function handleGarageCommand(
  line: string,
  garage: GarageService,
  paths: DataPaths,
): void {
  const rest = line.replace(/^\/garage\s*/, "").trim();
  if (!rest || rest === "list") {
    console.log("\n" + garage.overview() + "\n");
    return;
  }
  if (rest.startsWith("pref ") || rest.startsWith("prefs ")) {
    const text = rest.replace(/^prefs?\s+/, "").trim();
    if (!text) {
      showGaragePrefs(paths);
      return;
    }
    if (text === "list" || text === "show") {
      showGaragePrefs(paths);
      return;
    }
    addGaragePref(paths, text);
    logger.success("Garage preference added.");
    return;
  }
  console.log("\n" + garage.overview() + "\n");
}

export function handleInsights(garage: GarageService): void {
  console.log("\n" + garage.insights() + "\n");
}

export function handleCompareCommand(line: string, garage: GarageService): void {
  const rest = line.replace(/^\/compare\s*/, "").trim();
  if (!rest) {
    logger.warn("Usage: /compare <idA> <idB>  OR  /compare approaches <topic>");
    return;
  }
  if (rest.startsWith("approaches ") || rest.startsWith("approach ")) {
    const topic = rest.replace(/^approaches?\s+/, "").trim();
    console.log("\n" + garage.compareApproaches(topic || "this job") + "\n");
    return;
  }
  const parts = rest.split(/\s+/);
  if (parts.length < 2) {
    logger.warn("Usage: /compare <idA> <idB>");
    return;
  }
  try {
    console.log("\n" + garage.compare(parts[0]!, parts[1]!) + "\n");
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

export async function handleSkillCommand(
  line: string,
  taste: TasteManager,
  vehicles: VehicleStore,
): Promise<void> {
  const rest = line.replace(/^\/skills?\s*/, "").trim();
  const skills = taste.engine.skills;
  const [cmd, ...args] = rest.split(/\s+/);
  const argstr = args.join(" ").trim();

  if (!cmd || cmd === "list") {
    console.log("\n" + skills.formatList() + "\n");
    return;
  }

  if (cmd === "show") {
    const skill = skills.get(argstr);
    if (!skill) logger.warn(`Skill not found: ${argstr}`);
    else console.log("\n" + skills.formatOne(skill) + "\n");
    return;
  }

  if (cmd === "enable" || cmd === "disable") {
    try {
      const skill = skills.setEnabled(argstr, cmd === "enable");
      logger.success(`${skill.name} ${cmd}d.`);
    } catch (err) {
      logger.warn(friendlyError(err));
    }
    return;
  }

  if (cmd === "delete" || cmd === "rm") {
    if (!skills.remove(argstr)) logger.warn(`Skill not found: ${argstr}`);
    else logger.success(`Deleted skill ${argstr}`);
    return;
  }

  if (cmd === "edit") {
    const skill = skills.get(argstr);
    if (!skill) {
      logger.warn(`Skill not found: ${argstr}`);
      return;
    }
    const file = skills.pathFor(skill.slug);
    const edited = await openInEditor(file);
    if (edited == null) {
      logger.warn("Editor cancelled or failed.");
      return;
    }
    // Re-read from disk (editor wrote file)
    const next = skills.read(skill.slug);
    if (next) logger.success(`Updated skill ${next.slug}`);
    else logger.warn("Could not parse edited skill file.");
    return;
  }

  if (cmd === "create") {
    // /skill create Name :: description :: rule1 | rule2 :: tag1,tag2
    const body = rest.replace(/^create\s*/, "");
    const parts = body.split("::").map((p) => p.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      logger.warn(
        'Usage: /skill create <Name> :: <description> :: <rule1 | rule2> [:: tags]',
      );
      return;
    }
    const name = parts[0];
    const description = parts[1]!;
    const rules = (parts[2] ?? description)
      .split("|")
      .map((r) => r.trim())
      .filter(Boolean);
    const tags = (parts[3] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const active = vehicles.getActive();
    try {
      const skill = skills.create({
        name,
        description,
        rules,
        tags,
        scope: "personal",
        vehicleIds: active ? [active.id] : [],
      });
      // If user included "vehicle" tag, bind to active vehicle
      if (tags.includes("vehicle") && active) {
        skills.upsert({
          ...skill,
          scope: "vehicle",
          vehicleIds: [active.id],
        });
      }
      logger.success(`Created skill ${skill.slug}`);
      console.log(skills.formatOne(skills.get(skill.slug)!));
    } catch (err) {
      logger.warn(friendlyError(err));
    }
    return;
  }

  // /skill <name> → show
  const skill = skills.get(rest);
  if (skill) {
    console.log("\n" + skills.formatOne(skill) + "\n");
    return;
  }

  logger.warn(
    "Usage: /skill list|show|create|edit|enable|disable|delete …",
  );
}

export function handleKnowledgeCommand(
  line: string,
  knowledge: KnowledgeBase,
  vehicles: VehicleStore,
): void {
  const rest = line.replace(/^\/knowledge\s*/, "").trim();
  const [cmd, ...args] = rest.split(/\s+/);
  const argstr = args.join(" ").trim();

  if (!cmd || cmd === "list") {
    console.log("\n" + knowledge.formatList() + "\n");
    return;
  }

  if (cmd === "add") {
    // /knowledge add <path> [vehicleId]
    if (!args[0]) {
      logger.warn("Usage: /knowledge add <path> [vehicleId|active]");
      return;
    }
    const filePath = args[0]!;
    let vehicleIds: string[] = [];
    const vArg = args[1];
    if (vArg === "active" || vArg === ".") {
      const id = vehicles.getActiveId();
      if (id) vehicleIds = [id];
    } else if (vArg) {
      const v = vehicles.get(vArg);
      if (!v) {
        logger.warn(`Vehicle not found: ${vArg}`);
        return;
      }
      vehicleIds = [v.id];
    }
    try {
      const doc = knowledge.add(filePath, { vehicleIds });
      logger.success(
        `Indexed "${doc.title}" (${doc.chunkCount} chunks${vehicleIds.length ? ", vehicle-linked" : ", global"})`,
      );
    } catch (err) {
      logger.warn(friendlyError(err));
    }
    return;
  }

  if (cmd === "remove" || cmd === "rm" || cmd === "delete") {
    if (!knowledge.remove(argstr)) logger.warn("Document not found.");
    else logger.success("Removed knowledge document.");
    return;
  }

  if (cmd === "search") {
    const q = argstr;
    if (!q) {
      logger.warn("Usage: /knowledge search <query>");
      return;
    }
    const active = vehicles.getActiveId();
    console.log(
      "\n" +
        knowledge.search(q, { vehicleIds: active ? [active] : [] }) +
        "\n",
    );
    return;
  }

  logger.warn("Usage: /knowledge list|add|remove|search …");
}

export function handleMemoryCommand(
  line: string,
  longTerm: LongTermMemory,
  vehicles: VehicleStore,
): void {
  const rest = line.replace(/^\/memory\s*/, "").trim();
  const [cmd, ...args] = rest.split(/\s+/);
  const argstr = args.join(" ").trim();

  if (!cmd || cmd === "list") {
    const kind = ["personal", "vehicle", "context"].includes(cmd === "list" ? argstr : "")
      ? (argstr as MemoryKind)
      : undefined;
    console.log("\n" + longTerm.formatList(kind) + "\n");
    return;
  }

  if (cmd === "personal" || cmd === "vehicle" || cmd === "context") {
    console.log("\n" + longTerm.formatList(cmd) + "\n");
    return;
  }

  if (cmd === "add") {
    // /memory add [personal|vehicle|context] text...
    let kind: MemoryKind = "personal";
    let text = argstr;
    const maybeKind = args[0];
    if (maybeKind === "personal" || maybeKind === "vehicle" || maybeKind === "context") {
      kind = maybeKind;
      text = args.slice(1).join(" ").trim();
    }
    if (!text) {
      logger.warn("Usage: /memory add [personal|vehicle|context] <text>");
      return;
    }
    const active = vehicles.getActive();
    const fact = longTerm.add({
      text,
      kind,
      vehicleIds: kind === "vehicle" && active ? [active.id] : [],
      source: "user",
    });
    logger.success(`Remembered (${fact.kind}): ${fact.text}`);
    return;
  }

  if (cmd === "remove" || cmd === "rm" || cmd === "delete") {
    if (!longTerm.remove(argstr)) logger.warn("Memory fact not found (or query too broad).");
    else logger.success("Memory fact removed.");
    return;
  }

  if (cmd === "pending") {
    const pending = longTerm.listPending();
    if (!pending.length) {
      console.log("\nNo pending memory proposals.\n");
      return;
    }
    console.log(
      "\n" +
        pending
          .map(
            (p) =>
              `• [${p.kind}] ${p.text}\n  id: ${p.id.slice(0, 8)} · confirm: /memory confirm ${p.id.slice(0, 8)}`,
          )
          .join("\n") +
        "\n",
    );
    return;
  }

  if (cmd === "confirm") {
    const fact = longTerm.confirmPending(argstr || undefined);
    if (!fact) logger.warn("Nothing to confirm.");
    else logger.success(`Confirmed memory: ${fact.text}`);
    return;
  }

  if (cmd === "reject") {
    if (!longTerm.rejectPending(argstr || undefined)) logger.warn("Nothing to reject.");
    else logger.success("Rejected pending memory proposal.");
    return;
  }

  logger.warn(
    "Usage: /memory list|add|remove|pending|confirm|reject …",
  );
}

function showGaragePrefs(paths: DataPaths): void {
  if (!existsSync(paths.garagePrefsFile)) {
    console.log("\nNo garage preferences.\n");
    return;
  }
  const raw = JSON.parse(readFileSync(paths.garagePrefsFile, "utf8")) as {
    notes?: string;
    preferences?: string[];
  };
  const prefs = raw.preferences ?? [];
  console.log(
    "\nGarage preferences\n" +
      (raw.notes ? `Notes: ${raw.notes}\n` : "") +
      (prefs.length ? prefs.map((p) => `• ${p}`).join("\n") : "_none_") +
      "\n",
  );
}

function addGaragePref(paths: DataPaths, text: string): void {
  let raw: { notes?: string; preferences?: string[] } = { preferences: [] };
  if (existsSync(paths.garagePrefsFile)) {
    raw = JSON.parse(readFileSync(paths.garagePrefsFile, "utf8")) as typeof raw;
  }
  raw.preferences = [...(raw.preferences ?? []), text];
  writeFileSync(paths.garagePrefsFile, JSON.stringify(raw, null, 2), "utf8");
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
        resolvePromise(readFileSync(file, "utf8"));
      } catch {
        resolvePromise(null);
      }
    });
    child.on("error", () => resolvePromise(null));
  });
}
