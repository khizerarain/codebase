import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { DataPaths } from "../config/config.js";
import {
  DtcEventSchema,
  ObdSessionSchema,
  VehicleSnapshotSchema,
  type DtcEvent,
  type ObdSession,
  type VehicleSnapshot,
} from "./types.js";

/** Local persistence for OBD snapshots, short sessions, and DTC events. */
export class ObdStore {
  private readonly root: string;
  private readonly snapshotsDir: string;
  private readonly sessionsDir: string;
  private readonly dtcDir: string;

  constructor(paths: DataPaths) {
    this.root = paths.obd;
    this.snapshotsDir = join(this.root, "snapshots");
    this.sessionsDir = join(this.root, "sessions");
    this.dtcDir = join(this.root, "dtc");
    for (const d of [this.root, this.snapshotsDir, this.sessionsDir, this.dtcDir]) {
      mkdirSync(d, { recursive: true });
    }
  }

  saveSnapshot(snap: VehicleSnapshot): VehicleSnapshot {
    const parsed = VehicleSnapshotSchema.parse(snap);
    const file = join(this.snapshotsDir, `${parsed.id}.json`);
    writeFileSync(file, JSON.stringify(parsed, null, 2), "utf8");
    return parsed;
  }

  listSnapshots(vehicleId?: string, limit = 20): VehicleSnapshot[] {
    return this.readAll(this.snapshotsDir, VehicleSnapshotSchema)
      .filter((s) => !vehicleId || s.vehicleId === vehicleId)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
      .slice(0, limit);
  }

  saveSession(session: ObdSession): ObdSession {
    const parsed = ObdSessionSchema.parse(session);
    writeFileSync(
      join(this.sessionsDir, `${parsed.id}.json`),
      JSON.stringify(parsed, null, 2),
      "utf8",
    );
    return parsed;
  }

  startSession(input: {
    vehicleId?: string;
    provider: string;
    label?: string;
  }): ObdSession {
    return this.saveSession({
      id: uuidv4(),
      vehicleId: input.vehicleId,
      provider: input.provider,
      startedAt: new Date().toISOString(),
      samples: [],
      label: input.label,
    });
  }

  appendSample(sessionId: string, snap: VehicleSnapshot): ObdSession | null {
    const file = join(this.sessionsDir, `${sessionId}.json`);
    if (!existsSync(file)) return null;
    const session = ObdSessionSchema.parse(
      JSON.parse(readFileSync(file, "utf8")) as unknown,
    );
    session.samples.push(snap);
    // Cap samples for storage efficiency
    if (session.samples.length > 120) {
      session.samples = session.samples.slice(-120);
    }
    return this.saveSession(session);
  }

  endSession(sessionId: string): ObdSession | null {
    const file = join(this.sessionsDir, `${sessionId}.json`);
    if (!existsSync(file)) return null;
    const session = ObdSessionSchema.parse(
      JSON.parse(readFileSync(file, "utf8")) as unknown,
    );
    session.endedAt = new Date().toISOString();
    return this.saveSession(session);
  }

  saveDtcEvent(event: Omit<DtcEvent, "id"> & { id?: string }): DtcEvent {
    const parsed = DtcEventSchema.parse({
      id: event.id ?? uuidv4(),
      ...event,
    });
    writeFileSync(
      join(this.dtcDir, `${parsed.id}.json`),
      JSON.stringify(parsed, null, 2),
      "utf8",
    );
    return parsed;
  }

  listDtcEvents(vehicleId?: string, limit = 20): DtcEvent[] {
    return this.readAll(this.dtcDir, DtcEventSchema)
      .filter((e) => !vehicleId || e.vehicleId === vehicleId)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
      .slice(0, limit);
  }

  /** Simple repeated-code / coolant trend notes from local history. */
  trendNotes(vehicleId?: string): string[] {
    const notes: string[] = [];
    const events = this.listDtcEvents(vehicleId, 50);
    const counts = new Map<string, number>();
    for (const e of events) {
      for (const c of e.codes) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    for (const [code, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      if (n >= 2) notes.push(`Repeated DTC ${code} seen ${n} times in local OBD history`);
    }

    const snaps = this.listSnapshots(vehicleId, 30);
    const coolants = snaps
      .map((s) => s.values.coolant_temp_c)
      .filter((v): v is number => typeof v === "number");
    if (coolants.length >= 4) {
      const recent = coolants.slice(0, 3);
      const older = coolants.slice(3, 6);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      if (older.length && avg(recent) > avg(older) + 8) {
        notes.push(
          `Coolant temp trend: recent snapshots avg ${avg(recent).toFixed(0)}°C vs earlier ${avg(older).toFixed(0)}°C (rising)`,
        );
      }
    }
    return notes;
  }

  private readAll<T>(
    dir: string,
    schema: { parse: (u: unknown) => T },
  ): T[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return schema.parse(
            JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown,
          );
        } catch {
          return null;
        }
      })
      .filter((x): x is T => x !== null);
  }
}
