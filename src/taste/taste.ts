import { ensureDataDirs, type DataPaths } from "../config/config.js";
import type { LLMProvider } from "../agent/llm.js";
import { TasteEngine } from "./engine.js";
import type { LearningInsight, TasteSignal, TasteSummary } from "./schema.js";
import { captureSignal, type CaptureSignalInput } from "./signals.js";
import type { Skill } from "./schema.js";

/** Facade over TasteEngine for Phase 1 compatibility + Phase 2 learning. */
export class TasteManager {
  private readonly paths: DataPaths;
  readonly engine: TasteEngine;

  constructor(paths: DataPaths = ensureDataDirs(), llm?: LLMProvider) {
    this.paths = paths;
    this.engine = new TasteEngine(paths, llm);
  }

  setLLM(llm?: LLMProvider): void {
    this.engine.setLLM(llm);
  }

  readTasteMarkdown(): string {
    return this.engine.readTasteMarkdown();
  }

  compactTasteSummary(): string {
    return this.engine.compactTasteSummary();
  }

  listSignals(): TasteSignal[] {
    return this.engine.listSignals();
  }

  listSkills(): Skill[] {
    return this.engine.skills.list();
  }

  getSkill(name: string): Skill | null {
    return this.engine.skills.get(name);
  }

  selectRelevantSkills(query: string, vehicleIds: string[] = [], limit = 4): Skill[] {
    return this.engine.skills.selectRelevant(query, vehicleIds, limit);
  }

  formatSkillsForPrompt(skills: Skill[]): string {
    return this.engine.formatSkillsForPrompt(skills);
  }

  summarize(): TasteSummary {
    const signals = this.listSignals();
    const accepts = signals.filter((s) => s.type === "accept").length;
    const rejects = signals.filter((s) => s.type === "reject").length;
    const edits = signals.filter((s) => s.type === "edit").length;
    const recentReasons = signals
      .filter((s) => s.reason || s.userCorrection)
      .slice(-5)
      .map((s) => s.reason ?? s.userCorrection ?? "")
      .filter(Boolean);

    return {
      totalSignals: signals.length,
      accepts,
      rejects,
      edits,
      recentReasons,
      markdown: this.readTasteMarkdown(),
    };
  }

  /** Capture a signal and run the learning pipeline. */
  async record(input: CaptureSignalInput): Promise<{
    signal: TasteSignal;
    insight: LearningInsight;
  }> {
    const signal = captureSignal(input, this.paths);
    const insight = await this.engine.learnFromSignal(signal);
    return { signal, insight };
  }

  async relearn(): Promise<LearningInsight> {
    return this.engine.relearnAll();
  }

  forget(query: string): LearningInsight {
    return this.engine.forget(query);
  }

  formatSummaryForDisplay(): string {
    const s = this.summarize();
    const profile = this.engine.loadProfile();
    const skills = this.listSkills().slice(0, 8);
    const topSkills =
      skills.length === 0
        ? "_No skills yet._"
        : skills
            .map(
              (sk) =>
                `• ${sk.name} (\`${sk.slug}\`) — ${(sk.confidence * 100).toFixed(0)}%`,
            )
            .join("\n");

    return [
      `Taste v${profile.version} · Signals: ${s.totalSignals} (✔ ${s.accepts} · ✖ ${s.rejects} · ✏ ${s.edits})`,
      "",
      this.engine.compactTasteSummary(),
      "",
      "### Top skills",
      topSkills,
      "",
      "Full file: taste.md (use /taste edit)",
    ].join("\n");
  }
}
