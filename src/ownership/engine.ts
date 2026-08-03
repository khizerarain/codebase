import type { TasteManager } from "../taste/taste.js";
import type { Vehicle, VehicleStore } from "../vehicles/vehicles.js";
import { computeMaintenanceItems } from "../workflows/maintenance.js";

export interface CostBreakdown {
  loggedPartsAndService: number;
  estimatedLaborShare: number;
  recordCount: number;
  recordsWithCost: number;
  costPerMile: number | null;
  milesTracked: number;
}

export interface ReliabilityInsight {
  knownIssueCount: number;
  serviceEventsPer10k: number | null;
  topIssues: string[];
  historyGapRisk: "low" | "medium" | "high";
  summary: string;
}

export interface PredictiveItem {
  item: string;
  reason: string;
  dueAtMiles?: number;
  status: "overdue" | "due_soon" | "upcoming";
}

export interface OwnershipHealth {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  maintenanceAdherence: number; // 0-1
  overdueCount: number;
  dueSoonCount: number;
  knownIssues: number;
  costTrend: "rising" | "stable" | "falling" | "unknown";
  bullets: string[];
}

export interface OwnershipSnapshot {
  vehicleId: string;
  label: string;
  mileage: number;
  cost: CostBreakdown;
  reliability: ReliabilityInsight;
  health: OwnershipHealth;
  predictions: PredictiveItem[];
  tasteNotes: string;
}

export interface GarageOwnershipOverview {
  vehicleCount: number;
  totalLoggedSpend: number;
  avgCostPerMile: number | null;
  snapshots: OwnershipSnapshot[];
  focus: string[];
}

/** Higher-level ownership intelligence from local history + schedule heuristics. */
export class OwnershipEngine {
  constructor(
    private readonly vehicles: VehicleStore,
    private readonly taste: TasteManager,
  ) {}

  analyzeVehicle(vehicle: Vehicle): OwnershipSnapshot {
    const cost = computeCosts(vehicle);
    const reliability = computeReliability(vehicle);
    const due = computeMaintenanceItems(vehicle, this.taste, 12000);
    const overdue = due.filter((i) => i.status === "overdue");
    const soon = due.filter((i) => i.status === "due_soon");
    const upcoming = due.filter(
      (i) =>
        i.status === "ok" &&
        i.dueAtMiles != null &&
        i.dueAtMiles <= vehicle.currentMileage + 12000,
    );

    const predictions: PredictiveItem[] = [
      ...overdue.map((i) => ({
        item: i.item,
        reason: `Overdue vs interval / history (${i.notes ?? "schedule heuristic"})`,
        dueAtMiles: i.dueAtMiles,
        status: "overdue" as const,
      })),
      ...soon.map((i) => ({
        item: i.item,
        reason: `Due soon based on mileage + service history match`,
        dueAtMiles: i.dueAtMiles,
        status: "due_soon" as const,
      })),
      ...upcoming.slice(0, 4).map((i) => ({
        item: i.item,
        reason: "Likely within next ~12k mi based on intervals and logged work",
        dueAtMiles: i.dueAtMiles,
        status: "upcoming" as const,
      })),
    ].slice(0, 10);

    const health = computeHealth(vehicle, cost, reliability, overdue.length, soon.length);
    const tasteNotes = tasteOwnershipNotes(this.taste);

    return {
      vehicleId: vehicle.id,
      label: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      mileage: vehicle.currentMileage,
      cost,
      reliability,
      health,
      predictions,
      tasteNotes,
    };
  }

  activeOrThrow(): OwnershipSnapshot {
    const v = this.vehicles.getActive();
    if (!v) throw new Error("No active vehicle. /vehicles add … or /vehicles switch <id>");
    return this.analyzeVehicle(v);
  }

  garageOverview(): GarageOwnershipOverview {
    const list = this.vehicles.list();
    const snapshots = list.map((v) => this.analyzeVehicle(v));
    const totalLoggedSpend = snapshots.reduce(
      (n, s) => n + s.cost.loggedPartsAndService,
      0,
    );
    const cpms = snapshots
      .map((s) => s.cost.costPerMile)
      .filter((n): n is number => n != null && Number.isFinite(n));
    const avgCostPerMile = cpms.length
      ? cpms.reduce((a, b) => a + b, 0) / cpms.length
      : null;

    const focus = [...snapshots]
      .sort((a, b) => a.health.score - b.health.score)
      .slice(0, 5)
      .map(
        (s) =>
          `${s.label}: health ${s.health.grade} (${s.health.score}) · $${s.cost.loggedPartsAndService.toFixed(0)} logged · ${s.health.overdueCount} overdue`,
      );

    return {
      vehicleCount: list.length,
      totalLoggedSpend,
      avgCostPerMile,
      snapshots,
      focus,
    };
  }

