import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ensureDataDirs, type DataPaths } from "../config/config.js";

export const VehicleSchema = z.object({
  id: z.string(),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1886).max(2100),
  mileage: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  modifications: z.array(z.string()).optional(),
});

export type Vehicle = z.infer<typeof VehicleSchema>;

export type VehicleInput = Omit<Vehicle, "id"> & { id?: string };

/** Local vehicle profile store (one JSON file per vehicle). */
export class VehicleStore {
  private readonly paths: DataPaths;

  constructor(paths: DataPaths = ensureDataDirs()) {
    this.paths = paths;
  }

  private fileFor(id: string): string {
    return join(this.paths.vehicles, `${id}.json`);
  }

  list(): Vehicle[] {
    if (!existsSync(this.paths.vehicles)) return [];
    return readdirSync(this.paths.vehicles)
      .filter((f) => f.endsWith(".json"))
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
    const file = this.fileFor(id);
    if (!existsSync(file)) return undefined;
    try {
      return VehicleSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
    } catch {
      return undefined;
    }
  }

  add(input: VehicleInput): Vehicle {
    const vehicle = VehicleSchema.parse({
      id: input.id ?? uuidv4(),
      make: input.make,
      model: input.model,
      year: input.year,
      mileage: input.mileage,
      notes: input.notes,
      modifications: input.modifications ?? [],
    });
    writeFileSync(this.fileFor(vehicle.id), JSON.stringify(vehicle, null, 2), "utf8");
    return vehicle;
  }

  formatList(): string {
    const vehicles = this.list();
    if (vehicles.length === 0) {
      return "No vehicles yet. Add one with: /vehicles add <year> <make> <model> [mileage]";
    }
    return vehicles
      .map((v) => {
        const miles = v.mileage != null ? ` · ${v.mileage.toLocaleString()} mi` : "";
        const mods =
          v.modifications && v.modifications.length > 0
            ? ` · mods: ${v.modifications.join(", ")}`
            : "";
        return `• ${v.year} ${v.make} ${v.model}${miles}${mods}\n  id: ${v.id}`;
      })
      .join("\n");
  }

  /** Compact summary for system prompt injection. */
  promptSummary(): string {
    const vehicles = this.list();
    if (vehicles.length === 0) return "_No vehicle profiles saved._";
    return vehicles
      .map((v) => {
        const parts = [`${v.year} ${v.make} ${v.model}`];
        if (v.mileage != null) parts.push(`${v.mileage} mi`);
        if (v.notes) parts.push(`notes: ${v.notes}`);
        if (v.modifications?.length) parts.push(`mods: ${v.modifications.join(", ")}`);
        return `- [${v.id.slice(0, 8)}] ${parts.join(" · ")}`;
      })
      .join("\n");
  }
}
