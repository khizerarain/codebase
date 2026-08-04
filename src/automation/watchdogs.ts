import { v4 as uuidv4 } from "uuid";
import type { KnowledgeBase } from "../knowledge/knowledge.js";
import type { ObdManager } from "../obd/manager.js";
import { OwnershipEngine } from "../ownership/engine.js";
import type { TasteManager } from "../taste/taste.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { computeMaintenanceItems } from "../workflows/maintenance.js";
import type {
  AutomationAlert,
  WatchdogDefinition,
  WatchdogRunContext,
} from "./types.js";

export interface WatchdogDeps {
  vehicles: VehicleStore;
  taste: TasteManager;
  obd?: ObdManager;
  knowledge?: KnowledgeBase;
}

export interface Watchdog {
  def: WatchdogDefinition;
  run(deps: WatchdogDeps, ctx: WatchdogRunContext): Promise<AutomationAlert[]>;
}

function alert(
  partial: Omit<AutomationAlert, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): AutomationAlert {
  return {
    id: partial.id ?? uuidv4(),
    createdAt: partial.createdAt ?? new Date().toISOString(),
    watchdogId: partial.watchdogId,
    severity: partial.severity,
    title: partial.title,
    reason: partial.reason,
    vehicleId: partial.vehicleId,
    vehicleLabel: partial.vehicleLabel,
    suggestedCommands: partial.suggestedCommands ?? [],
    fingerprint: partial.fingerprint,
  };
}

function label(v: { year: number; make: string; model: string }): string {
  return `${v.year} ${v.make} ${v.model}`;
}

