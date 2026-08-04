import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DataPaths } from "../config/config.js";
import {
  WatchdogStateSchema,
  type AutomationAlert,
  type Dismissal,
  type WatchdogState,
} from "./types.js";

const MAX_HISTORY = 80;

/** Persist watchdog toggles, dismissals, and alert history locally. */
export class AutomationStore {
  private readonly file: string;

  constructor(paths: DataPaths) {
    mkdirSync(paths.automation, { recursive: true });
    this.file = join(paths.automation, "state.json");
  }

  load(): WatchdogState {
    if (!existsSync(this.file)) {
      return WatchdogStateSchema.parse({});
    }
    try {
      return WatchdogStateSchema.parse(
        JSON.parse(readFileSync(this.file, "utf8")) as unknown,
      );
    } catch {
      return WatchdogStateSchema.parse({});
    }
  }

  save(state: WatchdogState): void {
    writeFileSync(
      this.file,
      JSON.stringify(WatchdogStateSchema.parse(state), null, 2),
      "utf8",
    );
  }

  isEnabled(id: string, defaultEnabled: boolean): boolean {
    const state = this.load();
    if (id in state.enabled) return Boolean(state.enabled[id]);
    return defaultEnabled;
  }

  setEnabled(id: string, enabled: boolean): void {
    const state = this.load();
    state.enabled[id] = enabled;
    this.save(state);
  }

  markRun(id: string, at = new Date().toISOString()): void {
    const state = this.load();
    state.lastRunAt[id] = at;
    this.save(state);
  }

  isDismissed(fingerprint: string, now = new Date()): boolean {
    const state = this.load();
    const d = state.dismissals.find((x) => x.fingerprint === fingerprint);
    if (!d) return false;
    if (!d.until) return true;
    return Date.parse(d.until) > now.getTime();
  }

  dismiss(fingerprint: string, days?: number): Dismissal {
    const state = this.load();
    state.dismissals = state.dismissals.filter((d) => d.fingerprint !== fingerprint);
    const entry: Dismissal = {
      fingerprint,
      dismissedAt: new Date().toISOString(),
      ...(days != null
        ? { until: new Date(Date.now() + days * 86400000).toISOString() }
        : {}),
    };
    state.dismissals.push(entry);
    this.save(state);
    return entry;
  }

  clearDismissals(): number {
    const state = this.load();
    const n = state.dismissals.length;
    state.dismissals = [];
    this.save(state);
    return n;
  }

  recordAlerts(alerts: AutomationAlert[]): void {
    if (!alerts.length) return;
    const state = this.load();
    state.alertHistory = [...alerts, ...state.alertHistory].slice(0, MAX_HISTORY);
    this.save(state);
  }

  history(limit = 20): AutomationAlert[] {
    return this.load().alertHistory.slice(0, limit);
  }
}
