import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Config, DataPaths } from "../config/config.js";
import { KnowledgeBase } from "../knowledge/knowledge.js";
import type { MemoryStore } from "../memory/memory.js";
import { LongTermMemory } from "../memory/longterm.js";
import { PlanStore } from "../plans/plans.js";
import type { TasteManager } from "../taste/taste.js";
import { TtlCache } from "../utils/cache.js";
import type { Vehicle, VehicleStore } from "../vehicles/vehicles.js";
import { computeMaintenanceItems } from "../workflows/maintenance.js";
import { formatDueReport } from "../workflows/due.js";
import { pickTopByRelevance, scoreRelevance } from "./relevance.js";

export interface LocalDataBundle {
  paths: DataPaths;
  config: Config;
  vehicles: VehicleStore;
  taste: TasteManager;
  memory: MemoryStore;
  longTerm: LongTermMemory;
  knowledge: KnowledgeBase;
  plans: PlanStore;
}

export interface AttentionItem {
  vehicleId: string;
  label: string;
  summary: string;
  score: number;
}

/**
 * Unified local data access layer.
 * Prefer this over reaching into scattered stores from new code.
 */
export class LocalDataStore {
  readonly knowledge: KnowledgeBase;
  readonly longTerm: LongTermMemory;
  readonly plans: PlanStore;
  private readonly cache: TtlCache<string>;

  constructor(private readonly bundle: LocalDataBundle) {
    this.knowledge = bundle.knowledge;
    this.longTerm = bundle.longTerm;
    this.plans = bundle.plans;
    this.cache = new TtlCache<string>(bundle.config.contextCacheTtlMs ?? 30_000);
  }

  get paths(): DataPaths {
    return this.bundle.paths;
  }

  get config(): Config {
    return this.bundle.config;
  }

  get vehicles(): VehicleStore {
    return this.bundle.vehicles;
  }

  get taste(): TasteManager {
    return this.bundle.taste;
  }

  get memory(): MemoryStore {
    return this.bundle.memory;
  }

  invalidateCache(prefix?: string): void {
    this.cache.invalidate(prefix);
  }

  cacheSize(): number {
    return this.cache.size();
  }

  /** Hot path: cached compact taste. */
  tasteSummaryCached(): string {
    const key = "taste:compact";
    const hit = this.cache.get(key);
    if (hit) return hit;
    const value = this.taste.compactTasteSummary();
    this.cache.set(key, value);
    return value;
  }

  activeVehicle(): Vehicle | undefined {
    const configured = this.config.defaultVehicleId;
    if (configured) {
      const v = this.vehicles.get(configured);
      if (v) {
        if (this.vehicles.getActiveId() !== v.id) {
          try {
            this.vehicles.setActive(v.id);
          } catch {
            // ignore
          }
        }
        return v;
      }
    }
    return this.vehicles.getActive();
  }

