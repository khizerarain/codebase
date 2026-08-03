import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ensureDataDirs, type DataPaths } from "../config/config.js";
import { SkillSchema, type Skill } from "./schema.js";

export interface CreateSkillInput {
  name: string;
  description: string;
  whenToApply?: string;
  rules: string[];
  tags?: string[];
  scope?: "personal" | "vehicle";
  vehicleIds?: string[];
  confidence?: number;
}

/** Local Markdown skill files under taste/skills/. */
export class SkillStore {
  private readonly dir: string;

  constructor(paths: DataPaths = ensureDataDirs()) {
    this.dir = paths.skills ?? join(paths.taste, "skills");
    mkdirSync(this.dir, { recursive: true });
  }

  pathFor(slug: string): string {
    return join(this.dir, `${slug}.md`);
  }

  list(opts: { includeDisabled?: boolean } = {}): Skill[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => this.read(f.replace(/\.md$/, "")))
      .filter((s): s is Skill => s !== null)
      .filter((s) => opts.includeDisabled || s.enabled)
      .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
  }

  get(slugOrName: string): Skill | null {
    const needle = slugOrName.trim().toLowerCase();
    const bySlug = this.read(needle);
    if (bySlug) return bySlug;
    return (
      this.list({ includeDisabled: true }).find(
        (s) =>
          s.slug === needle ||
          s.name.toLowerCase() === needle ||
          s.name.toLowerCase().replace(/\s+/g, "-") === needle,
      ) ?? null
    );
  }

  upsert(skill: Skill): Skill {
    const parsed = SkillSchema.parse({
      ...skill,
      lastUpdated: new Date().toISOString(),
    });
    writeFileSync(this.pathFor(parsed.slug), skillToMarkdown(parsed), "utf8");
    return parsed;
  }

  create(input: CreateSkillInput): Skill {
    const slug = slugify(input.name);
    if (this.get(slug)) {
      throw new Error(`Skill already exists: ${slug}. Use /skill edit ${slug}`);
    }
    const now = new Date().toISOString();
    return this.upsert({
      slug,
      name: input.name,
      description: input.description,
      whenToApply: input.whenToApply ?? "When the topic matches this skill",
      rules: input.rules.length ? input.rules : [input.description],
      confidence: input.confidence ?? 0.85,
      scope: input.scope ?? "personal",
      vehicleIds: input.vehicleIds ?? [],
      tags: input.tags ?? [],
      evidenceCount: 1,
      enabled: true,
      source: "user",
      createdAt: now,
      lastUpdated: now,
    });
  }

  setEnabled(slugOrName: string, enabled: boolean): Skill {
    const skill = this.get(slugOrName);
    if (!skill) throw new Error(`Skill not found: ${slugOrName}`);
    return this.upsert({ ...skill, enabled });
  }

  touchLastUsed(slug: string): void {
    const skill = this.read(slug);
    if (!skill) return;
    this.upsert({ ...skill, lastUsed: new Date().toISOString() });
  }

  remove(slug: string): boolean {
    const file = this.pathFor(slug);
    if (!existsSync(file)) {
      const found = this.get(slug);
      if (!found) return false;
      unlinkSync(this.pathFor(found.slug));
      return true;
    }
    unlinkSync(file);
    return true;
  }

  read(slug: string): Skill | null {
    const file = this.pathFor(slug);
    if (!existsSync(file)) return null;
    try {
      return markdownToSkill(readFileSync(file, "utf8"), slug);
    } catch {
      return null;
    }
  }

  formatList(): string {
    const skills = this.list({ includeDisabled: true });
    if (skills.length === 0) {
      return "No skills yet. Create one with /skill create, or teach via Accept/Reject/Edit.";
    }
    return skills
      .map((s) => {
        const state = s.enabled ? "on" : "off";
        const src = s.source === "user" ? "user" : "learned";
        const scope =
          s.scope === "vehicle"
            ? `vehicle:${(s.vehicleIds ?? []).map((id) => id.slice(0, 8)).join(",") || "?"}`
            : "global";
        return `• [${state}] ${s.name} (\`${s.slug}\`) · ${src} · ${scope} · ${(s.confidence * 100).toFixed(0)}% · tags: ${s.tags.join(", ") || "-"}`;
      })
      .join("\n");
  }

  formatOne(skill: Skill): string {
    return skillToMarkdown(skill);
  }

  /**
   * Pick compact, high-signal skills for the current query + vehicles.
   * Never dumps the whole library into the prompt.
   */
  selectRelevant(query: string, vehicleIds: string[] = [], limit = 4): Skill[] {
    const q = query.toLowerCase();
    const tokens = tokenize(q);
    const vehicleSet = new Set(vehicleIds);

    const scored = this.list()
      .filter((s) => s.enabled && s.confidence >= 0.4)
      .map((s) => {
        let score = s.confidence * 10 + Math.min(s.evidenceCount, 5);

        if (s.scope === "vehicle") {
          const overlap = (s.vehicleIds ?? []).some((id) => vehicleSet.has(id));
          if (!overlap) return { s, score: -1 };
          score += 5;
        }

        for (const tag of s.tags) {
          if (q.includes(tag.toLowerCase()) || tokens.has(tag.toLowerCase())) {
            score += 3;
          }
        }

        for (const token of tokenize(
          `${s.name} ${s.description} ${s.whenToApply} ${s.rules.join(" ")}`,
        )) {
          if (tokens.has(token)) score += 1.5;
        }

        if (s.source === "user") score += 1.5;
        if (s.scope === "personal" && s.confidence >= 0.7) score += 1;

        return { s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const picked = scored.slice(0, limit).map((x) => x.s);

    for (const s of picked) {
      try {
        this.touchLastUsed(s.slug);
      } catch {
        // ignore
      }
    }

    if (picked.length === 0) {
      return this.list()
        .filter((s) => s.enabled && s.scope === "personal" && s.confidence >= 0.6)
        .slice(0, Math.min(2, limit));
    }

    return picked;
  }
}

export function skillToMarkdown(skill: Skill): string {
  return [
    `# ${skill.name}`,
    "",
    `<!-- codebase-skill: ${JSON.stringify({
      slug: skill.slug,
      confidence: skill.confidence,
      scope: skill.scope,
      vehicleIds: skill.vehicleIds ?? [],
      tags: skill.tags,
      evidenceCount: skill.evidenceCount,
      enabled: skill.enabled,
      source: skill.source,
      lastUsed: skill.lastUsed ?? null,
      createdAt: skill.createdAt,
      lastUpdated: skill.lastUpdated,
    })} -->`,
    "",
    `**Description:** ${skill.description}`,
    "",
    `**When to apply:** ${skill.whenToApply}`,
    "",
    `**Confidence:** ${(skill.confidence * 100).toFixed(0)}%`,
    "",
    `**Enabled:** ${skill.enabled ? "yes" : "no"}`,
    "",
    `**Source:** ${skill.source}`,
    "",
    `**Scope:** ${skill.scope}${
      skill.vehicleIds?.length ? ` (${skill.vehicleIds.join(", ")})` : ""
    }`,
    "",
    `**Tags:** ${skill.tags.join(", ") || "-"}`,
    "",
    `**Last used:** ${skill.lastUsed ?? "never"}`,
    "",
    `**Last updated:** ${skill.lastUpdated}`,
    "",
    "## Rules",
    "",
    ...skill.rules.map((r) => `- ${r}`),
    "",
  ].join("\n");
}

export function markdownToSkill(markdown: string, fallbackSlug: string): Skill {
  const metaMatch = markdown.match(/<!--\s*codebase-skill:\s*([\s\S]*?)-->/);
  let meta: Record<string, unknown> = {};
  if (metaMatch?.[1]) {
    try {
      meta = JSON.parse(metaMatch[1]) as Record<string, unknown>;
    } catch {
      meta = {};
    }
  }

  const name =
    markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    String(meta.name ?? fallbackSlug);
  const description =
    markdown.match(/\*\*Description:\*\*\s*(.+)/i)?.[1]?.trim() ??
    "Learned skill";
  const whenToApply =
    markdown.match(/\*\*When to apply:\*\*\s*(.+)/i)?.[1]?.trim() ??
    "When relevant to the user's question";
  const rulesSection = markdown.split(/##\s+Rules/i)[1] ?? "";
  const rules = [...rulesSection.matchAll(/^[-*]\s+(.+)$/gm)]
    .map((m) => m[1]!.trim())
    .filter(Boolean);

  return SkillSchema.parse({
    slug: String(meta.slug ?? fallbackSlug),
    name,
    description,
    whenToApply,
    rules: rules.length ? rules : ["Follow the skill description."],
    confidence: Number(meta.confidence ?? 0.5),
    scope: (meta.scope as "personal" | "vehicle") ?? "personal",
    vehicleIds: (meta.vehicleIds as string[] | undefined) ?? [],
    tags: (meta.tags as string[] | undefined) ?? [],
    evidenceCount: Number(meta.evidenceCount ?? 1),
    enabled: meta.enabled === undefined ? true : Boolean(meta.enabled),
    source: meta.source === "user" ? "user" : "learned",
    lastUsed: meta.lastUsed ? String(meta.lastUsed) : undefined,
    createdAt: String(meta.createdAt ?? new Date().toISOString()),
    lastUpdated: String(meta.lastUpdated ?? new Date().toISOString()),
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((t) => t.length > 2),
  );
}
