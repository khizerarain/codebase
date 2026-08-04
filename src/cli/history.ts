import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DataPaths } from "../config/config.js";

const MAX = 200;

/** Persist slash/chat lines for readline history across sessions. */
export class CommandHistory {
  private readonly file: string;

  constructor(paths: DataPaths) {
    mkdirSync(paths.sessions, { recursive: true });
    this.file = join(paths.sessions, "command-history.json");
  }

  load(): string[] {
    if (!existsSync(this.file)) return [];
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.map(String).filter(Boolean).slice(-MAX);
    } catch {
      return [];
    }
  }

  push(line: string): void {
    const t = line.trim();
    if (!t || t === "/exit" || t === "/quit") return;
    const hist = this.load().filter((h) => h !== t);
    hist.push(t);
    writeFileSync(
      this.file,
      JSON.stringify(hist.slice(-MAX), null, 2),
      "utf8",
    );
  }
}

/** Remember last active vehicle id for /lv quick switch. */
export class LastVehicleMemory {
  private readonly file: string;

  constructor(paths: DataPaths) {
    mkdirSync(paths.sessions, { recursive: true });
    this.file = join(paths.sessions, "last-vehicle.json");
  }

  get(): string | null {
    if (!existsSync(this.file)) return null;
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as { id?: string };
      return raw.id ?? null;
    } catch {
      return null;
    }
  }

  set(id: string): void {
    writeFileSync(
      this.file,
      JSON.stringify({ id, updatedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
  }
}
