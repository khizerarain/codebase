import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ensureDataDirs, type DataPaths } from "../config/config.js";

export const ChatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(ChatMessageSchema),
  vehicleIds: z.array(z.string()).default([]),
});

export type Session = z.infer<typeof SessionSchema>;

const PersistentMemorySchema = z.object({
  notes: z.array(
    z.object({
      id: z.string(),
      timestamp: z.string(),
      text: z.string(),
    }),
  ),
});

export type PersistentMemory = z.infer<typeof PersistentMemorySchema>;

/** Session history + durable notes stored as local JSON. */
export class MemoryStore {
  private readonly paths: DataPaths;
  private session: Session;

  constructor(paths: DataPaths = ensureDataDirs(), recover = false) {
    this.paths = paths;
    if (recover) {
      const recovered = this.tryRecoverLatest();
      this.session = recovered ?? this.createSession();
    } else {
      this.session = this.createSession();
    }
  }

  private memoryFile(): string {
    return join(this.paths.memory, "notes.json");
  }

  private currentPointerFile(): string {
    return join(this.paths.sessions, "_current.json");
  }

  createSession(vehicleIds: string[] = []): Session {
    const now = new Date().toISOString();
    this.session = {
      id: uuidv4(),
      startedAt: now,
      updatedAt: now,
      messages: [],
      vehicleIds,
    };
    this.writeCurrentPointer();
    return this.session;
  }

  /** Recover the most recent non-empty session after a crash/restart. */
  tryRecoverLatest(): Session | null {
    const recent = this.listRecentSessions(1)[0];
    if (!recent || recent.messages.length === 0) return null;
    // Prefer pointer if valid
    const pointer = this.readCurrentPointer();
    if (pointer) {
      const pointed = this.loadSessionById(pointer);
      if (pointed && pointed.messages.length > 0) {
        this.session = pointed;
        return pointed;
      }
    }
    this.session = recent;
    this.writeCurrentPointer();
    return recent;
  }

  private readCurrentPointer(): string | null {
    const file = this.currentPointerFile();
    if (!existsSync(file)) return null;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as { id?: string };
      return raw.id ?? null;
    } catch {
      return null;
    }
  }

  private writeCurrentPointer(): void {
    writeFileSync(
      this.currentPointerFile(),
      JSON.stringify({ id: this.session.id, updatedAt: this.session.updatedAt }, null, 2),
      "utf8",
    );
  }

  loadSessionById(id: string): Session | null {
    const file = join(this.paths.sessions, `${id}.json`);
    if (!existsSync(file)) return null;
    try {
      return SessionSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
    } catch {
      return null;
    }
  }

  getSession(): Session {
    return this.session;
  }

  clearSession(): Session {
    return this.createSession(this.session.vehicleIds);
  }

  addMessage(message: ChatMessage): void {
    this.session.messages.push(ChatMessageSchema.parse(message));
    this.session.updatedAt = new Date().toISOString();
  }

  getMessages(): ChatMessage[] {
    return [...this.session.messages];
  }

  /**
   * Context-window management: keep recent turns; summarize older ones into one note.
   * Truncates bulky tool payloads so long sessions stay usable.
   */
  getMessagesForPrompt(limit = 24): ChatMessage[] {
    const all = this.session.messages;
    const compact = (msgs: ChatMessage[]): ChatMessage[] =>
      msgs.map((m) => {
        if (m.role !== "tool" && m.role !== "assistant") return m;
        if (m.content.length <= 1600) return m;
        return {
          ...m,
          content: `${m.content.slice(0, 1600)}…[truncated for context window]`,
        };
      });

    if (all.length <= limit) return compact([...all]);

    const keep = all.slice(-limit);
    const dropped = all.slice(0, -limit);
    const summary = dropped
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => `${m.role}: ${m.content.replace(/\s+/g, " ").slice(0, 120)}`)
      .join(" | ");

    return compact([
      {
        role: "assistant",
        content: `[Earlier conversation summary] ${summary}`,
      },
      ...keep,
    ]);
  }

  setVehicleIds(ids: string[]): void {
    this.session.vehicleIds = ids;
  }

  setActiveVehicle(id: string | null): void {
    this.session.vehicleIds = id ? [id] : [];
  }

  persistSession(): string {
    const file = join(this.paths.sessions, `${this.session.id}.json`);
    writeFileSync(file, JSON.stringify(this.session, null, 2), "utf8");
    this.writeCurrentPointer();
    return file;
  }

  loadPersistentNotes(): PersistentMemory {
    const file = this.memoryFile();
    if (!existsSync(file)) {
      return { notes: [] };
    }
    try {
      return PersistentMemorySchema.parse(
        JSON.parse(readFileSync(file, "utf8")) as unknown,
      );
    } catch {
      return { notes: [] };
    }
  }

  addNote(text: string): void {
    const mem = this.loadPersistentNotes();
    mem.notes.push({
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      text,
    });
    writeFileSync(this.memoryFile(), JSON.stringify(mem, null, 2), "utf8");
  }

  /** Recent durable notes for prompt injection. */
  recentNotesSummary(limit = 8): string {
    const notes = this.loadPersistentNotes().notes.slice(-limit);
    if (notes.length === 0) return "_No persistent memory notes yet._";
    return notes.map((n) => `- (${n.timestamp.slice(0, 10)}) ${n.text}`).join("\n");
  }

  listRecentSessions(limit = 5): Session[] {
    if (!existsSync(this.paths.sessions)) return [];
    return readdirSync(this.paths.sessions)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => {
        try {
          return SessionSchema.parse(
            JSON.parse(readFileSync(join(this.paths.sessions, f), "utf8")) as unknown,
          );
        } catch {
          return null;
        }
      })
      .filter((s): s is Session => s !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }
}
