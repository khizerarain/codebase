import type { Config } from "../config/config.js";
import type { DataPaths } from "../config/config.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { MockVehicleDataProvider, type MockScenario } from "./mock.js";
import { formatRangeNotes } from "./ranges.js";
import { SerialObdProvider } from "./serial.js";
import { ObdStore } from "./store.js";
import type {
  LiveDataContext,
  VehicleDataProvider,
  VehicleSnapshot,
} from "./types.js";

export type ObdProviderKind = "mock" | "serial";

/**
 * Session-scoped OBD facade — agent/CLI use this, never raw adapters.
 */
export class ObdManager {
  private provider: VehicleDataProvider | null = null;
  readonly store: ObdStore;
  private liveSessionId: string | null = null;

  constructor(
    paths: DataPaths,
    private readonly config: Config,
    private readonly vehicles: VehicleStore,
  ) {
    this.store = new ObdStore(paths);
  }

  getProvider(): VehicleDataProvider | null {
    return this.provider;
  }

  isConnected(): boolean {
    return Boolean(this.provider?.isConnected());
  }

  async connect(
    kind?: ObdProviderKind,
    opts: { scenario?: MockScenario } = {},
  ): Promise<string> {
    if (this.provider?.isConnected()) {
      await this.provider.disconnect();
    }

    const resolved =
      kind ??
      (this.config.obd?.provider === "serial" ? "serial" : "mock");

    if (resolved === "serial") {
      this.provider = new SerialObdProvider({
        port: this.config.obd?.port ?? this.config.obd?.serialPort,
        baudRate: this.config.obd?.baudRate,
      });
    } else {
      const mock = new MockVehicleDataProvider();
      if (opts.scenario) mock.setScenario(opts.scenario);
      this.provider = mock;
    }

    await this.provider.connect();
    const active = this.vehicles.getActive();
    this.liveSessionId = this.store.startSession({
      vehicleId: active?.id,
      provider: this.provider.id,
      label: "live",
    }).id;

    return `${this.provider.label} connected` +
      (active
        ? ` · linked to ${active.year} ${active.make} ${active.model}`
        : " · no active vehicle (snapshots still saved locally)");
  }

  async disconnect(): Promise<string> {
    if (!this.provider) return "No OBD provider active.";
    if (this.liveSessionId) {
      this.store.endSession(this.liveSessionId);
      this.liveSessionId = null;
    }
    await this.provider.disconnect();
    const label = this.provider.label;
    this.provider = null;
    return `Disconnected: ${label}`;
  }

  async status(): Promise<string> {
    if (!this.provider?.isConnected()) {
      return [
        "OBD status: disconnected",
        "",
        "Connect with: /obd connect mock",
        "             /obd connect mock cruise|idle|fault_catalyst|hot",
        "             /obd connect serial   (requires port config; skeleton)",
        `Config provider default: ${this.config.obd?.provider ?? "mock"}`,
        this.config.obd?.port || this.config.obd?.serialPort
          ? `Serial port: ${this.config.obd?.port ?? this.config.obd?.serialPort}`
          : "Serial port: (not set)",
      ].join("\n");
    }

    const snap = await this.provider.getSnapshot();
    const active = this.vehicles.getActive();
    if (active) snap.vehicleId = active.id;
    return [
      `OBD status: connected (${this.provider.label})`,
      active
        ? `Vehicle: ${active.year} ${active.make} ${active.model}`
        : "Vehicle: (none active)",
      snap.vin ? `VIN: ${snap.vin}` : "VIN: (n/a)",
      "",
      formatSnapshotTable(snap),
      "",
      "Range hints (assistive, not OEM):",
      ...formatRangeNotes(snap).map((n) => `  ${n}`),
    ].join("\n");
  }

  async snapshot(attachHistory = true): Promise<{
    snap: VehicleSnapshot;
    markdown: string;
  }> {
    const p = this.requireProvider();
    const snap = await p.getSnapshot();
    const active = this.vehicles.getActive();
    if (active) snap.vehicleId = active.id;
    this.store.saveSnapshot(snap);
    if (this.liveSessionId) this.store.appendSample(this.liveSessionId, snap);

    if (attachHistory && active) {
      const summary = summarizeSnapshotForHistory(snap);
      this.vehicles.addServiceRecord(active.id, {
        date: new Date().toISOString().slice(0, 10),
        mileage: active.currentMileage,
        description: summary,
        diy: true,
        parts: [],
      });
    }

    const md = [
      "# OBD Snapshot",
      "",
      `Captured: ${snap.capturedAt}`,
      `Provider: ${snap.provider}`,
      active
        ? `Vehicle: ${active.year} ${active.make} ${active.model}`
        : "Vehicle: (none)",
      snap.vin ? `VIN: ${snap.vin}` : "",
      "",
      formatSnapshotTable(snap),
      "",
      "DTCs:",
      ...(snap.dtcs.length ? snap.dtcs.map((c) => `- ${c}`) : ["- (none)"]),
      "",
      "Range hints:",
      ...formatRangeNotes(snap).map((n) => `- ${n}`),
      "",
      "> Live data is decision-support only — not a substitute for professional diagnosis.",
    ]
      .filter(Boolean)
      .join("\n");

    return { snap, markdown: md };
  }

