import { v4 as uuidv4 } from "uuid";
import {
  CORE_PIDS,
  type VehicleDataProvider,
  type VehicleSnapshot,
} from "./types.js";

export type MockScenario = "idle" | "cruise" | "fault_catalyst" | "hot";

/**
 * First-class simulated OBD provider for demos and development.
 * No hardware required.
 */
export class MockVehicleDataProvider implements VehicleDataProvider {
  readonly id = "mock";
  readonly label = "Mock OBD (simulated)";
  private connected = false;
  private scenario: MockScenario = "idle";
  private vin = "1C4RJFAG0FC625000";
  private dtcs: string[] = [];
  private t0 = Date.now();

  setScenario(scenario: MockScenario): void {
    this.scenario = scenario;
    if (scenario === "fault_catalyst") {
      this.dtcs = ["P0420", "P0171"];
    } else if (scenario === "hot") {
      this.dtcs = [];
    } else {
      this.dtcs = [];
    }
  }

  getScenario(): MockScenario {
    return this.scenario;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.t0 = Date.now();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getSupportedPids(): Promise<string[]> {
    this.requireConnected();
    return [...CORE_PIDS];
  }

  async readPid(pid: string): Promise<number | string | null> {
    this.requireConnected();
    const values = this.computeValues();
    return values[pid] ?? null;
  }

  async readMultiple(
    pids: string[],
  ): Promise<Record<string, number | string | null>> {
    this.requireConnected();
    const values = this.computeValues();
    const out: Record<string, number | string | null> = {};
    for (const p of pids) out[p] = values[p] ?? null;
    return out;
  }

  async getDtc(): Promise<string[]> {
    this.requireConnected();
    return [...this.dtcs];
  }

  async clearDtc(): Promise<boolean> {
    this.requireConnected();
    this.dtcs = [];
    if (this.scenario === "fault_catalyst") this.scenario = "idle";
    return true;
  }

  async getVin(): Promise<string | null> {
    this.requireConnected();
    return this.vin;
  }

  async getSnapshot(): Promise<VehicleSnapshot> {
    this.requireConnected();
    const values = this.computeValues();
    // Mild jitter so monitor mode looks alive
    for (const key of ["rpm", "speed", "throttle_pct", "engine_load_pct"] as const) {
      const v = values[key];
      if (typeof v === "number") {
        values[key] = Math.round((v + (Math.random() - 0.5) * (key === "rpm" ? 40 : 2)) * 10) / 10;
      }
    }
    return {
      id: uuidv4(),
      capturedAt: new Date().toISOString(),
      provider: this.id,
      vin: this.vin,
      values,
      dtcs: [...this.dtcs],
      notes: `mock scenario=${this.scenario}`,
    };
  }

  private requireConnected(): void {
    if (!this.connected) {
      throw new Error("Mock OBD not connected. Use /obd connect mock");
    }
  }

  private computeValues(): Record<string, number | string | null> {
    const runtime = Math.floor((Date.now() - this.t0) / 1000);
    switch (this.scenario) {
      case "cruise":
        return {
          rpm: 2200,
          speed: 65,
          coolant_temp_c: 92,
          battery_v: 14.2,
          fuel_level_pct: 48,
          throttle_pct: 18,
          engine_load_pct: 35,
          intake_temp_c: 28,
          maf_gs: 12.5,
          timing_advance: 18,
          runtime_s: runtime,
        };
      case "fault_catalyst":
        return {
          rpm: 780,
          speed: 0,
          coolant_temp_c: 90,
          battery_v: 13.9,
          fuel_level_pct: 35,
          throttle_pct: 0,
          engine_load_pct: 22,
          intake_temp_c: 32,
          maf_gs: 3.2,
          timing_advance: 8,
          runtime_s: runtime,
        };
      case "hot":
        return {
          rpm: 900,
          speed: 0,
          coolant_temp_c: 112,
          battery_v: 13.7,
          fuel_level_pct: 40,
          throttle_pct: 2,
          engine_load_pct: 28,
          intake_temp_c: 45,
          maf_gs: 4.0,
          timing_advance: 10,
          runtime_s: runtime,
        };
      case "idle":
      default:
        return {
          rpm: 720,
          speed: 0,
          coolant_temp_c: 88,
          battery_v: 14.1,
          fuel_level_pct: 62,
          throttle_pct: 0,
          engine_load_pct: 18,
          intake_temp_c: 25,
          maf_gs: 2.8,
          timing_advance: 6,
          runtime_s: runtime,
        };
    }
  }
}
