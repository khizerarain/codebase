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

  list(): Skill[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => this.read(f.replace(/\.md$/, "")))
      .filter((s): s is Skill => s !== null)
      .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
  }

  get(slugOrName: string): Skill | null {
    const needle = slugOrName.trim().toLowerCase();
    const bySlug = this.read(needle);
    if (bySlug) return bySlug;
    return (
      this.list().find(
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

  remove(slug: string): boolean {
    const file = this.pathFor(slug);
    if (!existsSync(file)) return false;
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
    const skills = this.list();
    if (skills.length === 0) {
      return "No skills learned yet. Accept/Reject/Edit answers to build them.";
    }
    return skills
      .map(
        (s) =>
          `• ${s.name} (${s.slug}) · confidence ${(s.confidence * 100).toFixed(0)}% · evidence ${s.evidenceCount}`,
      )
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
      .filter((s) => s.confidence >= 0.45)
      .map((s) => {
        let score = s.confidence * 10 + Math.min(s.evidenceCount, 5);

        if (s.scope === "vehicle") {
          const overlap = (s.vehicleIds ?? []).some((id) => vehicleSet.has(id));
          if (!overlap) return { s, score: -1 };
          score += 4;
        }

        for (const tag of s.tags) {
          if (q.includes(tag.toLowerCase()) || tokens.has(tag.toLowerCase())) {
            score += 3;
          }
        }

        for (const token of tokenize(`${s.name} ${s.description} ${s.whenToApply}`)) {
          if (tokens.has(token)) score += 1.5;
        }

        // Soft boost for generally useful high-confidence personal skills
        if (s.scope === "personal" && s.confidence >= 0.7) score += 1;

        return { s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const picked = scored.slice(0, limit).map((x) => x.s);

    // Always include top personal skill if nothing matched but skills exist
    if (picked.length === 0) {
      return this.list()
        .filter((s) => s.scope === "personal" && s.confidence >= 0.6)
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
    `**Scope:** ${skill.scope}${
      skill.vehicleIds?.length ? ` (${skill.vehicleIds.join(", ")})` : ""
    }`,
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
    createdAt: String(meta.createdAt ?? new Date().toISOString()),
    lastUpdated: String(meta.lastUpdated ?? new Date().toISOString()),
  });
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter((t) => t.length > 2),
  );
}