  async dtc(opts: { clear?: boolean; attachHistory?: boolean } = {}): Promise<string> {
    const p = this.requireProvider();
    if (opts.clear) {
      const ok = await p.clearDtc();
      return ok
        ? "DTCs cleared on provider (mock/sim). Recheck with /obd dtc."
        : "Provider refused DTC clear (or unsupported).";
    }

    const codes = await p.getDtc();
    const active = this.vehicles.getActive();
    const event = this.store.saveDtcEvent({
      vehicleId: active?.id,
      capturedAt: new Date().toISOString(),
      codes,
      provider: p.id,
      cleared: false,
    });

    if (opts.attachHistory !== false && active && codes.length) {
      this.vehicles.addServiceRecord(active.id, {
        date: new Date().toISOString().slice(0, 10),
        mileage: active.currentMileage,
        description: `OBD DTCs read: ${codes.join(", ")}`,
        diy: true,
        parts: [],
      });
    }

    const trends = this.store.trendNotes(active?.id);
    return [
      "Diagnostic Trouble Codes",
      "────────────────────────",
      `Provider: ${p.label}`,
      active
        ? `Vehicle: ${active.year} ${active.make} ${active.model}`
        : "Vehicle: (none active)",
      `Event id: ${event.id.slice(0, 8)}`,
      "",
      ...(codes.length ? codes.map((c) => `• ${c} — ${dtcHint(c)}`) : ["• No codes reported"]),
      "",
      ...(trends.length
        ? ["Local trend notes:", ...trends.map((t) => `• ${t}`), ""]
        : []),
      "> Codes are assistance only. Confirm with a scan tool / OEM procedure before repair.",
    ].join("\n");
  }

  async monitor(samples = 8, intervalMs = 400): Promise<string> {
    const p = this.requireProvider();
    const rows: string[] = [];
    rows.push(
      `Live monitor (${p.label}) — ${samples} samples @ ${intervalMs}ms`,
      "time     rpm   spd  cool  batt  load  thr",
      "──────  ────  ───  ────  ────  ────  ───",
    );
    for (let i = 0; i < samples; i++) {
      const snap = await p.getSnapshot();
      const active = this.vehicles.getActive();
      if (active) snap.vehicleId = active.id;
      this.store.saveSnapshot(snap);
      if (this.liveSessionId) this.store.appendSample(this.liveSessionId, snap);
      const v = snap.values;
      const t = snap.capturedAt.slice(11, 19);
      rows.push(
        `${t}  ${padNum(v.rpm, 4)}  ${padNum(v.speed, 3)}  ${padNum(v.coolant_temp_c, 4)}  ${padNum(v.battery_v, 4, 1)}  ${padNum(v.engine_load_pct, 4)}  ${padNum(v.throttle_pct, 3)}`,
      );
      if (i < samples - 1) await sleep(intervalMs);
    }
    rows.push("", "Tip: /obd snapshot to freeze a full capture · /obd dtc for codes");
    return rows.join("\n");
  }

  /** Build context for diagnostics / agent tools. */
  async liveContext(): Promise<LiveDataContext> {
    if (!this.provider?.isConnected()) {
      return {
        connected: false,
        providerId: "none",
        dtcs: [],
        rangeNotes: [],
      };
    }
    const snapshot = await this.provider.getSnapshot();
    const active = this.vehicles.getActive();
    if (active) snapshot.vehicleId = active.id;
    const dtcs = await this.provider.getDtc();
    return {
      connected: true,
      providerId: this.provider.id,
      snapshot,
      dtcs,
      rangeNotes: formatRangeNotes(snapshot),
    };
  }

  private requireProvider(): VehicleDataProvider {
    if (!this.provider?.isConnected()) {
      throw new Error("OBD not connected. Try: /obd connect mock");
    }
    return this.provider;
  }
}

function formatSnapshotTable(snap: VehicleSnapshot): string {
  const v = snap.values;
  const line = (k: string, label: string, unit = "") => {
    const val = v[k];
    if (val == null) return null;
    return `${label.padEnd(16)} ${val}${unit}`;
  };
  return [
    line("rpm", "RPM"),
    line("speed", "Speed", " mph"),
    line("coolant_temp_c", "Coolant", " °C"),
    line("battery_v", "Battery", " V"),
    line("fuel_level_pct", "Fuel", " %"),
    line("throttle_pct", "Throttle", " %"),
    line("engine_load_pct", "Load", " %"),
    line("intake_temp_c", "IAT", " °C"),
    line("maf_gs", "MAF", " g/s"),
    line("timing_advance", "Timing", " °"),
    line("runtime_s", "Runtime", " s"),
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeSnapshotForHistory(snap: VehicleSnapshot): string {
  const v = snap.values;
  const bits = [
    `OBD snapshot`,
    typeof v.rpm === "number" ? `rpm=${Math.round(v.rpm)}` : null,
    typeof v.coolant_temp_c === "number" ? `coolant=${v.coolant_temp_c}C` : null,
    typeof v.battery_v === "number" ? `batt=${v.battery_v}V` : null,
    snap.dtcs.length ? `dtc=${snap.dtcs.join("/")}` : "dtc=none",
  ].filter(Boolean);
  return bits.join(" · ");
}

function dtcHint(code: string): string {
  const c = code.toUpperCase();
  if (c === "P0420") return "Catalyst efficiency below threshold (common; verify before parts)";
  if (c === "P0171") return "System too lean (bank 1) — vacuum/MAF/fuel possibilities";
  if (c.startsWith("P03")) return "Ignition/misfire related family (verify specifics)";
  if (c.startsWith("P01")) return "Fuel/air metering family (verify specifics)";
  return "See OEM definition; treat as a lead, not a verdict";
}

function padNum(
  v: number | string | null | undefined,
  width: number,
  digits = 0,
): string {
  if (typeof v !== "number") return "-".padStart(width);
  const s = digits ? v.toFixed(digits) : String(Math.round(v));
  return s.padStart(width);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { formatSnapshotTable };
