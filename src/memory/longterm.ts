import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ensureDataDirs, type DataPaths } from "../config/config.js";

export const MemoryKindSchema = z.enum(["personal", "vehicle", "context"]);
export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const MemoryFactSchema = z.object({
  id: z.string(),
  kind: MemoryKindSchema,
  text: z.string().min(1),
  vehicleIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(["user", "extracted", "system"]).default("user"),
});

export type MemoryFact = z.infer<typeof MemoryFactSchema>;

const StoreSchema = z.object({
  facts: z.array(MemoryFactSchema).default([]),
  pending: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        kind: MemoryKindSchema,
        vehicleIds: z.array(z.string()).default([]),
        proposedAt: z.string(),
      }),
    )
    .default([]),
});

/** Durable cross-session memory distinct from chat session history. */
export class LongTermMemory {
  private readonly file: string;

  constructor(paths: DataPaths = ensureDataDirs()) {
    this.file = join(paths.memory, "longterm.json");
  }

  private load(): z.infer<typeof StoreSchema> {
    if (!existsSync(this.file)) return { facts: [], pending: [] };
    try {
      return StoreSchema.parse(JSON.parse(readFileSync(this.file, "utf8")) as unknown);
    } catch {
      return { facts: [], pending: [] };
    }
  }

  private save(data: z.infer<typeof StoreSchema>): void {
    writeFileSync(this.file, JSON.stringify(data, null, 2), "utf8");
  }

  list(kind?: MemoryKind): MemoryFact[] {
    const facts = this.load().facts;
    return (kind ? facts.filter((f) => f.kind === kind) : facts).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  add(input: {
    text: string;
    kind: MemoryKind;
    vehicleIds?: string[];
    tags?: string[];
    source?: MemoryFact["source"];
  }): MemoryFact {
    const now = new Date().toISOString();
    const fact = MemoryFactSchema.parse({
      id: uuidv4(),
      text: input.text.trim(),
      kind: input.kind,
      vehicleIds: input.vehicleIds ?? [],
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      source: input.source ?? "user",
    });
    const data = this.load();
    data.facts.push(fact);
    this.save(data);
    return fact;
  }

  remove(idOrText: string): boolean {
    const data = this.load();
    const needle = idOrText.toLowerCase();
    const before = data.facts.length;
    data.facts = data.facts.filter(
      (f) => f.id !== idOrText && !f.id.startsWith(idOrText) && !f.text.toLowerCase().includes(needle),
    );
    // If text match would wipe many, require id-like
    if (before - data.facts.length > 3 && idOrText.length < 8) {
      return false;
    }
    this.save(data);
    return data.facts.length < before;
  }

  formatList(kind?: MemoryKind): string {
    const facts = this.list(kind);
    if (!facts.length) {
      return kind
        ? `No ${kind} memory facts yet.`
        : "No long-term memory facts yet. Add with /memory add <text>";
    }
    return facts
      .map((f) => {
        const scope =
          f.kind === "vehicle"
            ? `vehicle:${f.vehicleIds.map((id) => id.slice(0, 8)).join(",") || "?"}`
            : f.kind;
        return `• [${scope}] ${f.text}\n  id: ${f.id.slice(0, 8)} · ${f.source}`;
      })
      .join("\n");
  }

  /** Compact injection for prompts — never dump everything. */
  promptSummary(vehicleIds: string[] = [], limit = 10): string {
    const facts = this.list();
    const vehicleSet = new Set(vehicleIds);
    const picked = facts
      .filter((f) => {
        if (f.kind === "context") return false; // ephemeral-ish; keep out of prompt unless recent
        if (f.kind === "vehicle") {
          return f.vehicleIds.some((id) => vehicleSet.has(id));
        }
        return true;
      })
      .slice(0, limit);

    // Include a couple recent context facts
    const context = facts.filter((f) => f.kind === "context").slice(0, 2);
    const all = [...picked, ...context];
    if (!all.length) return "_No durable memory facts yet._";
    return all.map((f) => `- (${f.kind}) ${f.text}`).join("\n");
  }

  proposeExtraction(
    text: string,
    kind: MemoryKind = "personal",
    vehicleIds: string[] = [],
  ): { id: string; text: string } {
    const data = this.load();
    const item = {
      id: uuidv4(),
      text: text.trim(),
      kind,
      vehicleIds,
      proposedAt: new Date().toISOString(),
    };
    data.pending.push(item);
    this.save(data);
    return { id: item.id, text: item.text };
  }

  listPending(): z.infer<typeof StoreSchema>["pending"] {
    return this.load().pending;
  }

  confirmPending(idPrefix?: string): MemoryFact | null {
    const data = this.load();
    if (!data.pending.length) return null;
    const idx = idPrefix
      ? data.pending.findIndex((p) => p.id.startsWith(idPrefix))
      : 0;
    if (idx < 0) return null;
    const [item] = data.pending.splice(idx, 1);
    if (!item) return null;
    this.save(data);
    return this.add({
      text: item.text,
      kind: item.kind,
      vehicleIds: item.vehicleIds,
      source: "extracted",
    });
  }

  rejectPending(idPrefix?: string): boolean {
    const data = this.load();
    if (!data.pending.length) return false;
    if (!idPrefix) {
      data.pending.shift();
      this.save(data);
      return true;
    }
    const before = data.pending.length;
    data.pending = data.pending.filter((p) => !p.id.startsWith(idPrefix));
    this.save(data);
    return data.pending.length < before;
  }

  /**
   * Heuristic high-impact extraction candidates from a user/assistant turn.
   * Returns proposals the CLI can ask the user to confirm.
   */
  suggestFromTurn(userMessage: string, assistantResponse: string, vehicleIds: string[]): string[] {
    const corpus = `${userMessage}\n${assistantResponse}`;
    const suggestions: string[] = [];

    const prefer = corpus.match(
      /\b(?:i (?:always|usually|prefer|never)|please (?:always|never)|my (?:rule|preference) is)\b[^.!\n]{8,120}/i,
    );
    if (prefer) suggestions.push(prefer[0].trim());

    const vin = corpus.match(/\bVIN[:\s]+([A-HJ-NPR-Z0-9]{11,17})\b/i);
    if (vin) suggestions.push(`VIN on file: ${vin[1]}`);

    const miles = userMessage.match(/\b(\d{2,3},\d{3}|\d{4,6})\s*(?:miles|mi)\b/i);
    if (miles && vehicleIds.length) {
      suggestions.push(`User reported mileage around ${miles[1]} mi`);
    }

    return [...new Set(suggestions)].slice(0, 2);
  }
}
