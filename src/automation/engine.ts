import type { Config } from "../config/config.js";
import type { DataPaths } from "../config/config.js";
import type { KnowledgeBase } from "../knowledge/knowledge.js";
import type { ObdManager } from "../obd/manager.js";
import type { TasteManager } from "../taste/taste.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { AutomationStore } from "./store.js";
import type { AutomationAlert, WatchdogDefinition } from "./types.js";
import { getWatchdog, WATCHDOG_CATALOG, type WatchdogDeps } from "./watchdogs.js";

export type Assertiveness = "quiet" | "normal" | "assertive";

const SEVERITY_RANK = { urgent: 3, watch: 2, info: 1 } as const;

/**
 * Local watchdog runner — on-demand / session-start only.
 * No always-on daemon, no network.
 */
export class WatchdogEngine {
  readonly store: AutomationStore;

  constructor(
    paths: DataPaths,
    private readonly config: Config,
    private readonly vehicles: VehicleStore,
    private readonly taste: TasteManager,
    private readonly obd?: ObdManager,
    private readonly knowledge?: KnowledgeBase,
  ) {
    this.store = new AutomationStore(paths);
  }

  private deps(): WatchdogDeps {
    return {
      vehicles: this.vehicles,
      taste: this.taste,
      obd: this.obd,
      knowledge: this.knowledge,
    };
  }

  listDefinitions(): WatchdogDefinition[] {
    return WATCHDOG_CATALOG.map((w) => w.def);
  }

  isEnabled(id: string): boolean {
    const w = getWatchdog(id);
    if (!w) return false;
    return this.store.isEnabled(w.def.id, w.def.defaultEnabled);
  }

  enable(id: string): WatchdogDefinition {
    const w = getWatchdog(id);
    if (!w) throw new Error(`Unknown watchdog: ${id}`);
    this.store.setEnabled(w.def.id, true);
    return w.def;
  }

  disable(id: string): WatchdogDefinition {
    const w = getWatchdog(id);
    if (!w) throw new Error(`Unknown watchdog: ${id}`);
    this.store.setEnabled(w.def.id, false);
    return w.def;
  }

  /** Run enabled watchdogs; filter dismissals; persist history. */
  async run(opts: { includeDisabled?: boolean; ids?: string[] } = {}): Promise<AutomationAlert[]> {
    const deps = this.deps();
    const ctx = { now: new Date() };
    const selected = WATCHDOG_CATALOG.filter((w) => {
      if (opts.ids?.length) {
        return opts.ids.some(
          (id) => w.def.id === id || w.def.id.startsWith(id),
        );
      }
      if (opts.includeDisabled) return true;
      return this.store.isEnabled(w.def.id, w.def.defaultEnabled);
    });

    const raw: AutomationAlert[] = [];
    for (const w of selected) {
      try {
        const alerts = await w.run(deps, ctx);
        raw.push(...alerts);
        this.store.markRun(w.def.id);
      } catch {
        // keep other watchdogs running
      }
    }

    const filtered = raw.filter((a) => !this.store.isDismissed(a.fingerprint));
    filtered.sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    );
    this.store.recordAlerts(filtered);
    return filtered;
  }

  assertiveness(): Assertiveness {
    const a = this.config.automation?.assertiveness ?? "quiet";
    if (a === "normal" || a === "assertive") return a;
    return "quiet";
  }

  maxAlerts(): number {
    const configured = this.config.automation?.maxBriefingAlerts;
    if (configured && configured > 0) return configured;
    switch (this.assertiveness()) {
      case "assertive":
        return 8;
      case "normal":
        return 5;
      default:
        return 3;
    }
  }

  /** High-signal subset for session start / garage / status. */
  async briefing(): Promise<AutomationAlert[]> {
    const alerts = await this.run();
    const max = this.maxAlerts();
    if (this.assertiveness() === "quiet") {
      // Prefer urgent/watch; allow one info if nothing stronger
      const strong = alerts.filter((a) => a.severity !== "info");
      if (strong.length) return strong.slice(0, max);
      return alerts.slice(0, Math.min(1, max));
    }
    if (this.assertiveness() === "normal") {
      return alerts
        .filter((a) => a.severity !== "info" || alerts.length <= 2)
        .slice(0, max);
    }
    return alerts.slice(0, max);
  }

  dismiss(fingerprintOrId: string, days?: number): boolean {
    const history = this.store.history(40);
    const hit =
      history.find(
        (a) =>
          a.id.startsWith(fingerprintOrId) ||
          a.fingerprint === fingerprintOrId ||
          a.fingerprint.startsWith(fingerprintOrId),
      ) ?? null;
    const fp = hit?.fingerprint ?? fingerprintOrId;
    this.store.dismiss(fp, days);
    return true;
  }
}
