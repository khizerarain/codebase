import { z } from "zod";

export const ServiceRecordSchema = z.object({
  id: z.string(),
  date: z.string(),
  mileage: z.number().nonnegative(),
  description: z.string().min(1),
  cost: z.number().nonnegative().optional(),
  parts: z.array(z.string()).default([]),
  shop: z.string().optional(),
  diy: z.boolean().optional(),
});

export type ServiceRecord = z.infer<typeof ServiceRecordSchema>;

export const FuelTypeSchema = z.enum(["gas", "diesel", "hybrid", "ev", "other"]);
export type FuelType = z.infer<typeof FuelTypeSchema>;

/** Rich vehicle profile (Phase 3). Accepts legacy Phase 1 fields via preprocess. */
export const VehicleSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const v = raw as Record<string, unknown>;
  const next: Record<string, unknown> = { ...v };

  // Legacy `mileage` → `currentMileage`
  if (next.currentMileage == null && typeof next.mileage === "number") {
    next.currentMileage = next.mileage;
  }
  if (next.fuelType == null) next.fuelType = "gas";
  if (next.modifications == null) next.modifications = [];
  if (next.knownIssues == null) next.knownIssues = [];
  if (next.serviceHistory == null) next.serviceHistory = [];
  if (next.preferences == null) next.preferences = {};
  if (next.notes == null) next.notes = "";
  if (typeof next.currentMileage !== "number") next.currentMileage = 0;

  return next;
}, z.object({
  id: z.string(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1886).max(2100),
  trim: z.string().optional(),
  engine: z.string().optional(),
  transmission: z.string().optional(),
  drivetrain: z.string().optional(),
  fuelType: FuelTypeSchema.default("gas"),
  vin: z.string().optional(),
  currentMileage: z.number().nonnegative().default(0),
  purchaseDate: z.string().optional(),
  modifications: z.array(z.string()).default([]),
  knownIssues: z.array(z.string()).default([]),
  serviceHistory: z.array(ServiceRecordSchema).default([]),
  preferences: z.record(z.unknown()).default({}),
  notes: z.string().default(""),
}));

export type Vehicle = z.infer<typeof VehicleSchema>;

export type VehicleInput = Partial<Omit<Vehicle, "id">> & {
  id?: string;
  make: string;
  model: string;
  year: number;
  /** Legacy alias */
  mileage?: number;
};

export const ActiveVehicleStateSchema = z.object({
  activeVehicleId: z.string().nullable().default(null),
});

export type ActiveVehicleState = z.infer<typeof ActiveVehicleStateSchema>;