  formatVehicleReport(snap: OwnershipSnapshot): string {
    const c = snap.cost;
    const h = snap.health;
    return [
      `Ownership — ${snap.label}`,
      "─────────────────────────",
      `Mileage: ${snap.mileage.toLocaleString()} mi`,
      `Health:  ${h.grade} (${h.score}/100) · trend: ${h.costTrend}`,
      `Spend:   $${c.loggedPartsAndService.toFixed(0)} logged (${c.recordsWithCost}/${c.recordCount} records with cost)`,
      `$/mi:    ${c.costPerMile != null ? `$${c.costPerMile.toFixed(3)}` : "n/a (need costs + mileage span)"}`,
      `Labor≈:  $${c.estimatedLaborShare.toFixed(0)} (heuristic share of logged spend)`,
      "",
      "Health drivers:",
      ...h.bullets.map((b) => `• ${b}`),
      "",
      "Reliability:",
      `• ${snap.reliability.summary}`,
      `• Known issues: ${snap.reliability.knownIssueCount}`,
      `• History gap risk: ${snap.reliability.historyGapRisk}`,
      ...(snap.reliability.topIssues.length
        ? snap.reliability.topIssues.map((i) => `  – ${i}`)
        : []),
      "",
      "Likely coming due:",
      ...(snap.predictions.length
        ? snap.predictions.map(
            (p) =>
              `• [${p.status}] ${p.item}${p.dueAtMiles != null ? ` ~${p.dueAtMiles.toLocaleString()} mi` : ""} — ${p.reason}`,
          )
        : ["• Nothing flagged in the near horizon"]),
      "",
      "Taste context:",
      snap.tasteNotes,
      "",
      "Decision support only — not financial or mechanical advice.",
    ].join("\n");
  }

  formatGarageReport(overview: GarageOwnershipOverview): string {
    if (!overview.vehicleCount) return "Garage is empty.";
    return [
      "Garage ownership overview",
      "────────────────────────",
      `Vehicles: ${overview.vehicleCount}`,
      `Total logged spend: $${overview.totalLoggedSpend.toFixed(0)}`,
      `Avg cost/mi: ${overview.avgCostPerMile != null ? `$${overview.avgCostPerMile.toFixed(3)}` : "n/a"}`,
      "",
      "Focus (lowest health first):",
      ...overview.focus.map((f) => `• ${f}`),
      "",
      "Per vehicle:",
      ...overview.snapshots.map(
        (s) =>
          `• ${s.label}: ${s.health.grade}/${s.health.score} · $${s.cost.loggedPartsAndService.toFixed(0)} · ${s.health.overdueCount} overdue · ${s.reliability.knownIssueCount} issues`,
      ),
      "",
      "Tip: /ownership · /health · /report ownership · /report garage",
    ].join("\n");
  }

  formatHealthSnapshot(garage = false): string {
    if (garage) return this.formatGarageReport(this.garageOverview());
    return this.formatVehicleReport(this.activeOrThrow());
  }
}

function computeCosts(v: Vehicle): CostBreakdown {
  const records = v.serviceHistory;
  const withCost = records.filter((r) => r.cost != null && r.cost > 0);
  const logged = withCost.reduce((n, r) => n + (r.cost ?? 0), 0);
  // Rough: DIY logs skew parts-heavy; shop logs include labor — estimate 35% labor when shop
  let labor = 0;
  for (const r of withCost) {
    if (r.diy === false) labor += (r.cost ?? 0) * 0.45;
    else if (r.diy === true) labor += (r.cost ?? 0) * 0.05;
    else labor += (r.cost ?? 0) * 0.25;
  }

  const miles = records.map((r) => r.mileage).filter((m) => m > 0);
  const minMi = miles.length ? Math.min(...miles) : v.currentMileage;
  const maxMi = Math.max(v.currentMileage, miles.length ? Math.max(...miles) : 0);
  const span = Math.max(0, maxMi - minMi);
  const costPerMile =
    logged > 0 && span >= 500 ? logged / span : logged > 0 && v.currentMileage > 0
      ? logged / Math.max(v.currentMileage, 1)
      : null;

  return {
    loggedPartsAndService: logged,
    estimatedLaborShare: labor,
    recordCount: records.length,
    recordsWithCost: withCost.length,
    costPerMile,
    milesTracked: span,
  };
}

