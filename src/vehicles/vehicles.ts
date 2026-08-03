import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { ensureDataDirs, type DataPaths } from "../config/config.js";
import {
  ActiveVehicleStateSchema,
  ServiceRecordSchema,
  VehicleSchema,
  type FuelType,
  type ServiceRecord,
  type Vehicle,
  type VehicleInput,
} from "./schema.js";

/** Local vehicle profile store with active-vehicle context. */
export class VehicleStore {
  private readonly paths: DataPaths;

  constructor(paths: DataPaths = ensureDataDirs()) {
    this.paths = paths;
  }

  private fileFor(id: string): string {
    return join(this.paths.vehicles, `${id}.json`);
  }

  private activeFile(): string {
    return join(this.paths.vehicles, "_active.json");
  }

  list(): Vehicle[] {
    if (!existsSync(this.paths.vehicles)) return [];
    return readdirSync(this.paths.vehicles)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => {
        try {
          return VehicleSchema.parse(
            JSON.parse(readFileSync(join(this.paths.vehicles, f), "utf8")) as unknown,
          );
        } catch {
          return null;
        }
      })
      .filter((v): v is Vehicle => v !== null)
      .sort((a, b) => `${a.year} ${a.make}`.localeCompare(`${b.year} ${b.make}`));
  }

  get(id: string): Vehicle | undefined {
    const exact = this.readId(id);
    if (exact) return exact;
    // Allow short id prefix
    return this.list().find((v) => v.id.startsWith(id) || v.id.slice(0, 8) === id);
  }

  private readId(id: string): Vehicle | undefined {
    const file = this.fileFor(id);
    if (!existsSync(file)) return undefined;
    try {
      return VehicleSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
    } catch {
      return undefined;
    }
  }

  save(vehicle: Vehicle): Vehicle {
    const parsed = VehicleSchema.parse(vehicle);
    writeFileSync(this.fileFor(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
    return parsed;
  }

  add(input: VehicleInput): Vehicle {
    const vehicle = VehicleSchema.parse({
      id: input.id ?? uuidv4(),
      make: input.make,
      model: input.model,
      year: input.year,
      trim: input.trim,
      engine: input.engine,
      transmission: input.transmission,
      drivetrain: input.drivetrain,
      fuelType: input.fuelType ?? "gas",
      vin: input.vin,
      currentMileage: input.currentMileage ?? input.mileage ?? 0,
      purchaseDate: input.purchaseDate,
      modifications: input.modifications ?? [],
      knownIssues: input.knownIssues ?? [],
      serviceHistory: input.serviceHistory ?? [],
      preferences: input.preferences ?? {},
      notes: input.notes ?? "",
    });
    this.save(vehicle);
    if (!this.getActiveId()) this.setActive(vehicle.id);
    return vehicle;
  }

  update(id: string, patch: Partial<VehicleInput>): Vehicle {
    const existing = this.get(id);
    if (!existing) throw new Error(`Vehicle not found: ${id}`);
    const merged = VehicleSchema.parse({
      ...existing,
      ...patch,
      id: existing.id,
      currentMileage:
        patch.currentMileage ??
        patch.mileage ??
        existing.currentMileage,
      modifications: patch.modifications ?? existing.modifications,
      knownIssues: patch.knownIssues ?? existing.knownIssues,
      serviceHistory: patch.serviceHistory ?? existing.serviceHistory,
      preferences: patch.preferences
        ? { ...existing.preferences, ...patch.preferences }
        : existing.preferences,
    });
    return this.save(merged);
  }

  remove(id: string): boolean {
    const v = this.get(id);
    if (!v) return false;
    unlinkSync(this.fileFor(v.id));
    if (this.getActiveId() === v.id) {
      const next = this.list()[0];
      this.setActive(next?.id ?? null);
    }
    return true;
  }

  getActiveId(): string | null {
    const file = this.activeFile();
    if (!existsSync(file)) {
      const first = this.list()[0];
      return first?.id ?? null;
    }
    try {
      const state = ActiveVehicleStateSchema.parse(
        JSON.parse(readFileSync(file, "utf8")) as unknown,
      );
      if (state.activeVehicleId && this.get(state.activeVehicleId)) {
        return state.activeVehicleId;
      }
      return this.list()[0]?.id ?? null;
    } catch {
      return this.list()[0]?.id ?? null;
    }
  }

  getActive(): Vehicle | undefined {
    const id = this.getActiveId();
    return id ? this.get(id) : undefined;
  }

  setActive(id: string | null): Vehicle | undefined {
    if (id) {
      const v = this.get(id);
      if (!v) throw new Error(`Vehicle not found: ${id}`);
      writeFileSync(
        this.activeFile(),
        JSON.stringify({ activeVehicleId: v.id }, null, 2),
        "utf8",
      );
      return v;
    }
    writeFileSync(
      this.activeFile(),
      JSON.stringify({ activeVehicleId: null }, null, 2),
      "utf8",
    );
    return undefined;
  }

  addServiceRecord(
    vehicleId: string,
    record: Omit<ServiceRecord, "id"> & { id?: string },
  ): Vehicle {
    const v = this.get(vehicleId);
    if (!v) throw new Error(`Vehicle not found: ${vehicleId}`);
    const entry = ServiceRecordSchema.parse({
      id: record.id ?? uuidv4(),
      date: record.date,
      mileage: record.mileage,
      description: record.description,
      cost: record.cost,
      parts: record.parts ?? [],
      shop: record.shop,
      diy: record.diy,
    });
    return this.update(v.id, {
      serviceHistory: [...v.serviceHistory, entry],
      currentMileage: Math.max(v.currentMileage, entry.mileage),
    });
  }

  formatList(activeId?: string | null): string {
    const vehicles = this.list();
    const active = activeId ?? this.getActiveId();
    if (vehicles.length === 0) {
      return "No vehicles yet. Add one with: /vehicles add <year> <make> <model> [mileage]";
    }
    return vehicles
      .map((v) => {
        const mark = v.id === active ? "●" : "○";
        const bits = [
          `${mark} ${v.year} ${v.make} ${v.model}`,
          v.trim ? v.trim : null,
          `${v.currentMileage.toLocaleString()} mi`,
          v.fuelType,
        ].filter(Boolean);
        return `${bits.join(" · ")}\n  id: ${v.id}`;
      })
      .join("\n");
  }

  formatDetail(v: Vehicle): string {
    const lines = [
      `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`,
      `id: ${v.id}`,
      `mileage: ${v.currentMileage.toLocaleString()} mi`,
      `fuel: ${v.fuelType}`,
    ];
    if (v.engine) lines.push(`engine: ${v.engine}`);
    if (v.transmission) lines.push(`transmission: ${v.transmission}`);
    if (v.drivetrain) lines.push(`drivetrain: ${v.drivetrain}`);
    if (v.vin) lines.push(`vin: ${v.vin}`);
    if (v.modifications.length) lines.push(`mods: ${v.modifications.join(", ")}`);
    if (v.knownIssues.length) lines.push(`issues: ${v.knownIssues.join("; ")}`);
    if (v.notes) lines.push(`notes: ${v.notes}`);
    lines.push(`service records: ${v.serviceHistory.length}`);
    return lines.join("\n");
  }

  formatHistory(v: Vehicle): string {
    if (!v.serviceHistory.length) {
      return `No service history for ${v.year} ${v.make} ${v.model}.`;
    }
    const rows = [...v.serviceHistory].sort((a, b) => b.date.localeCompare(a.date));
    return [
      `Service history — ${v.year} ${v.make} ${v.model}`,
      "",
      pad("Date", 12) + pad("Miles", 10) + pad("Cost", 10) + "Description",
      "-".repeat(60),
      ...rows.map((r) => {
        const cost = r.cost != null ? `$${r.cost.toFixed(0)}` : "-";
        return (
          pad(r.date.slice(0, 10), 12) +
          pad(r.mileage.toLocaleString(), 10) +
          pad(cost, 10) +
          r.description
        );
      }),
    ].join("\n");
  }

  promptSummary(activeId?: string | null): string {
    const vehicles = this.list();
    if (vehicles.length === 0) return "_No vehicle profiles saved._";
    const active = activeId ?? this.getActiveId();
    return vehicles
      .map((v) => {
        const flag = v.id === active ? "ACTIVE " : "";
        const parts = [
          `${flag}${v.year} ${v.make} ${v.model}`,
          `${v.currentMileage} mi`,
          v.fuelType,
        ];
        if (v.engine) parts.push(v.engine);
        if (v.knownIssues.length) parts.push(`issues: ${v.knownIssues.join(", ")}`);
        if (v.modifications.length) parts.push(`mods: ${v.modifications.join(", ")}`);
        if (v.notes) parts.push(`notes: ${v.notes}`);
        return `- [${v.id.slice(0, 8)}] ${parts.join(" · ")}`;
      })
      .join("\n");
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export type { FuelType, ServiceRecord, Vehicle, VehicleInput };
