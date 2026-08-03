import { existsSync, readFileSync } from "node:fs";
import type { PromptContext } from "../agent/prompts.js";
import { timed } from "../utils/verbose.js";
import { pickTopByRelevance } from "./relevance.js";
import type { LocalDataStore } from "./store.js";

export interface AssembleOptions {
  mode?: string;
  approvedPlan?: string;
  /** Soft budget for injected knowledge/history blocks. */
  maxExtraBlocks?: number;
}

/**
 * Relevance-scored context assembly for LLM prompts.
 * Prefer this over dumping full stores into every turn.
 */
export class ContextAssembler {
  constructor(private readonly data: LocalDataStore) {}

  assemble(userMessage: string, opts: AssembleOptions = {}): PromptContext {
    return timed("context.assemble", () => this.assembleInner(userMessage, opts));
  }

  private assembleInner(userMessage: string, opts: AssembleOptions): PromptContext {
    const active = this.data.ensureSmartActive();
    const vehicleIds = active
      ? [active.id]
      : this.data.memory.getSession().vehicleIds;

    const skills = this.data.taste.selectRelevantSkills(
      userMessage,
      vehicleIds,
      4,
    );

    const longTerm = this.data.longTerm.promptSummary(vehicleIds, {
      query: userMessage,
      limit: this.data.config.maxMemoryFacts ?? 8,
    });

    const serviceBlock =
      active && needsServiceContext(userMessage)
        ? this.data.relevantServiceHistory(userMessage, active.id, 4)
        : "";

    const knowledgeBlock =
      needsKnowledgeContext(userMessage) || opts.mode?.includes("execute")
        ? this.data.relevantKnowledge(userMessage, active?.id, 2)
        : "";

    const extras: string[] = [];
    if (serviceBlock && !serviceBlock.startsWith("_No")) {
      extras.push(`## Related Service History\n${serviceBlock}`);
    }
    if (knowledgeBlock) {
      extras.push(`## Relevant Local Knowledge\n${knowledgeBlock}`);
    }

    if (isGarageQuery(userMessage) && this.data.vehicles.list().length > 1) {
      const top = this.data.garageAttention(userMessage).slice(0, 4);
      if (top.length) {
        extras.push(
          `## Garage Focus\n${top.map((a) => `- ${a.label}: ${a.summary}`).join("\n")}`,
        );
      }
    }

    const maxExtra = opts.maxExtraBlocks ?? 3;
    const trimmedExtras = extras.slice(0, maxExtra);

    const activeDetail = active
      ? this.data.vehicles.formatDetail(active)
      : "_No active vehicle. Use /vehicles add …_";

    return {
      tasteSummary: this.data.tasteSummaryCached(),
      relevantSkills: this.data.taste.formatSkillsForPrompt(skills),
      vehiclesSummary: this.leanVehiclesSummary(active?.id, userMessage),
      activeVehicle: activeDetail,
      memoryNotes: this.summarizeSessionIfNeeded(userMessage),
      longTermMemory: longTerm,
      garagePrefs: this.readGaragePrefsCompact(),
      mode: opts.mode,
      approvedPlan: opts.approvedPlan,
      extraContext: trimmedExtras.join("\n\n"),
    };
  }

  private leanVehiclesSummary(activeId: string | undefined, query: string): string {
    const list = this.data.vehicles.list();
    if (!list.length) return "_No vehicles in garage._";
    if (list.length <= 4) return this.data.vehicles.promptSummary(activeId);

    const relevant = pickTopByRelevance(
      list.filter((v) => v.id !== activeId),
      query,
      (v) =>
        `${v.year} ${v.make} ${v.model} ${v.knownIssues.join(" ")} ${v.notes}`,
      3,
      0.01,
    );
    const lines = list
      .filter((v) => v.id === activeId || relevant.some((r) => r.id === v.id))
      .map((v) => {
        const mark = v.id === activeId ? "★" : " ";
        return `${mark} ${v.year} ${v.make} ${v.model} · ${v.currentMileage.toLocaleString()} mi · id:${v.id.slice(0, 8)}`;
      });
    return [
      `Garage: ${list.length} vehicles (showing active + relevant)`,
      ...lines,
      list.length > lines.length
        ? `… +${list.length - lines.length} more (use /garage or /vehicles)`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private summarizeSessionIfNeeded(userMessage: string): string {
    const notes = this.data.memory.recentNotesSummary();
    const msgs = this.data.memory.getSession().messages;
    if (msgs.length < 40) return notes;

    const userTurns = msgs
      .filter((m) => m.role === "user")
      .slice(0, -6)
      .map((m) => m.content.replace(/\s+/g, " ").trim().slice(0, 80));
    const digest = pickTopByRelevance(userTurns, userMessage, (t) => t, 4, 0.01);
    if (!digest.length) return notes;
    return [
      notes,
      "",
      "Earlier session themes:",
      ...digest.map((t) => `- ${t}`),
    ]
      .filter(Boolean)
      .join("\n");
  }

  private readGaragePrefsCompact(): string {
    try {
      if (!existsSync(this.data.paths.garagePrefsFile)) {
        return "_No garage-wide preferences._";
      }
      const raw = JSON.parse(
        readFileSync(this.data.paths.garagePrefsFile, "utf8"),
      ) as { notes?: string; preferences?: string[] };
      const prefs = (raw.preferences ?? []).slice(0, 6);
      const notes = raw.notes?.trim();
      if (!prefs.length && !notes) return "_No garage-wide preferences._";
      return [notes ? `Notes: ${notes}` : null, ...prefs.map((p) => `- ${p}`)]
        .filter(Boolean)
        .join("\n");
    } catch {
      return "_No garage-wide preferences._";
    }
  }
}

function needsServiceContext(msg: string): boolean {
  return /\b(service|history|last (oil|brake|tire)|when did|mileage|due|overdue|log|maintenance|replace|change)\b/i.test(
    msg,
  );
}

function needsKnowledgeContext(msg: string): boolean {
  return /\b(manual|torque|spec|procedure|tsb|knowledge|pdf|notes?|how (do|to)|fluid|capacity)\b/i.test(
    msg,
  );
}

function isGarageQuery(msg: string): boolean {
  return /\b(garage|all (cars|vehicles)|across|every (car|vehicle)|fleet|this month|what needs)\b/i.test(
    msg,
  );
}
