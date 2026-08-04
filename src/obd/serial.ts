import { v4 as uuidv4 } from "uuid";
import type { VehicleDataProvider, VehicleSnapshot } from "./types.js";
import { CORE_PIDS } from "./types.js";

export interface SerialObdOptions {
  /** e.g. COM3, /dev/tty.usbserial-*, /dev/ttyUSB0 */
  port?: string;
  baudRate?: number;
}

/**
 * ELM327-style serial adapter skeleton.
 *
 * Intentionally does **not** bundle a native serial dependency yet.
 * `connect()` validates configuration and explains how to finish wiring.
 * Real AT/PID I/O belongs in a future thin transport behind this same interface.
 */
export class SerialObdProvider implements VehicleDataProvider {
  readonly id = "serial";
  readonly label = "Serial ELM327 (skeleton)";
  private connected = false;
  private readonly port: string | undefined;
  private readonly baudRate: number;

  constructor(opts: SerialObdOptions = {}) {
    this.port = opts.port;
    this.baudRate = opts.baudRate ?? 38400;
  }

  async connect(): Promise<void> {
    if (!this.port?.trim()) {
      throw new Error(
        [
          "Serial OBD port not configured.",
          "Set: /config set obd.port COM3   (Windows) or /dev/ttyUSB0 (Linux)",
          "Or use mock mode: /obd connect mock",
          "See docs/obd.md for adding a real ELM327 transport later.",
        ].join("\n"),
      );
    }

    // Placeholder: future open(port, baud) + ATZ / ATE0 / ATH1 handshake
    throw new Error(
      [
        `SerialObdProvider is adapter-ready but not fully wired yet.`,
        `Configured port: ${this.port} @ ${this.baudRate} baud`,
        "",
        "Next implementation steps (same interface):",
        "1. Open serial port (e.g. serialport package)",
        "2. Send ATZ, ATE0, ATL0, ATSP0",
        "3. Map CORE_PIDS → Mode 01 PIDs (e.g. rpm=010C)",
        "4. Parse ELM responses into VehicleSnapshot",
        "",
        "Until then, use: /obd connect mock",
      ].join("\n"),
    );
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

  async readPid(_pid: string): Promise<number | string | null> {
    this.requireConnected();
    return null;
  }

  async readMultiple(
    pids: string[],
  ): Promise<Record<string, number | string | null>> {
    this.requireConnected();
    const out: Record<string, number | string | null> = {};
    for (const p of pids) out[p] = null;
    return out;
  }

  async getDtc(): Promise<string[]> {
    this.requireConnected();
    return [];
  }

  async clearDtc(): Promise<boolean> {
    this.requireConnected();
    return false;
  }

  async getVin(): Promise<string | null> {
    this.requireConnected();
    return null;
  }

  async getSnapshot(): Promise<VehicleSnapshot> {
    this.requireConnected();
    return {
      id: uuidv4(),
      capturedAt: new Date().toISOString(),
      provider: this.id,
      vin: null,
      values: {},
      dtcs: [],
      notes: "serial skeleton — no live bytes yet",
    };
  }

  private requireConnected(): void {
    if (!this.connected) {
      throw new Error("Serial OBD not connected.");
    }
  }
}
