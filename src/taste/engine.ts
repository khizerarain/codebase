import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LLMProvider } from "../agent/llm.js";
import { ensureDataDirs, type DataPaths } from "../config/config.js";
import { extractPatternHits, type PatternHit } from "./patterns.js";
import {
  LearningInsightSchema,
  PreferenceSchema,
  TasteProfileSchema,
  TasteSignalSchema,
  type LearningInsight,
  type Preference,
  type Skill,
  type TasteProfile,
  type TasteSignal,
} from "./schema.js";
import { signalToMarkdownSnippet } from "./signals.js";
import { SkillStore } from "./skills.js";

const MIN_SKILL_CONFIDENCE = 0.55;
const MIN_SKILL_EVIDENCE = 2;

/** Full taste learning engine: signals → preferences → taste.md + skills. */
export class TasteEngine {
  private readonly paths: DataPaths;
  readonly skills: SkillStore;
  private llm?: LLMProvider;

  constructor(paths: DataPaths = ensureDataDirs(), llm?: LLMProvider) {
    this.paths = paths;
    ensureDataDirs(paths);
    this.skills = new SkillStore(paths);
    this.llm = llm;
  }

  setLLM(llm?: LLMProvider): void {
    this.llm = llm;
  }

  profilePath(): string {
    return join(this.paths.taste, "profile.json");
  }

  loadProfile(): TasteProfile {
    const file = this.profilePath();
    if (!existsSync(file)) {
      return TasteProfileSchema.parse({
        version: 1,
        updatedAt: new Date().toISOString(),
        preferences: [],
        skillSlugs: [],
      });
    }
    try {
      return TasteProfileSchema.parse(
        JSON.parse(readFileSync(file, "utf8")) as unknown,
      );
    } catch {
      return TasteProfileSchema.parse({
        version: 1,
        updatedAt: new Date().toISOString(),
        preferences: [],
        skillSlugs: [],
      });
    }
  }

  saveProfile(profile: TasteProfile): void {
    writeFileSync(
      this.profilePath(),
      JSON.stringify(TasteProfileSchema.parse(profile), null, 2),
      "utf8",
    );
  }

