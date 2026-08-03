import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ensureDataDirs, type DataPaths } from "../config/config.js";
import { scoreRelevance } from "../data/relevance.js";

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
  pinned: z.boolean().default(false),
  importance: z.number().min(0).max(1).default(0.5),
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
    return (kind ? facts.filter((f) => f.kind === kind) : facts).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }

  add(input: {
    text: string;
    kind: MemoryKind;
    vehicleIds?: string[];
    tags?: string[];
    source?: MemoryFact["source"];
    pinned?: boolean;
    importance?: number;
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
      pinned: input.pinned ?? false,
      importance: input.importance ?? (input.source === "user" ? 0.7 : 0.5),
    });
    const data = this.load();
    // Dedup near-identical text
    const norm = fact.text.toLowerCase();
    if (data.facts.some((f) => f.text.toLowerCase() === norm)) {
      return data.facts.find((f) => f.text.toLowerCase() === norm)!;
    }
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
    if (before - data.facts.length > 3 && idOrText.length < 8) {
      return false;
    }
    this.save(data);
    return data.facts.length < before;
  }

  pin(idPrefix: string, pinned = true): MemoryFact | null {
    const data = this.load();
    const fact = data.facts.find((f) => f.id.startsWith(idPrefix));
    if (!fact) return null;
    fact.pinned = pinned;
    fact.updatedAt = new Date().toISOString();
    if (pinned) fact.importance = Math.max(fact.importance, 0.85);
    this.save(data);
    return fact;
  }

  /** Drop lowest-value unpinned facts when over soft cap. */
  prune(opts: { maxFacts?: number } = {}): number {
    const max = opts.maxFacts ?? 200;
    const data = this.load();
    if (data.facts.length <= max) return 0;
    const pinned = data.facts.filter((f) => f.pinned);
    const free = data.facts
      .filter((f) => !f.pinned)
      .sort((a, b) => {
        const sa = a.importance + (a.kind === "context" ? -0.2 : 0);
        const sb = b.importance + (b.kind === "context" ? -0.2 : 0);
        if (sa !== sb) return sa - sb;
        return a.updatedAt.localeCompare(b.updatedAt);
      });
    const keepFree = Math.max(0, max - pinned.length);
    const keptFree = free.slice(-keepFree);
    const before = data.facts.length;
    data.facts = [...pinned, ...keptFree];
    this.save(data);
    return before - data.facts.length;
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
        const pin = f.pinned ? " · PINNED" : "";
        return `• [${scope}] ${f.text}\n  id: ${f.id.slice(0, 8)} · ${f.source}${pin}`;
      })
      .join("\n");
  }

  /**
   * Compact injection for prompts — relevance + pinned first, never dump everything.
   */
  promptSummary(
    vehicleIds: string[] = [],
    opts: { query?: string; limit?: number } | number = 10,
  ): string {
    const limit = typeof opts === "number" ? opts : (opts.limit ?? 10);
    const query = typeof opts === "number" ? "" : (opts.query ?? "");
    const facts = this.list();
    const vehicleSet = new Set(vehicleIds);

    const eligible = facts.filter((f) => {
      if (f.kind === "vehicle") {
        return f.vehicleIds.some((id) => vehicleSet.has(id)) || !f.vehicleIds.length;
      }
      return true;
    });

    const scored = eligible.map((f) => {
      let score = f.importance + (f.pinned ? 2 : 0);
      if (f.kind === "personal") score += 0.3;
      if (f.kind === "context") score -= 0.4;
      if (query) score += scoreRelevance(query, f.text) * 3;
      // Recency boost
      const ageDays =
        (Date.now() - Date.parse(f.updatedAt)) / (1000 * 60 * 60 * 24);
      if (ageDays < 14) score += 0.2;
      return { f, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const pinned = scored.filter((x) => x.f.pinned).slice(0, Math.min(4, limit));
    const rest = scored
      .filter((x) => !x.f.pinned && (x.f.kind !== "context" || x.score > 0.8))
      .slice(0, Math.max(0, limit - pinned.length));
    const all = [...pinned, ...rest].map((x) => x.f);

    if (!all.length) return "_No durable memory facts yet._";
    return all
      .map((f) => `- (${f.kind}${f.pinned ? ",pinned" : ""}) ${f.text}`)
      .join("\n");
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
      importance: 0.65,
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
   * Stronger filters to reduce memory bloat.
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

    const oil = userMessage.match(
      /\b(?:i use|prefer|always use)\s+([A-Za-z0-9][\w\s-]{2,40}(?:oil|fluid|coolant))/i,
    );
    if (oil) suggestions.push(`Fluid preference: ${oil[0].trim()}`);

    // Skip low-value chatter
    return [...new Set(suggestions)]
      .filter((s) => s.length >= 12 && !/\b(hello|thanks|ok)\b/i.test(s))
      .slice(0, 2);
  }
}