export const WATCHDOG_CATALOG: Watchdog[] = [
  {
    def: {
      id: "overdue_maintenance",
      name: "Overdue maintenance",
      description: "Flags overdue interval items from schedule + service history",
      defaultEnabled: true,
    },
    async run(deps) {
      const out: AutomationAlert[] = [];
      for (const v of deps.vehicles.list()) {
        const overdue = computeMaintenanceItems(v, deps.taste, 12000).filter(
          (i) => i.status === "overdue",
        );
        if (!overdue.length) continue;
        const items = overdue
          .slice(0, 3)
          .map((i) => i.item)
          .join(", ");
        out.push(
          alert({
            watchdogId: "overdue_maintenance",
            severity: overdue.length >= 2 ? "urgent" : "watch",
            title: `${label(v)}: ${overdue.length} overdue item(s)`,
            reason: `Schedule/history heuristics mark overdue: ${items}. Taste still shapes DIY vs shop follow-up.`,
            vehicleId: v.id,
            vehicleLabel: label(v),
            fingerprint: `overdue:${v.id}:${overdue.map((i) => i.item).sort().join("|")}`,
            suggestedCommands: [
              `/vehicles switch ${v.id.slice(0, 8)}`,
              "/due",
              `/service ${overdue[0]!.item}`,
            ],
          }),
        );
      }
      return out;
    },
  },
  {
    def: {
      id: "service_due_soon",
      name: "Service due soon",
      description: "Near-horizon due-soon items (quieter than overdue)",
      defaultEnabled: true,
    },
    async run(deps) {
      const out: AutomationAlert[] = [];
      for (const v of deps.vehicles.list()) {
        const soon = computeMaintenanceItems(v, deps.taste, 8000).filter(
          (i) => i.status === "due_soon",
        );
        if (!soon.length) continue;
        out.push(
          alert({
            watchdogId: "service_due_soon",
            severity: "info",
            title: `${label(v)}: ${soon.length} item(s) due soon`,
            reason: `Within ~8k mi horizon: ${soon
              .slice(0, 3)
              .map((i) => i.item)
              .join(", ")}`,
            vehicleId: v.id,
            vehicleLabel: label(v),
            fingerprint: `soon:${v.id}:${soon.map((i) => i.item).sort().join("|")}`,
            suggestedCommands: ["/due", `/prep ${soon[0]!.item}`],
          }),
        );
      }
      return out;
    },
  },
  {
    def: {
      id: "repeated_dtc",
      name: "Repeated DTCs",
      description: "Local OBD history shows the same code more than once",
      defaultEnabled: true,
    },
    async run(deps) {
      if (!deps.obd) return [];
      const out: AutomationAlert[] = [];
      const vehicleIds = new Set([
        ...deps.vehicles.list().map((v) => v.id),
        undefined as unknown as string,
      ]);
      for (const v of deps.vehicles.list()) {
        const notes = deps.obd.store.trendNotes(v.id);
        for (const note of notes.filter((n) => /Repeated DTC/i.test(n))) {
          const code = note.match(/DTC\s+(\w+)/i)?.[1] ?? "code";
          out.push(
            alert({
              watchdogId: "repeated_dtc",
              severity: "watch",
              title: `${label(v)}: repeating ${code}`,
              reason: `${note}. Recurring codes deserve structured diagnosis before parts.`,
              vehicleId: v.id,
              vehicleLabel: label(v),
              fingerprint: `dtc-repeat:${v.id}:${code}`,
              suggestedCommands: [
                `/vehicles switch ${v.id.slice(0, 8)}`,
                `/diagnose ${code} check engine`,
                "/obd dtc",
              ],
            }),
          );
        }
      }
      // Garage-wide notes without vehicle
      void vehicleIds;
      const global = deps.obd.store.trendNotes();
      for (const note of global.filter((n) => /Repeated DTC/i.test(n))) {
        const code = note.match(/DTC\s+(\w+)/i)?.[1] ?? "code";
        if (out.some((a) => a.fingerprint.includes(code))) continue;
        out.push(
          alert({
            watchdogId: "repeated_dtc",
            severity: "info",
            title: `Garage: repeating ${code}`,
            reason: note,
            fingerprint: `dtc-repeat:garage:${code}`,
            suggestedCommands: ["/obd dtc", "/obd trends", `/diagnose ${code}`],
          }),
        );
      }
      return out;
    },
  },
  {
    def: {
      id: "live_range_anomaly",
      name: "Live data range anomaly",
      description: "When OBD is connected, flag out-of-range live values",
      defaultEnabled: true,
    },
    async run(deps) {
      if (!deps.obd?.isConnected()) return [];
      const live = await deps.obd.liveContext();
      if (!live.connected || !live.rangeNotes.length) return [];
      const bad = live.rangeNotes.filter((n) => n.startsWith("⚠") || n.startsWith("!"));
      if (!bad.length) return [];
      const active = deps.vehicles.getActive();
      return [
        alert({
          watchdogId: "live_range_anomaly",
          severity: bad.some((n) => n.startsWith("⚠")) ? "urgent" : "watch",
          title: active
            ? `${label(active)}: live value(s) need a look`
            : "Live OBD values need a look",
          reason: bad.slice(0, 3).join(" · ") + " (assistive ranges, not OEM specs)",
          vehicleId: active?.id,
          vehicleLabel: active ? label(active) : undefined,
          fingerprint: `live:${active?.id ?? "none"}:${bad.map((b) => b.slice(0, 40)).join("|")}`,
          suggestedCommands: [
            "/obd status",
            "/obd snapshot",
            "/diagnose live data anomaly",
          ],
        }),
      ];
    },
  },
  {
    def: {
      id: "known_issues",
      name: "Known issues on file",
      description: "Surfaces vehicles with logged known issues",
      defaultEnabled: false,
    },
    async run(deps) {
      return deps.vehicles
        .list()
        .filter((v) => v.knownIssues.length > 0)
        .map((v) =>
          alert({
            watchdogId: "known_issues",
            severity: v.knownIssues.length >= 3 ? "watch" : "info",
            title: `${label(v)}: ${v.knownIssues.length} known issue(s)`,
            reason: `On file: ${v.knownIssues.slice(0, 3).join("; ")}`,
            vehicleId: v.id,
            vehicleLabel: label(v),
            fingerprint: `issues:${v.id}:${v.knownIssues.join("|").slice(0, 120)}`,
            suggestedCommands: [
              `/vehicles switch ${v.id.slice(0, 8)}`,
              "/active",
              `/diagnose ${v.knownIssues[0]}`,
            ],
          }),
        );
    },
  },
  {
    def: {
      id: "garage_attention",
      name: "Garage needs attention",
      description: "Garage-wide ownership health / overdue rollup",
      defaultEnabled: true,
    },
    async run(deps) {
      const list = deps.vehicles.list();
      if (list.length < 2) return [];
      const ownership = new OwnershipEngine(deps.vehicles, deps.taste);
      const overview = ownership.garageOverview();
      const weak = overview.snapshots.filter(
        (s) => s.health.score < 70 || s.health.overdueCount > 0,
      );
      if (!weak.length) return [];
      return [
        alert({
          watchdogId: "garage_attention",
          severity: weak.some((s) => s.health.overdueCount > 0) ? "watch" : "info",
          title: `${weak.length} of ${list.length} vehicles need attention`,
          reason: weak
            .slice(0, 3)
            .map(
              (s) =>
                `${s.label}: health ${s.health.grade}/${s.health.score}, ${s.health.overdueCount} overdue`,
            )
            .join(" · "),
          fingerprint: `garage-attn:${weak
            .map((s) => `${s.vehicleId}:${s.health.score}:${s.health.overdueCount}`)
            .sort()
            .join(",")}`,
          suggestedCommands: [
            "/attention",
            "/due garage",
            "/ownership garage",
            "/health garage",
          ],
        }),
      ];
    },
  },
  {
    def: {
      id: "taste_service_sooner",
      name: "Taste: service sooner",
      description: "If taste leans reliability/OEM, nudge due-soon items earlier",
      defaultEnabled: true,
    },
    async run(deps) {
      const taste = deps.taste.compactTasteSummary().toLowerCase();
      if (!/oem|reliability|quality|prevent/.test(taste)) return [];
      const out: AutomationAlert[] = [];
      for (const v of deps.vehicles.list()) {
        const soon = computeMaintenanceItems(v, deps.taste, 10000).filter(
          (i) => i.status === "due_soon" || i.status === "overdue",
        );
        if (!soon.length) continue;
        out.push(
          alert({
            watchdogId: "taste_service_sooner",
            severity: "info",
            title: `${label(v)}: taste says don’t defer`,
            reason: `Your taste leans reliability/OEM-quality. Items in play: ${soon
              .slice(0, 2)
              .map((i) => i.item)
              .join(", ")}. Suggestion only — not a mandate.`,
            vehicleId: v.id,
            vehicleLabel: label(v),
            fingerprint: `taste-sooner:${v.id}:${soon.map((i) => i.item).sort().join("|")}`,
            suggestedCommands: [
              `/service ${soon[0]!.item}`,
              "/due",
              "/taste",
            ],
          }),
        );
      }
      return out;
    },
  },
  {
    def: {
      id: "local_knowledge_flags",
      name: "Local knowledge attention",
      description: "If your knowledge base mentions recall/TSB near active vehicle topics",
      defaultEnabled: false,
    },
    async run(deps) {
      if (!deps.knowledge) return [];
      const active = deps.vehicles.getActive();
      if (!active) return [];
      const q = `${active.make} ${active.model} recall TSB`;
      const hit = deps.knowledge.search(q, {
        vehicleIds: [active.id],
        limit: 2,
      });
      if (!/USER DOCUMENT/.test(hit) || /No matches|empty/i.test(hit)) return [];
      if (!/recall|tsb|bulletin/i.test(hit)) return [];
      return [
        alert({
          watchdogId: "local_knowledge_flags",
          severity: "info",
          title: `${label(active)}: local docs mention recall/TSB`,
          reason:
            "A hit in YOUR knowledge base matched recall/TSB language. Verify the document — this is not a live OEM recall feed.",
          vehicleId: active.id,
          vehicleLabel: label(active),
          fingerprint: `knowledge-flag:${active.id}:${hit.slice(0, 80)}`,
          suggestedCommands: [
            `/knowledge search recall ${active.model}`,
            "/active",
          ],
        }),
      ];
    },
  },
];

export function getWatchdog(id: string): Watchdog | undefined {
  return WATCHDOG_CATALOG.find(
    (w) => w.def.id === id || w.def.id.startsWith(id) || w.def.name.toLowerCase() === id.toLowerCase(),
  );
}
