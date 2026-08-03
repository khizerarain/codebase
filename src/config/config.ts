import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const ConfigSchema = z.object({
  provider: z.enum(["openrouter", "ollama"]).default("openrouter"),
  openrouter: z
    .object({
      apiKey: z.string().optional(),
      model: z.string().default("openrouter/free"),
      baseUrl: z.string().default("https://openrouter.ai/api/v1"),
    })
    .default({}),
  ollama: z
    .object({
      baseUrl: z.string().default("http://localhost:11434"),
      model: z.string().default("llama3.2"),
    })
    .default({}),
  dataDir: z.string().optional(),
  maxToolRounds: z.number().int().positive().default(8),
  contextMessageLimit: z.number().int().positive().default(24),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface DataPaths {
  root: string;
  taste: string;
  signals: string;
  skills: string;
  memory: string;
  vehicles: string;
  sessions: string;
  plans: string;
  exports: string;
  configFile: string;
  tasteFile: string;
}

/** Resolve ~/.codebase (or CODEBASE_HOME / project .codebase). */
export function resolveDataRoot(override?: string): string {
  if (override) return override;
  if (process.env.CODEBASE_HOME) return process.env.CODEBASE_HOME;

  const local = join(process.cwd(), ".codebase");
  if (existsSync(local)) return local;

  return join(homedir(), ".codebase");
}

export function getDataPaths(root?: string): DataPaths {
  const base = resolveDataRoot(root);
  return {
    root: base,
    taste: join(base, "taste"),
    signals: join(base, "taste", "signals"),
    skills: join(base, "taste", "skills"),
    memory: join(base, "memory"),
    vehicles: join(base, "vehicles"),
    sessions: join(base, "sessions"),
    plans: join(base, "plans"),
    exports: join(base, "exports"),
    configFile: join(base, "config.json"),
    tasteFile: join(base, "taste", "taste.md"),
  };
}

/** Ensure all data directories exist and seed defaults if needed. */
export function ensureDataDirs(paths: DataPaths = getDataPaths()): DataPaths {
  for (const dir of [
    paths.root,
    paths.taste,
    paths.signals,
    paths.skills,
    paths.memory,
    paths.vehicles,
    paths.sessions,
    paths.plans,
    paths.exports,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(paths.tasteFile)) {
    writeFileSync(
      paths.tasteFile,
      [
        "# Vehicle Taste",
        "",
        "> Version **1** · Updated _(seed)_",
        "",
        "Living preferences learned from Accept / Reject / Edit signals.",
        "Human-editable. Use `/taste edit`, `/forget`, or `/learn`.",
        "",
        "## Personal Preferences",
        "",
        "- Prefer clear, practical DIY guidance with safety notes.",
        "- Ask for vehicle context (make/model/year/mileage) when relevant.",
        "- Favor OEM-quality parts unless the user prefers budget alternatives.",
        "",
        "## Vehicle-Specific Preferences",
        "",
        "_No vehicle-specific preferences yet._",
        "",
        "## Active Skills",
        "",
        "_No skills promoted yet (need repeated / high-confidence signals)._",
        "",
        "## Style",
        "",
        "- Concise checklists over long essays.",
        "- Call out torque specs, fluids, and torque sequences when known.",
        "- Flag when professional service is safer than DIY.",
        "",
        "## Learned Signals",
        "",
        "_No signals captured yet._",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  if (!existsSync(paths.configFile)) {
    const seed = ConfigSchema.parse({});
    writeFileSync(paths.configFile, JSON.stringify(seed, null, 2), "utf8");
  }

  return paths;
}

function loadEnvIntoConfig(partial: Record<string, unknown>): Record<string, unknown> {
  const provider = process.env.CODEBASE_PROVIDER as Config["provider"] | undefined;
  const next = { ...partial };

  if (provider) next.provider = provider;

  next.openrouter = {
    ...((partial.openrouter as object) ?? {}),
    ...(process.env.OPENROUTER_API_KEY
      ? { apiKey: process.env.OPENROUTER_API_KEY }
      : {}),
    ...(process.env.OPENROUTER_MODEL
      ? { model: process.env.OPENROUTER_MODEL }
      : {}),
  };

  next.ollama = {
    ...((partial.ollama as object) ?? {}),
    ...(process.env.OLLAMA_BASE_URL
      ? { baseUrl: process.env.OLLAMA_BASE_URL }
      : {}),
    ...(process.env.OLLAMA_MODEL ? { model: process.env.OLLAMA_MODEL } : {}),
  };

  if (process.env.CODEBASE_HOME) {
    next.dataDir = process.env.CODEBASE_HOME;
  }

  return next;
}

/** Load and validate config from disk + environment. */
export function loadConfig(paths: DataPaths = ensureDataDirs()): Config {
  let fileConfig: Record<string, unknown> = {};
  try {
    if (existsSync(paths.configFile)) {
      fileConfig = JSON.parse(readFileSync(paths.configFile, "utf8")) as Record<
        string,
        unknown
      >;
    }
  } catch {
    fileConfig = {};
  }

  return ConfigSchema.parse(loadEnvIntoConfig(fileConfig));
}

export function saveConfig(config: Config, paths: DataPaths = getDataPaths()): void {
  ensureDataDirs(paths);
  writeFileSync(paths.configFile, JSON.stringify(config, null, 2), "utf8");
}
