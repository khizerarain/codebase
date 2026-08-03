import { withSafetyFooter } from "../agent/safety.js";
import type { TasteManager } from "../taste/taste.js";
import type { Vehicle, VehicleStore } from "../vehicles/vehicles.js";
import { computeMaintenanceItems } from "./maintenance.js";

export function formatDueReport(
  vehicles: VehicleStore,
  taste: TasteManager,
  opts: { garage?: boolean; horizonMiles?: number } = {},
): string {
  const horizon = opts.horizonMiles ?? 10000;
  const list = opts.garage
    ? vehicles.list()
    : (() => {
        const a = vehicles.getActive();
        return a ? [a] : [];
      })();

  if (!list.length) {
    return "No vehicle selected. Add one with /vehicles add … or pass garage mode via /due garage";
  }

  const sections = list.map((v) => sectionForVehicle(v, taste, horizon));
  const overdueCount = sections.reduce((n, s) => n + s.overdue, 0);
  const soonCount = sections.reduce((n, s) => n + s.soon, 0);

  return withSafetyFooter(
    [
      opts.garage ? "Due soon — garage view" : "Due soon — active vehicle",
      `Horizon: next ~${horizon.toLocaleString()} mi · Overdue: ${overdueCount} · Due soon: ${soonCount}`,
      "",
      ...sections.map((s) => s.text),
      "",
      "Tip: log completed work with `/log …` so due dates track real service history.",
    ].join("\n"),
  );
}

function sectionForVehicle(
  v: Vehicle,
  taste: TasteManager,
  horizon: number,
): { text: string; overdue: number; soon: number } {
  const items = computeMaintenanceItems(v, taste, horizon).filter(
    (i) =>
      i.status === "overdue" ||
      i.status === "due_soon" ||
      (i.dueAtMiles != null && i.dueAtMiles <= v.currentMileage + horizon),
  );

  const overdue = items.filter((i) => i.status === "overdue");
  const soon = items.filter((i) => i.status === "due_soon");
  const upcoming = items.filter(
    (i) => i.status === "ok" && i.dueAtMiles != null && i.dueAtMiles <= v.currentMileage + horizon,
  );

  const lines = [
    `## ${v.year} ${v.make} ${v.model} (${v.currentMileage.toLocaleString()} mi)`,
    "",
    "### OVERDUE",
    ...(overdue.length
      ? overdue.map(
          (i) =>
            `⚠ ${i.item} — was due ~${i.dueAtMiles?.toLocaleString()} mi${i.notes ? ` · ${i.notes}` : ""}`,
        )
      : ["- None"]),
    "",
    "### Due soon",
    ...(soon.length
      ? soon.map(
          (i) =>
            `• ${i.item} — due ~${i.dueAtMiles?.toLocaleString()} mi${i.notes ? ` · ${i.notes}` : ""}`,
        )
      : ["- None"]),
    "",
    "### Upcoming in horizon",
    ...(upcoming.length
      ? upcoming.map(
          (i) => `• ${i.item} — ~${i.dueAtMiles?.toLocaleString()} mi`,
        )
      : ["- None flagged"]),
    "",
  ];

  return {
    text: lines.join("\n"),
    overdue: overdue.length,
    soon: soon.length,
  };
}
