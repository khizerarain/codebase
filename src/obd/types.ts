import { z } from "zod";

/** Core PIDs we support in mock + document for real adapters. */
export const CORE_PIDS = [
  "rpm",
  "speed",
  "coolant_temp_c",
  "battery_v",
  "fuel_level_pct",
  "throttle_pct",
  "engine_load_pct",
  "intake_temp_c",
  "maf_gs",
  "timing_advance",
  "runtime_s",
] as const;

export type CorePid = (typeof CORE_PIDS)[number];

export const VehicleSnapshotSchema = z.object({
  id: z.string(),
  capturedAt: z.string(),
  vehicleId: z.string().optional(),
  provider: z.string(),
  vin: z.string().nullable().optional(),
  values: z.record(z.union([z.number(), z.string(), z.null()])),
  dtcs: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type VehicleSnapshot = z.infer<typeof VehicleSnapshotSchema>;

export const ObdSessionSchema = z.object({
  id: z.string(),
  vehicleId: z.string().optional(),
  provider: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  samples: z.array(VehicleSnapshotSchema).default([]),
  label: z.string().optional(),
});

export type ObdSession = z.infer<typeof ObdSessionSchema>;

export const DtcEventSchema = z.object({
  id: z.string(),
  vehicleId: z.string().optional(),
  capturedAt: z.string(),
  codes: z.array(z.string()),
  provider: z.string(),
  cleared: z.boolean().default(false),
  snapshotId: z.string().optional(),
});

export type DtcEvent = z.infer<typeof DtcEventSchema>;

/**
 * Hardware-agnostic live vehicle data interface.
 * The rest of the agent talks only to this — never to adapters directly.
 */
export interface VehicleDataProvider {
  readonly id: string;
  readonly label: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getSupportedPids(): Promise<string[]>;
  readPid(pid: string): Promise<number | string | null>;
  readMultiple(pids: string[]): Promise<Record<string, number | string | null>>;
  getDtc(): Promise<string[]>;
  clearDtc(): Promise<boolean>;
  getVin(): Promise<string | null>;
  getSnapshot(): Promise<VehicleSnapshot>;
}

export interface LiveDataContext {
  connected: boolean;
  providerId: string;
  snapshot?: VehicleSnapshot;
  dtcs: string[];
  rangeNotes: string[];
}