  listSignals(): TasteSignal[] {
    if (!existsSync(this.paths.signals)) return [];
    return readdirSync(this.paths.signals)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return TasteSignalSchema.parse(
            JSON.parse(readFileSync(join(this.paths.signals, f), "utf8")) as unknown,
          );
        } catch {
          return null;
        }
      })
      .filter((s): s is TasteSignal => s !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  readTasteMarkdown(): string {
    if (!existsSync(this.paths.tasteFile)) ensureDataDirs(this.paths);
    return readFileSync(this.paths.tasteFile, "utf8");
  }

  /** Compact high-signal taste for prompt injection (not full history). */
  compactTasteSummary(): string {
    const profile = this.loadProfile();
    const personal = profile.preferences
      .filter((p) => p.scope === "personal" && p.confidence >= 0.4)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 12);
    const vehicle = profile.preferences
      .filter((p) => p.scope === "vehicle" && p.confidence >= 0.4)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);

    const lines = [
      `Taste profile v${profile.version} · updated ${profile.updatedAt.slice(0, 10)}`,
      "",
      "### Personal",
    ];

    if (personal.length === 0) {
      lines.push("- No high-confidence personal preferences yet.");
    } else {
      for (const p of personal) {
        lines.push(
          `- [${(p.confidence * 100).toFixed(0)}%] ${p.text}`,
        );
      }
    }

    if (vehicle.length) {
      lines.push("", "### Vehicle-specific");
      for (const p of vehicle) {
        const vids = p.vehicleIds?.length
          ? ` (vehicles: ${p.vehicleIds.map((id) => id.slice(0, 8)).join(", ")})`
          : "";
        lines.push(
          `- [${(p.confidence * 100).toFixed(0)}%] ${p.text}${vids}`,
        );
      }
    }

    return lines.join("\n");
  }

  formatSkillsForPrompt(skills: Skill[]): string {
    if (!skills.length) return "_No relevant skills selected._";
    return skills
      .map((s) =>
        [
          `### ${s.name} (${(s.confidence * 100).toFixed(0)}%)`,
          s.description,
          `When: ${s.whenToApply}`,
          ...s.rules.map((r) => `- ${r}`),
        ].join("\n"),
      )
      .join("\n\n");
  }

  /**
   * Process one new signal: analyze → update preferences/skills → rewrite taste.md.
   */
  async learnFromSignal(signal: TasteSignal): Promise<LearningInsight> {
    const profile = this.loadProfile();
    const hits = extractPatternHits(signal);
    const llmHits = await this.llmExtractHits(signal);
    const allHits = mergeHits(hits, llmHits);

    const upsertedPrefs: string[] = [];
    const upsertedSkills: string[] = [];

    for (const hit of allHits) {
      const pref = this.upsertPreference(profile, signal, hit);
      upsertedPrefs.push(pref.text);

      const skill = this.maybeUpsertSkill(profile, signal, hit, pref);
      if (skill) upsertedSkills.push(skill.slug);
    }

    profile.version += 1;
    profile.updatedAt = new Date().toISOString();
    profile.skillSlugs = this.skills.list().map((s) => s.slug);
    this.saveProfile(profile);
    this.writeTasteMarkdown(profile);

    const summaryLines = [
      ...uniq(upsertedPrefs).slice(0, 3).map((t) => `preference: ${t}`),
      ...uniq(upsertedSkills).slice(0, 3).map((s) => `skill: ${s}`),
    ];

    if (!summaryLines.length) {
      summaryLines.push("signal saved (no strong new pattern yet)");
    }

    return LearningInsightSchema.parse({
      preferencesUpserted: uniq(upsertedPrefs),
      skillsUpserted: uniq(upsertedSkills),
      preferencesRemoved: [],
      summaryLines,
    });
  }

  /** Full rebuild from all signals ( /learn ). */
  async relearnAll(): Promise<LearningInsight> {
    const signals = this.listSignals();
    const empty = TasteProfileSchema.parse({
      version: 1,
      updatedAt: new Date().toISOString(),
      preferences: [],
      skillSlugs: [],
    });
    this.saveProfile(empty);

    // Clear auto-generated skills; keep files that users may have hand-edited by regenerating from evidence
    for (const skill of this.skills.list()) {
      this.skills.remove(skill.slug);
    }

    const allPrefTexts: string[] = [];
    const allSkillSlugs: string[] = [];

    for (const signal of signals) {
      const insight = await this.learnFromSignal(signal);
      allPrefTexts.push(...insight.preferencesUpserted);
      allSkillSlugs.push(...insight.skillsUpserted);
    }

    // learnFromSignal increments version each time; normalize
    const profile = this.loadProfile();
    profile.version = Math.max(1, signals.length);
    profile.updatedAt = new Date().toISOString();
    this.saveProfile(profile);
    this.writeTasteMarkdown(profile);

    return LearningInsightSchema.parse({
      preferencesUpserted: uniq(allPrefTexts),
      skillsUpserted: uniq(allSkillSlugs),
      preferencesRemoved: [],
      summaryLines: [
        `Re-analyzed ${signals.length} signals`,
        `${uniq(allPrefTexts).length} preferences`,
        `${uniq(allSkillSlugs).length} skills`,
      ],
    });
  }

  forget(preferenceQuery: string): LearningInsight {
    const q = preferenceQuery.trim().toLowerCase();
    if (!q) {
      return LearningInsightSchema.parse({
        preferencesUpserted: [],
        skillsUpserted: [],
        preferencesRemoved: [],
        summaryLines: ["Provide a preference text or skill slug to forget"],
      });
    }

    const profile = this.loadProfile();
    const before = profile.preferences.length;
    const removedPrefs = profile.preferences.filter(
      (p) =>
        p.text.toLowerCase().includes(q) ||
        p.id.toLowerCase() === q ||
        p.tags.some((t) => t.toLowerCase() === q),
    );
    profile.preferences = profile.preferences.filter(
      (p) => !removedPrefs.includes(p),
    );

    const removedSkills: string[] = [];
    for (const skill of this.skills.list()) {
      if (
        skill.slug.includes(q) ||
        skill.name.toLowerCase().includes(q) ||
        skill.tags.some((t) => t.toLowerCase() === q)
      ) {
        this.skills.remove(skill.slug);
        removedSkills.push(skill.slug);
      }
    }

    profile.version += 1;
    profile.updatedAt = new Date().toISOString();
    profile.skillSlugs = this.skills.list().map((s) => s.slug);
    this.saveProfile(profile);
    this.writeTasteMarkdown(profile);

    const removedTexts = removedPrefs.map((p) => p.text);
    return LearningInsightSchema.parse({
      preferencesUpserted: [],
      skillsUpserted: [],
      preferencesRemoved: [...removedTexts, ...removedSkills],
      summaryLines:
        before === profile.preferences.length && !removedSkills.length
          ? [`No preference/skill matched "${preferenceQuery}"`]
          : [
              ...removedTexts.slice(0, 3).map((t) => `forgot preference: ${t}`),
              ...removedSkills.map((s) => `forgot skill: ${s}`),
            ],
    });
  }

  private upsertPreference(
    profile: TasteProfile,
    signal: TasteSignal,
    hit: PatternHit,
  ): Preference {
    const vehicleIds = signal.context.vehicleIds ?? [];
    const scope = resolvePreferenceScope(profile, hit, vehicleIds);

    const id = [
      hit.key,
      scope,
      scope === "vehicle" ? vehicleIds.slice().sort().join(",") : "global",
    ].join("::");

    // If promoting to personal, drop narrower vehicle copies of the same key
    if (scope === "personal") {
      profile.preferences = profile.preferences.filter(
        (p) => !(p.id.startsWith(`${hit.key}::vehicle::`)),
      );
    }

    const existing = profile.preferences.find((p) => p.id === id);
    const now = new Date().toISOString();

    if (!existing) {
      const created = PreferenceSchema.parse({
        id,
        text: hit.text,
        category: hit.category,
        scope,
        vehicleIds: scope === "vehicle" ? vehicleIds : [],
        confidence: clamp(0.35 + hit.weight * 0.2, 0, 0.95),
        evidenceCount: 1,
        sourceSignalIds: [signal.id],
        tags: hit.tags,
        lastUpdated: now,
      });
      profile.preferences.push(created);
      return created;
    }

    const repeatedBonus = Math.min(existing.evidenceCount, 8) * 0.04;
    existing.evidenceCount += 1;
    existing.confidence = clamp(
      existing.confidence + hit.weight * 0.12 + repeatedBonus * 0.1,
      0,
      0.98,
    );
    existing.text = hit.text;
    existing.lastUpdated = now;
    if (!existing.sourceSignalIds.includes(signal.id)) {
      existing.sourceSignalIds.push(signal.id);
    }
    existing.tags = uniq([...existing.tags, ...hit.tags]);
    return existing;
  }

  private maybeUpsertSkill(
    profile: TasteProfile,
    signal: TasteSignal,
    hit: PatternHit,
    pref: Preference,
  ): Skill | null {
    // Only promote repeated / high-confidence patterns into skills
    if (
      pref.confidence < MIN_SKILL_CONFIDENCE &&
      pref.evidenceCount < MIN_SKILL_EVIDENCE
    ) {
      return null;
    }
    if (pref.evidenceCount < MIN_SKILL_EVIDENCE && pref.confidence < 0.75) {
      return null;
    }

    const existing = this.skills.get(hit.skillSlug);
    const now = new Date().toISOString();
    const rules = uniq([
      pref.text,
      ...(existing?.rules ?? []),
      ...(signal.type === "edit" && signal.userCorrection
        ? [`Honor correction: ${truncate(signal.userCorrection, 140)}`]
        : []),
      ...(signal.type === "reject" && signal.reason
        ? [`Avoid: ${truncate(signal.reason, 120)}`]
        : []),
    ]).slice(0, 8);

    const skill = this.skills.upsert({
      slug: hit.skillSlug,
      name: hit.skillName,
      description: pref.text,
      whenToApply: hit.whenToApply,
      rules: rules.length ? rules : [pref.text],
      confidence: pref.confidence,
      scope: pref.scope,
      vehicleIds: pref.vehicleIds ?? [],
      tags: uniq([...hit.tags, ...pref.tags]),
      evidenceCount: pref.evidenceCount,
      enabled: existing?.enabled ?? true,
      source: existing?.source ?? "learned",
      lastUsed: existing?.lastUsed,
      createdAt: existing?.createdAt ?? now,
      lastUpdated: now,
    });

    if (!profile.skillSlugs.includes(skill.slug)) {
      profile.skillSlugs.push(skill.slug);
    }
    return skill;
  }

  private async llmExtractHits(signal: TasteSignal): Promise<PatternHit[]> {
    if (!this.llm) return [];

    const prompt = [
      "Extract 0-3 concrete vehicle-taste preferences from this user feedback signal.",
      "Only include preferences clearly supported by the signal. Never invent.",
      "Return ONLY JSON array items: {\"text\":\"...\",\"category\":\"diy_vs_shop|part_quality|budget|risk|maintenance_style|brand|ev_ice|communication|performance|other\",\"tags\":[\"...\"],\"personal\":true}",
      "",
      `type: ${signal.type}`,
      `userMessage: ${signal.context.userMessage}`,
      `reason: ${signal.reason ?? ""}`,
      `userCorrection: ${signal.userCorrection ?? ""}`,
      `originalResponse: ${truncate(signal.originalResponse, 500)}`,
    ].join("\n");

    try {
      const res = await this.llm.chat([
        {
          role: "system",
          content:
            "You extract structured vehicle taste preferences. Reply with JSON array only.",
        },
        { role: "user", content: prompt },
      ]);

      const json = extractJsonArray(res.content);
      if (!json) return [];

      return json.slice(0, 3).map((item, i) => {
        const text = String(item.text ?? "").trim();
        const tags = Array.isArray(item.tags)
          ? item.tags.map(String).slice(0, 6)
          : [];
        const category = String(item.category ?? "other");
        const slug = `llm-${slugify(text).slice(0, 40) || i}`;
        return {
          key: `llm:${slug}`,
          text: text || "Learned preference",
          category: (category as Preference["category"]) || "other",
          tags,
          skillSlug: slug,
          skillName: titleize(slug),
          whenToApply: "When the topic matches this preference",
          weight: signal.type === "edit" ? 1.1 : 0.8,
          polarity: "positive" as const,
        };
      }).filter((h) => h.text.length > 3);
    } catch {
      return [];
    }
  }

  writeTasteMarkdown(profile: TasteProfile = this.loadProfile()): void {
    const signals = this.listSignals();
    const skills = this.skills.list();
    const personal = profile.preferences.filter((p) => p.scope === "personal");
    const vehicle = profile.preferences.filter((p) => p.scope === "vehicle");

    const md = [
      "# Vehicle Taste",
      "",
      `> Version **${profile.version}** · Updated **${profile.updatedAt}**`,
      "",
      "Living preferences learned from Accept / Reject / Edit signals.",
      "Human-editable. Use `/taste edit`, `/forget`, or `/learn`.",
      "",
      "## Personal Preferences",
      "",
      ...(personal.length
        ? personal
            .sort((a, b) => b.confidence - a.confidence)
            .map(
              (p) =>
                `- [${(p.confidence * 100).toFixed(0)}% · ×${p.evidenceCount}] ${p.text}`,
            )
        : ["_No personal preferences learned yet._"]),
      "",
      "## Vehicle-Specific Preferences",
      "",
      ...(vehicle.length
        ? vehicle
            .sort((a, b) => b.confidence - a.confidence)
            .map((p) => {
              const vids = p.vehicleIds?.length
                ? ` \`${p.vehicleIds.map((id) => id.slice(0, 8)).join(",")}\``
                : "";
              return `- [${(p.confidence * 100).toFixed(0)}% · ×${p.evidenceCount}] ${p.text}${vids}`;
            })
        : ["_No vehicle-specific preferences yet._"]),
      "",
      "## Active Skills",
      "",
      ...(skills.length
        ? skills.map(
            (s) =>
              `- **${s.name}** (\`${s.slug}\`) — ${(s.confidence * 100).toFixed(0)}% confidence, ${s.evidenceCount} evidence`,
          )
        : ["_No skills promoted yet (need repeated / high-confidence signals)._"]),
      "",
      "## Style",
      "",
      "- Concise checklists over long essays unless the user asks for depth.",
      "- Call out torque specs, fluids, and safety stops when known.",
      "- Flag when professional service is safer than DIY.",
      "",
      "## Learned Signals",
      "",
      ...(signals.length === 0
        ? ["_No signals captured yet._", ""]
        : [
            `Total: ${signals.length} · Accepts: ${signals.filter((s) => s.type === "accept").length} · Rejects: ${signals.filter((s) => s.type === "reject").length} · Edits: ${signals.filter((s) => s.type === "edit").length}`,
            "",
            ...signals.slice(-20).map(signalToMarkdownSnippet),
            "",
          ]),
    ].join("\n");

    writeFileSync(this.paths.tasteFile, md, "utf8");
  }
}

