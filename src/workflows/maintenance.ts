import type { MaintenanceItem } from "../agent/outputs.js";
import type { TasteManager } from "../taste/taste.js";
import type { Vehicle } from "../vehicles/vehicles.js";

export interface IntervalDef {
  item: string;
  intervalMiles: number;
  notes?: string;
  safetyCritical?: boolean;
}

/** Shared maintenance interval table used by /schedule and /due. */
export function buildIntervalDefs(
  vehicle: Vehicle,
  taste: TasteManager,
): IntervalDef[] {
  const t = taste.compactTasteSummary().toLowerCase();
  const diy = /diy/.test(t);
  const preventive = /preventive|preventative/.test(t);

  return [
    {
      item: "Engine oil & filter",
      intervalMiles: preventive ? 5000 : 7500,
      notes: diy ? "DIY-friendly" : "Shop ok",
    },
    {
      item: "Cabin air filter",
      intervalMiles: 15000,
      notes: "Inspect sooner if dusty",
    },
    { item: "Engine air filter", intervalMiles: 20000 },
    {
      item: "Brake fluid",
      intervalMiles: 30000,
      notes: "Or ~2–3 years",
      safetyCritical: true,
    },
    {
      item: "Coolant",
      intervalMiles: vehicle.fuelType === "ev" ? 60000 : 50000,
    },
    {
      item: "Transmission service",
      intervalMiles: 60000,
      notes: "Confirm OEM interval",
    },
    ...(vehicle.fuelType === "ev"
      ? []
      : [{ item: "Spark plugs", intervalMiles: 60000 }]),
    { item: "Tire rotation", intervalMiles: 7500 },
    {
      item: "Brake inspection",
      intervalMiles: 10000,
      notes: "Safety-critical",
      safetyCritical: true,
    },
  ];
}

export function computeMaintenanceItems(
  vehicle: Vehicle,
  taste: TasteManager,
  horizonMiles = 15000,
): MaintenanceItem[] {
  const miles = vehicle.currentMileage;
  return buildIntervalDefs(vehicle, taste).map((b) => {
    // Prefer last matching service history entry when present
    const lastService = [...vehicle.serviceHistory]
      .filter((r) => matchesServiceItem(r.description, b.item))
      .sort((a, c) => c.mileage - a.mileage)[0];

    const baseMiles = lastService?.mileage ?? 0;
    // No history: first due at intervalMiles (so high-mileage vehicles without logs surface as overdue)
    const dueAtMiles =
      lastService != null
        ? baseMiles + b.intervalMiles
        : b.intervalMiles;

    const remaining = dueAtMiles - miles;
    let status: MaintenanceItem["status"] = "ok";
    if (remaining <= 0) status = "overdue";
    else if (remaining <= Math.min(1500, b.intervalMiles * 0.15)) status = "due_soon";

    // Outside horizon and ok → still return (caller may filter)
    void horizonMiles;

    return {
      item: b.item,
      intervalMiles: b.intervalMiles,
      dueAtMiles,
      status,
      notes: b.notes,
    };
  });
}

function matchesServiceItem(description: string, item: string): boolean {
  const d = description.toLowerCase();
  const key = item.toLowerCase();
  if (key.includes("oil") && /\boil\b/.test(d)) return true;
  if (key.includes("cabin") && /cabin/.test(d)) return true;
  if (key.includes("air filter") && /air filter/.test(d) && !/cabin/.test(d)) {
    return true;
  }
  if (key.includes("brake fluid") && /brake fluid/.test(d)) return true;
  if (key.includes("coolant") && /coolant|antifreeze/.test(d)) return true;
  if (key.includes("transmission") && /trans(mission)?|atf/.test(d)) return true;
  if (key.includes("spark") && /spark|plug/.test(d)) return true;
  if (key.includes("tire") && /tire|rotate/.test(d)) return true;
  if (key.includes("brake inspection") && /brake/.test(d)) return true;
  return d.includes(key.split(" ")[0] ?? "");
}
