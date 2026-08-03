import type { Vehicle } from "../vehicles/vehicles.js";
import { withSafetyFooter } from "./safety.js";

export interface MaintenanceItem {
  item: string;
  intervalMiles?: number;
  intervalMonths?: number;
  dueAtMiles?: number;
  status: "ok" | "due_soon" | "overdue" | "unknown";
  notes?: string;
}

export interface CostLine {
  name: string;
  partsLow: number;
  partsHigh: number;
  laborHours?: number;
  laborRate?: number;
  notes?: string;
}

export interface DiagnosticResult {
  symptoms: string[];
  possibleCauses: Array<{ cause: string; likelihood: "low" | "medium" | "high"; checks: string[] }>;
  recommendedActions: string[];
  seeProfessional: boolean;
}

export interface PartsComparison {
  title: string;
  options: Array<{
    label: string;
    type: "oem" | "aftermarket" | "budget" | "performance";
    pros: string[];
    cons: string[];
    estCost?: string;
    tasteFit?: string;
  }>;
  recommendation: string;
}

export function formatMaintenanceTable(
  vehicle: Vehicle,
  items: MaintenanceItem[],
): string {
  const header = [
    `Maintenance schedule — ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    `Current mileage: ${vehicle.currentMileage.toLocaleString()} mi`,
    "",
    pad("Item", 28) + pad("Interval", 16) + pad("Due", 12) + "Status",
    "-".repeat(70),
  ];
  const rows = items.map((it) => {
    const interval =
      it.intervalMiles != null
        ? `${it.intervalMiles.toLocaleString()} mi`
        : it.intervalMonths != null
          ? `${it.intervalMonths} mo`
          : "-";
    const due =
      it.dueAtMiles != null ? it.dueAtMiles.toLocaleString() : "-";
    return (
      pad(it.item, 28) +
      pad(interval, 16) +
      pad(due, 12) +
      it.status +
      (it.notes ? ` · ${it.notes}` : "")
    );
  });
  return withSafetyFooter([...header, ...rows].join("\n"));
}

export function formatCostBreakdown(title: string, lines: CostLine[], laborRate = 140): string {
  let partsLow = 0;
  let partsHigh = 0;
  let labor = 0;
  const rows = lines.map((l) => {
    const rate = l.laborRate ?? laborRate;
    const laborCost = (l.laborHours ?? 0) * rate;
    partsLow += l.partsLow;
    partsHigh += l.partsHigh;
    labor += laborCost;
    return `- ${l.name}: parts $${l.partsLow.toFixed(0)}–$${l.partsHigh.toFixed(0)}${
      l.laborHours ? ` · labor ~${l.laborHours}h ($${laborCost.toFixed(0)})` : ""
    }${l.notes ? ` · ${l.notes}` : ""}`;
  });

  return withSafetyFooter(
    [
      `Cost estimate — ${title}`,
      "(Rough ranges only — local prices vary.)",
      "",
      ...rows,
      "",
      `Parts total: $${partsLow.toFixed(0)}–$${partsHigh.toFixed(0)}`,
      `Labor total (est.): $${labor.toFixed(0)}`,
      `Grand total (est.): $${(partsLow + labor).toFixed(0)}–$${(partsHigh + labor).toFixed(0)}`,
    ].join("\n"),
  );
}

export function formatDiagnostic(result: DiagnosticResult): string {
  const lines = [
    "Diagnostic reasoning (suggestions, not a diagnosis)",
    "",
    "Symptoms:",
    ...result.symptoms.map((s) => `- ${s}`),
    "",
    "Possible causes:",
    ...result.possibleCauses.map(
      (c) =>
        `- [${c.likelihood}] ${c.cause}\n  checks: ${c.checks.join("; ")}`,
    ),
    "",
    "Recommended actions:",
    ...result.recommendedActions.map((a, i) => `${i + 1}. ${a}`),
  ];
  if (result.seeProfessional) {
    lines.push(
      "",
      "Suggestion: Have a qualified technician inspect before driving if symptoms affect braking, steering, or powertrain safety.",
    );
  }
  return withSafetyFooter(lines.join("\n"));
}

export function formatChecklist(title: string, steps: string[]): string {
  return withSafetyFooter(
    [
      `# ${title}`,
      "",
      ...steps.map((s, i) => `${i + 1}. [ ] ${s}`),
      "",
      "Instruction vs suggestion: only perform steps you are trained/equipped for.",
    ].join("\n"),
  );
}

export function formatPartsComparison(cmp: PartsComparison): string {
  const blocks = cmp.options.map((o) =>
    [
      `### ${o.label} (${o.type})`,
      o.estCost ? `Est. cost: ${o.estCost}` : null,
      o.tasteFit ? `Taste fit: ${o.tasteFit}` : null,
      `Pros: ${o.pros.join("; ") || "-"}`,
      `Cons: ${o.cons.join("; ") || "-"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return withSafetyFooter(
    [`Parts comparison — ${cmp.title}`, "", ...blocks, "", `Recommendation: ${cmp.recommendation}`].join(
      "\n",
    ),
  );
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + "…" : s + " ".repeat(n - s.length);
}