  /** Smarter default: most recently serviced, else highest mileage, else first. */
  suggestActiveVehicle(): Vehicle | undefined {
    const list = this.vehicles.list();
    if (!list.length) return undefined;
    const scored = list.map((v) => {
      const last = [...v.serviceHistory].sort((a, b) =>
        b.date.localeCompare(a.date),
      )[0];
      const recency = last ? Date.parse(last.date) || 0 : 0;
      return { v, score: recency + v.currentMileage };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.v;
  }

  ensureSmartActive(): Vehicle | undefined {
    const current = this.activeVehicle();
    if (current) return current;
    const suggested = this.suggestActiveVehicle();
    if (suggested) this.vehicles.setActive(suggested.id);
    return suggested;
  }

  recentServiceHistory(vehicleId: string, limit = 5): string {
    const v = this.vehicles.get(vehicleId);
    if (!v) return "";
    const rows = [...v.serviceHistory]
      .sort((a, b) => b.date.localeCompare(a.date) || b.mileage - a.mileage)
      .slice(0, limit);
    if (!rows.length) return "_No service history._";
    return rows
      .map(
        (r) =>
          `- ${r.date.slice(0, 10)} @ ${r.mileage.toLocaleString()} mi — ${r.description}${r.cost != null ? ` ($${r.cost})` : ""}`,
      )
      .join("\n");
  }

  relevantServiceHistory(query: string, vehicleId: string, limit = 4): string {
    const v = this.vehicles.get(vehicleId);
    if (!v?.serviceHistory.length) return "_No related service history._";
    const picked = pickTopByRelevance(
      v.serviceHistory,
      query,
      (r) => r.description,
      limit,
      0.02,
    );
    if (!picked.length) return this.recentServiceHistory(vehicleId, 3);
    return picked
      .map(
        (r) =>
          `- ${r.date.slice(0, 10)} @ ${r.mileage.toLocaleString()} mi — ${r.description}`,
      )
      .join("\n");
  }

  relevantKnowledge(query: string, vehicleId?: string, limit = 2): string {
    const key = `knowledge:${vehicleId ?? "g"}:${query.slice(0, 80)}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const raw = this.knowledge.search(query, {
      vehicleIds: vehicleId ? [vehicleId] : [],
      limit,
    });
    if (/No matches|empty/i.test(raw)) {
      this.cache.set(key, "", 10_000);
      return "";
    }
    const compact = raw.split("\n").slice(0, 30).join("\n");
    this.cache.set(key, compact, 20_000);
    return compact;
  }

  recentArtifacts(limit = 5): Array<{ kind: string; name: string; mtime: number }> {
    const out: Array<{ kind: string; name: string; mtime: number }> = [];
    const scan = (dir: string, kind: string) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        if (name.startsWith("_")) continue;
        try {
          const st = statSync(join(dir, name));
          if (st.isFile()) out.push({ kind, name, mtime: st.mtimeMs });
        } catch {
          // ignore
        }
      }
    };
    scan(this.paths.plans, "plan");
    scan(this.paths.exports, "export");
    return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  }

  /** Garage-scale: what needs attention across vehicles. */
  garageAttention(query = "due overdue maintenance"): AttentionItem[] {
    const list = this.vehicles.list();
    const items: AttentionItem[] = [];
    for (const v of list) {
      const dueItems = computeMaintenanceItems(v, this.taste, 10000);
      const overdue = dueItems.filter((i) => i.status === "overdue").length;
      const soon = dueItems.filter((i) => i.status === "due_soon").length;
      const text = `${v.year} ${v.make} ${v.model} ${v.knownIssues.join(" ")} ${v.notes}`;
      const rel = scoreRelevance(query, text);
      const score =
        rel * 5 +
        overdue * 4 +
        soon * 2 +
        v.knownIssues.length * 2 +
        (v.serviceHistory.length === 0 ? 1.5 : 0) +
        (v.currentMileage > 100000 ? 1 : 0);
      const topDue = dueItems.find(
        (i) => i.status === "overdue" || i.status === "due_soon",
      );
      items.push({
        vehicleId: v.id,
        label: `${v.year} ${v.make} ${v.model}`,
        summary:
          topDue?.item ??
          v.knownIssues[0] ??
          (v.serviceHistory.length
            ? `Last: ${[...v.serviceHistory].sort((a, b) => b.date.localeCompare(a.date))[0]!.description}`
            : "No service history logged"),
        score,
      });
    }
    return items.sort((a, b) => b.score - a.score);
  }

  garageAttentionReport(): string {
    const activeId = this.vehicles.getActiveId();
    const due = formatDueReport(this.vehicles, this.taste, {
      garage: true,
      horizonMiles: 10000,
    });
    const ranked = this.garageAttention();
    const focus = ranked
      .slice(0, 8)
      .map(
        (a, i) =>
          `${i + 1}. ${a.label}${a.vehicleId === activeId ? " (active)" : ""} — ${a.summary}`,
      );
    return [
      "Garage attention (this month / near-term)",
      "───────────────────────────────────────",
      ...focus,
      "",
      due,
    ].join("\n");
  }

  /** Run the same lightweight due workflow label for many vehicles. */
  multiVehicleWorkflowPreview(job: string, limit = 12): string {
    const list = this.vehicles.list().slice(0, limit);
    if (!list.length) return "Garage is empty.";
    return [
      `Workflow across garage: ${job}`,
      "──────────────────────────────",
      ...list.map((v) => {
        const due = computeMaintenanceItems(v, this.taste, 8000).filter(
          (i) => i.status === "overdue" || i.status === "due_soon",
        );
        return `• ${v.year} ${v.make} ${v.model}: ${due.length ? due.map((d) => d.item).slice(0, 3).join(", ") : "ok for near horizon"}`;
      }),
      list.length >= limit ? `\n(Showing first ${limit}.)` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  statusSnapshot(): string {
    const vehicles = this.vehicles.list();
    const allSkills = this.taste.engine.skills.list({ includeDisabled: true });
    const facts = this.longTerm.list();
    const docs = this.knowledge.list();
    const plans = this.plans.list();
    const artifacts = this.recentArtifacts(3);

    return [
      "Codebase status",
      "───────────────",
      `dataDir:      ${this.paths.root}`,
      `provider:     ${this.config.provider}`,
      `verbose:      ${this.config.verbose ? "on" : "off"}`,
      `vehicles:     ${vehicles.length} (active: ${this.vehicles.getActiveId()?.slice(0, 8) ?? "none"})`,
      `skills:       ${allSkills.filter((s) => s.enabled).length} enabled / ${allSkills.length} total`,
      `memory:       ${facts.length} facts (${facts.filter((f) => f.pinned).length} pinned)`,
      `knowledge:    ${docs.length} docs`,
      `plans:        ${plans.length}`,
      `cache entries:${this.cache.size()}`,
      `recent:       ${artifacts.map((a) => `${a.kind}:${a.name}`).join(", ") || "none"}`,
      "",
      "Commands: /doctor · /backup · /rebuild · /due garage · /garage · /status",
    ].join("\n");
  }
}
