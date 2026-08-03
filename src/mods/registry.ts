import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { DataPaths } from "../config/config.js";
import { SkillSchema, type Skill } from "../taste/schema.js";

export const ModManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  name: z.string().min(1),
  version: z.string().default("0.1.0"),
  description: z.string().default(""),
  author: z.string().optional(),
  /** Report kinds this mod can wrap with a template file. */
  reportTemplates: z
    .array(
      z.object({
        kind: z.string(),
        file: z.string(),
      }),
    )
    .default([]),
  /** Extra slash commands → show a markdown file or static text. */
  commands: z
    .array(
      z.object({
        name: z.string().regex(/^\/?[a-z0-9_-]+$/i),
        title: z.string().optional(),
        file: z.string().optional(),
        text: z.string().optional(),
      }),
    )
    .default([]),
  /** Relative paths to skill JSON files inside the mod folder. */
  skills: z.array(z.string()).default([]),
  /**
   * Declared "tools" are local lookup helpers only (no code execution).
   * Each returns markdown from a file when the agent/CLI asks.
   */
  tools: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        file: z.string(),
      }),
    )
    .default([]),
});

export type ModManifest = z.infer<typeof ModManifestSchema>;

export interface InstalledMod {
  manifest: ModManifest;
  dir: string;
  enabled: boolean;
}

const RegistryFileSchema = z.object({
  disabled: z.array(z.string()).default([]),
});

/**
 * Local declarative mods — JSON/Markdown only.
 * No remote marketplace, no arbitrary code execution.
 */
export class ModRegistry {
  private readonly modsDir: string;
  private readonly registryFile: string;
  private cache: InstalledMod[] | null = null;

  constructor(paths: DataPaths) {
    this.modsDir = paths.mods;
    this.registryFile = join(paths.mods, "registry.json");
    mkdirSync(this.modsDir, { recursive: true });
  }

  private loadDisabled(): Set<string> {
    if (!existsSync(this.registryFile)) return new Set();
    try {
      const raw = RegistryFileSchema.parse(
        JSON.parse(readFileSync(this.registryFile, "utf8")) as unknown,
      );
      return new Set(raw.disabled);
    } catch {
      return new Set();
    }
  }

  private saveDisabled(disabled: Set<string>): void {
    writeFileSync(
      this.registryFile,
      JSON.stringify({ disabled: [...disabled].sort() }, null, 2),
      "utf8",
    );
  }

  refresh(): InstalledMod[] {
    this.cache = null;
    return this.list();
  }

  list(): InstalledMod[] {
    if (this.cache) return this.cache;
    const disabled = this.loadDisabled();
    if (!existsSync(this.modsDir)) {
      this.cache = [];
      return this.cache;
    }

    const mods: InstalledMod[] = [];
    for (const name of readdirSync(this.modsDir)) {
      const dir = join(this.modsDir, name);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const manifestPath = join(dir, "mod.json");
      if (!existsSync(manifestPath)) continue;
      try {
        const manifest = ModManifestSchema.parse(
          JSON.parse(readFileSync(manifestPath, "utf8")) as unknown,
        );
        mods.push({
          manifest,
          dir,
          enabled: !disabled.has(manifest.id),
        });
      } catch (err) {
        // Skip invalid mods but keep listing resilient
        mods.push({
          manifest: {
            id: name,
            name: `${name} (invalid mod.json)`,
            version: "0",
            description: err instanceof Error ? err.message : String(err),
            reportTemplates: [],
            commands: [],
            skills: [],
            tools: [],
          },
          dir,
          enabled: false,
        });
      }
    }

    this.cache = mods.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
    return this.cache;
  }

  get(id: string): InstalledMod | undefined {
    return this.list().find(
      (m) => m.manifest.id === id || m.manifest.id.startsWith(id),
    );
  }

  enable(id: string): InstalledMod {
    const mod = this.get(id);
    if (!mod) throw new Error(`Mod not found: ${id}`);
    const disabled = this.loadDisabled();
    disabled.delete(mod.manifest.id);
    this.saveDisabled(disabled);
    this.cache = null;
    return { ...mod, enabled: true };
  }

  disable(id: string): InstalledMod {
    const mod = this.get(id);
    if (!mod) throw new Error(`Mod not found: ${id}`);
    const disabled = this.loadDisabled();
    disabled.add(mod.manifest.id);
    this.saveDisabled(disabled);
    this.cache = null;
    return { ...mod, enabled: false };
  }

  formatList(): string {
    const mods = this.list();
    if (!mods.length) {
      return [
        "No mods installed.",
        "",
        `Drop a folder with mod.json into: ${this.modsDir}`,
        "See README → Phase 8 for the declarative mod format.",
      ].join("\n");
    }
    return [
      "Installed mods",
      "──────────────",
      ...mods.map((m) => {
        const flag = m.enabled ? "ON " : "off";
        return `• [${flag}] ${m.manifest.id} v${m.manifest.version} — ${m.manifest.name}\n  ${m.manifest.description || "(no description)"}`;
      }),
      "",
      "Commands: /mods list|enable|disable|show <id>|path",
    ].join("\n");
  }

  formatOne(id: string): string {
    const mod = this.get(id);
    if (!mod) throw new Error(`Mod not found: ${id}`);
    const m = mod.manifest;
    return [
      `Mod: ${m.name} (${m.id})`,
      `Version: ${m.version}${m.author ? ` · ${m.author}` : ""}`,
      `Enabled: ${mod.enabled}`,
      `Path: ${mod.dir}`,
      "",
      m.description || "(no description)",
      "",
      `Skills files: ${m.skills.length}`,
      `Commands: ${m.commands.map((c) => normalizeCmd(c.name)).join(", ") || "(none)"}`,
      `Report templates: ${m.reportTemplates.map((t) => t.kind).join(", ") || "(none)"}`,
      `Tools (lookup): ${m.tools.map((t) => t.name).join(", ") || "(none)"}`,
      "",
      "Safety: mods are declarative JSON/Markdown only — no remote code, no eval.",
    ].join("\n");
  }

