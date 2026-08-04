import { generateMaintenanceSchedule } from "../agent/tools.js";
import type { DataPaths } from "../config/config.js";
import { OwnershipEngine } from "../ownership/engine.js";
import type { TasteManager } from "../taste/taste.js";
import type { Vehicle, VehicleStore } from "../vehicles/vehicles.js";

/** Garage-level multi-vehicle intelligence. */
export class GarageService {
  constructor(
    private readonly vehicles: VehicleStore,
    private readonly taste: TasteManager,
    private readonly paths: DataPaths,
  ) {}

  overview(): string {
    const list = this.vehicles.list();
    const activeId = this.vehicles.getActiveId();
    if (!list.length) {
      return "Garage is empty. Add a vehicle with /vehicles add <year> <make> <model> [mileage] [fuel]";
    }

    const lines = [
      `Garage — ${list.length} vehicle${list.length === 1 ? "" : "s"}`,
      "",
      this.vehicles.formatList(activeId),
      "",
      "Commands: /vehicles switch <id> · /compare <idA> <idB> · /insights · /watchdogs · /history",
    ];
    return lines.join("\n");
  }

  compare(idA: string, idB: string): string {
    const a = this.vehicles.get(idA);
    const b = this.vehicles.get(idB);
    if (!a || !b) {
      throw new Error("Need two valid vehicle ids. Use /garage to list them.");
    }

    const rows: Array<[string, string, string]> = [
      ["Vehicle", label(a), label(b)],
      ["Mileage", `${a.currentMileage.toLocaleString()} mi`, `${b.currentMileage.toLocaleString()} mi`],
      ["Fuel", a.fuelType, b.fuelType],
      ["Engine", a.engine ?? "-", b.engine ?? "-"],
      ["Trim", a.trim ?? "-", b.trim ?? "-"],
      ["Mods", String(a.modifications.length), String(b.modifications.length)],
      ["Known issues", String(a.knownIssues.length), String(b.knownIssues.length)],
      ["Service records", String(a.serviceHistory.length), String(b.serviceHistory.length)],
    ];

    const header =
      pad("", 16) + pad(a.model.slice(0, 14), 16) + pad(b.model.slice(0, 14), 16);
    const body = rows
      .map(([k, x, y]) => pad(k, 16) + pad(x.slice(0, 14), 16) + pad(y.slice(0, 14), 16))
      .join("\n");

    const notes = [
      "",
      "Notes:",
      `- Older / higher-mileage: ${a.currentMileage >= b.currentMileage ? label(a) : label(b)}`,
      `- More known issues: ${a.knownIssues.length >= b.knownIssues.length ? label(a) : label(b)}`,
      a.fuelType !== b.fuelType
        ? `- Different fuel types (${a.fuelType} vs ${b.fuelType}) — maintenance playbooks differ`
        : "- Same fuel type — schedules are more comparable",
    ];

    return ["Vehicle comparison", "", header, "-".repeat(48), body, ...notes].join("\n");
  }

  compareApproaches(topic: string): string {
    const taste = this.taste.compactTasteSummary();
    return [
      `Approach comparison — ${topic}`,
      "",
      "Suggestion (options, not a verdict):",
      "1. DIY path — lower cash cost, needs tools/time/skill; follow safety layer for high-risk systems",
      "2. Independent shop — balanced cost/expertise",
      "3. Dealer — highest cost, strongest OEM parts/procedure path",
      "",
      "Taste context:",
      taste,
      "",
      "Action:",
      "- Pick the path that matches your DIY comfort and the risk level of the job",
      "- For brakes/steering/airbags/EV HV, prefer professional inspection when unsure",
    ].join("\n");
  }

  insights(): string {
    const list = this.vehicles.list();
    if (!list.length) return "No vehicles in the garage yet.";

    const ownership = new OwnershipEngine(this.vehicles, this.taste);
    const overview = ownership.garageOverview();

    const ctx = {
      vehicles: this.vehicles,
      taste: this.taste,
      paths: this.paths,
    };

    const upcoming: string[] = [];
    let roughCostLow = 0;
    let roughCostHigh = 0;
    const issueMap = new Map<string, number>();

    for (const v of list) {
      const schedule = generateMaintenanceSchedule(ctx, v.id, 10000);
      const due = [...schedule.matchAll(/^(.*?)\s{2,}.*\b(due_soon|overdue)\b/gim)];
      for (const m of due.slice(0, 4)) {
        const item = (m[1] ?? "").trim();
        const status = m[2] ?? "";
        if (item) upcoming.push(`• ${label(v)} — ${item} (${status})`);
      }
      const dueCount = due.length;
      roughCostLow += dueCount * 40;
      roughCostHigh += dueCount * 220;

      for (const issue of v.knownIssues) {
        const key = issue.toLowerCase().slice(0, 60);
        issueMap.set(key, (issueMap.get(key) ?? 0) + 1);
      }
    }

    const commonIssues = [...issueMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => `• ${k} (×${n})`);

    const historyTotal = list.reduce((n, v) => n + v.serviceHistory.length, 0);

    return [
      "Garage insights",
      "───────────────",
      `Vehicles: ${list.length}`,
      `Service records logged: ${historyTotal}`,
      `Recorded spend (from history): $${overview.totalLoggedSpend.toFixed(0)}`,
      `Avg cost/mi: ${overview.avgCostPerMile != null ? `$${overview.avgCostPerMile.toFixed(3)}` : "n/a"}`,
      "",
      "Ownership health focus:",
      ...overview.focus.map((f) => `• ${f}`),
      "",
      "Upcoming / attention items (next ~10k mi horizon):",
      ...(upcoming.length ? upcoming.slice(0, 12) : ["• None flagged from local schedule heuristics"]),
      "",
      `Rough near-term parts+labor band (very approximate): $${roughCostLow}–$${roughCostHigh}`,
      "",
      "Common known issues across garage:",
      ...(commonIssues.length ? commonIssues : ["• None logged yet"]),
      "",
      "Tip: /ownership garage · /health garage · /report garage · /due garage",
    ].join("\n");
  }

  historyAcrossGarage(): string {
    const list = this.vehicles.list();
    if (!list.length) return "No vehicles.";
    const blocks = list.map((v) => this.vehicles.formatHistory(v));
    return blocks.join("\n\n");
  }
}

function label(v: Vehicle): string {
  return `${v.year} ${v.make} ${v.model}`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + "…" : s + " ".repeat(n - s.length);
}
