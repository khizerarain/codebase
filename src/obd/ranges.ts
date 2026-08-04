import type { VehicleSnapshot } from "./types.js";

export interface RangeCheck {
  pid: string;
  value: number | string | null;
  status: "ok" | "watch" | "high" | "low" | "unknown";
  message: string;
}

/** Lightweight expected-range hints — assistance only, not OEM specs. */
export function assessLiveRanges(
  values: Record<string, number | string | null>,
): RangeCheck[] {
  const checks: RangeCheck[] = [];

  const num = (k: string): number | null => {
    const v = values[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const coolant = num("coolant_temp_c");
  if (coolant != null) {
    if (coolant >= 105) {
      checks.push({
        pid: "coolant_temp_c",
        value: coolant,
        status: "high",
        message: `Coolant ${coolant}°C — elevated; watch for overheating (assistive hint)`,
      });
    } else if (coolant < 60) {
      checks.push({
        pid: "coolant_temp_c",
        value: coolant,
        status: "watch",
        message: `Coolant ${coolant}°C — still warming / cold`,
      });
    } else {
      checks.push({
        pid: "coolant_temp_c",
        value: coolant,
        status: "ok",
        message: `Coolant ${coolant}°C — in a common warm range`,
      });
    }
  }

  const batt = num("battery_v");
  if (batt != null) {
    if (batt < 12.0) {
      checks.push({
        pid: "battery_v",
        value: batt,
        status: "low",
        message: `Battery ${batt.toFixed(1)}V — low at rest/idle (hint)`,
      });
    } else if (batt > 15.0) {
      checks.push({
        pid: "battery_v",
        value: batt,
        status: "high",
        message: `Battery ${batt.toFixed(1)}V — high; charging system check may be warranted`,
      });
    } else {
      checks.push({
        pid: "battery_v",
        value: batt,
        status: "ok",
        message: `Battery ${batt.toFixed(1)}V — common running/idle band`,
      });
    }
  }

  const rpm = num("rpm");
  if (rpm != null) {
    if (rpm > 0 && rpm < 500) {
      checks.push({
        pid: "rpm",
        value: rpm,
        status: "low",
        message: `RPM ${rpm} — unusually low if engine is supposed to be running`,
      });
    } else if (rpm > 6500) {
      checks.push({
        pid: "rpm",
        value: rpm,
        status: "high",
        message: `RPM ${rpm} — high; confirm intentional load/WOT`,
      });
    } else if (rpm > 0) {
      checks.push({
        pid: "rpm",
        value: rpm,
        status: "ok",
        message: `RPM ${Math.round(rpm)}`,
      });
    }
  }

  const load = num("engine_load_pct");
  if (load != null && load > 95) {
    checks.push({
      pid: "engine_load_pct",
      value: load,
      status: "watch",
      message: `Engine load ${load}% — near max reported load`,
    });
  }

  return checks;
}

export function formatRangeNotes(snapshot: VehicleSnapshot): string[] {
  return assessLiveRanges(snapshot.values).map((c) => {
    const icon =
      c.status === "ok" ? "·" : c.status === "watch" ? "!" : c.status === "unknown" ? "?" : "⚠";
    return `${icon} ${c.message}`;
  });
}