  /** Skills contributed by enabled mods (overlay; not written into taste/). */
  enabledSkills(): Skill[] {
    const out: Skill[] = [];
    for (const mod of this.list().filter((m) => m.enabled)) {
      for (const rel of mod.manifest.skills) {
        const file = join(mod.dir, rel);
        if (!existsSync(file)) continue;
        try {
          const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
          const skill = SkillSchema.parse({
            ...(raw as object),
            source: "user",
            lastUpdated:
              (raw as { lastUpdated?: string }).lastUpdated ??
              new Date().toISOString(),
            createdAt:
              (raw as { createdAt?: string }).createdAt ?? new Date().toISOString(),
          });
          out.push(skill);
        } catch {
          // skip bad skill
        }
      }
    }
    return out;
  }

  /** Handle `/modcmd` style commands registered by mods. Returns markdown or null. */
  tryCommand(line: string): string | null {
    const trimmed = line.trim();
    const name = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!name.startsWith("/")) return null;

    for (const mod of this.list().filter((m) => m.enabled)) {
      for (const cmd of mod.manifest.commands) {
        if (normalizeCmd(cmd.name) !== name) continue;
        if (cmd.text) {
          return `# ${cmd.title ?? mod.manifest.name}\n\n${cmd.text}`;
        }
        if (cmd.file) {
          const file = join(mod.dir, cmd.file);
          if (!existsSync(file)) {
            return `Mod command ${name}: missing file ${cmd.file}`;
          }
          return readFileSync(file, "utf8");
        }
        return `Mod command ${name} has no text/file payload.`;
      }
    }
    return null;
  }

  /**
   * Optional wrapper: template file may contain {{body}}, {{date}}, {{vehicle}}.
   */
  applyReportTemplate(
    kind: string,
    body: string,
    vars: { date: string; vehicle: string },
  ): string | null {
    for (const mod of this.list().filter((m) => m.enabled)) {
      const tpl = mod.manifest.reportTemplates.find(
        (t) => t.kind.toLowerCase() === kind.toLowerCase(),
      );
      if (!tpl) continue;
      const file = join(mod.dir, tpl.file);
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, "utf8");
      return raw
        .replaceAll("{{body}}", body)
        .replaceAll("{{date}}", vars.date)
        .replaceAll("{{vehicle}}", vars.vehicle)
        .replaceAll("{{mod}}", mod.manifest.name);
    }
    return null;
  }

  lookupTool(name: string): string | null {
    const needle = name.toLowerCase();
    for (const mod of this.list().filter((m) => m.enabled)) {
      const tool = mod.manifest.tools.find((t) => t.name.toLowerCase() === needle);
      if (!tool) continue;
      const file = join(mod.dir, tool.file);
      if (!existsSync(file)) return `Mod tool ${name}: missing ${tool.file}`;
      return [
        `Mod tool: ${tool.name} (${mod.manifest.id})`,
        tool.description,
        "",
        readFileSync(file, "utf8"),
      ].join("\n");
    }
    return null;
  }
}

function normalizeCmd(name: string): string {
  const n = name.trim().toLowerCase();
  return n.startsWith("/") ? n : `/${n}`;
}

/** Seed a tiny example mod for docs/tests when missing. */
export function ensureExampleMod(paths: DataPaths): void {
  const dir = join(paths.mods, "example-fleet-notes");
  const manifest = join(dir, "mod.json");
  if (existsSync(manifest)) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    manifest,
    JSON.stringify(
      {
        id: "example-fleet-notes",
        name: "Example Fleet Notes",
        version: "0.1.0",
        description: "Sample declarative mod — disable if you do not need it.",
        commands: [
          {
            name: "/fleetnotes",
            title: "Fleet notes",
            file: "notes.md",
          },
        ],
        skills: ["skills/fleet-cadence.json"],
        reportTemplates: [],
        tools: [
          {
            name: "fleet_notes",
            description: "Local fleet notes from the example mod",
            file: "notes.md",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    join(dir, "notes.md"),
    [
      "# Fleet notes (example mod)",
      "",
      "- Rotate tires across the garage on the same weekend when possible",
      "- Keep a shared spare oil filter SKU list in knowledge/",
      "",
      "Disable with: `/mods disable example-fleet-notes`",
      "",
    ].join("\n"),
    "utf8",
  );
  mkdirSync(join(dir, "skills"), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(dir, "skills", "fleet-cadence.json"),
    JSON.stringify(
      {
        slug: "mod-fleet-cadence",
        name: "Fleet service cadence",
        description: "Batch similar maintenance across vehicles when practical.",
        whenToApply: "When planning garage-wide maintenance weekends",
        rules: [
          "Group similar jobs across vehicles to reduce tool setup time",
          "Still respect per-vehicle due dates and safety-critical items first",
        ],
        confidence: 0.7,
        scope: "personal",
        tags: ["fleet", "mod"],
        evidenceCount: 1,
        enabled: true,
        source: "user",
        createdAt: now,
        lastUpdated: now,
      },
      null,
      2,
    ),
    "utf8",
  );
  // Example starts disabled so installs stay quiet until /mods enable
  const registryFile = join(paths.mods, "registry.json");
  if (!existsSync(registryFile)) {
    writeFileSync(
      registryFile,
      JSON.stringify({ disabled: ["example-fleet-notes"] }, null, 2),
      "utf8",
    );
  }
}