function computeReliability(v: Vehicle): ReliabilityInsight {
  const knownIssueCount = v.knownIssues.length;
  const events = v.serviceHistory.length;
  const serviceEventsPer10k =
    v.currentMileage >= 5000 ? (events / v.currentMileage) * 10000 : null;

  const topIssues = v.knownIssues.slice(0, 5);
  let historyGapRisk: ReliabilityInsight["historyGapRisk"] = "low";
  if (events === 0 && v.currentMileage > 30000) historyGapRisk = "high";
  else if (events < 3 && v.currentMileage > 60000) historyGapRisk = "medium";
  else if (knownIssueCount >= 4) historyGapRisk = "medium";

  const summary =
    knownIssueCount === 0 && events > 0
      ? "No known issues logged; service history present."
      : knownIssueCount > 0
        ? `${knownIssueCount} known issue(s) on file — watch recurrence.`
        : "Sparse history — treat reliability estimates cautiously.";

  return {
    knownIssueCount,
    serviceEventsPer10k,
    topIssues,
    historyGapRisk,
    summary,
  };
}

function computeHealth(
  v: Vehicle,
  cost: CostBreakdown,
  reliability: ReliabilityInsight,
  overdue: number,
  soon: number,
): OwnershipHealth {
  let score = 85;
  score -= overdue * 12;
  score -= soon * 4;
  score -= reliability.knownIssueCount * 5;
  if (reliability.historyGapRisk === "high") score -= 15;
  if (reliability.historyGapRisk === "medium") score -= 8;
  if (cost.recordCount === 0) score -= 10;
  if (v.currentMileage > 150000) score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  const adherence = Math.max(
    0,
    Math.min(1, 1 - overdue * 0.2 - (reliability.historyGapRisk === "high" ? 0.3 : 0)),
  );

  const costTrend = detectCostTrend(v);

  const bullets = [
    `Maintenance adherence ~${Math.round(adherence * 100)}% (heuristic from overdue/gaps)`,
    `${overdue} overdue · ${soon} due soon`,
    `${reliability.knownIssueCount} known issues · history gap ${reliability.historyGapRisk}`,
    costTrend === "unknown"
      ? "Cost trend unknown (need more dated cost logs)"
      : `Cost trend: ${costTrend}`,
  ];

  return {
    score,
    grade,
    maintenanceAdherence: adherence,
    overdueCount: overdue,
    dueSoonCount: soon,
    knownIssues: reliability.knownIssueCount,
    costTrend,
    bullets,
  };
}

function detectCostTrend(v: Vehicle): OwnershipHealth["costTrend"] {
  const priced = [...v.serviceHistory]
    .filter((r) => r.cost != null && r.cost > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (priced.length < 4) return "unknown";
  const mid = Math.floor(priced.length / 2);
  const first = priced.slice(0, mid);
  const second = priced.slice(mid);
  const avg = (rows: typeof priced) =>
    rows.reduce((n, r) => n + (r.cost ?? 0), 0) / rows.length;
  const a = avg(first);
  const b = avg(second);
  if (b > a * 1.25) return "rising";
  if (b < a * 0.8) return "falling";
  return "stable";
}

function tasteOwnershipNotes(taste: TasteManager): string {
  const t = taste.compactTasteSummary().toLowerCase();
  const bits: string[] = [];
  if (/budget|cheap|value/.test(t)) {
    bits.push("Budget bias — flag high spend/mi and prefer deferrable non-safety work.");
  }
  if (/oem|reliability|quality/.test(t)) {
    bits.push("Reliability/OEM bias — prioritize overdue safety & OEM-path items.");
  }
  if (/diy/.test(t)) {
    bits.push("DIY lean — cost/mi may understate shop labor if you self-wrench.");
  }
  if (/shop|dealer|professional/.test(t)) {
    bits.push("Shop lean — expect higher labor share in ownership cost.");
  }
  if (!bits.length) bits.push("No strong budget/reliability bias detected in compact taste.");
  return bits.map((b) => `• ${b}`).join("\n");
}