function resolvePreferenceScope(
  profile: TasteProfile,
  hit: PatternHit,
  vehicleIds: string[],
): "personal" | "vehicle" {
  // Communication / style prefs are almost always personal
  if (hit.category === "communication") return "personal";

  // Already personal → stay personal
  if (profile.preferences.some((p) => p.id === `${hit.key}::personal::global`)) {
    return "personal";
  }

  // No vehicle context → personal
  if (!vehicleIds.length) return "personal";

  // Same pattern seen for a different vehicle (or already conflicting) → personal
  const otherVehicle = profile.preferences.find(
    (p) =>
      p.id.startsWith(`${hit.key}::vehicle::`) &&
      p.id !== `${hit.key}::vehicle::${vehicleIds.slice().sort().join(",")}`,
  );
  if (otherVehicle) return "personal";

  // Brand prefs with a vehicle id stay vehicle-specific more readily
  if (hit.category === "brand") return "vehicle";

  // First sighting with vehicle context → vehicle-specific until proven general
  return "vehicle";
}

function mergeHits(a: PatternHit[], b: PatternHit[]): PatternHit[] {
  const map = new Map<string, PatternHit>();
  for (const hit of [...a, ...b]) {
    const prev = map.get(hit.key);
    if (!prev || hit.weight > prev.weight) map.set(hit.key, hit);
  }
  return [...map.values()];
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleize(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function extractJsonArray(text: string): Array<Record<string, unknown>> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? text).trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : null;
  } catch {
    return null;
  }
}
