import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ensureDataDirs, type DataPaths } from "../config/config.js";

export const KnowledgeDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourcePath: z.string(),
  storedPath: z.string(),
  vehicleIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  addedAt: z.string(),
  chunkCount: z.number().int().nonnegative(),
  kind: z.enum(["markdown", "text", "pdf", "other"]).default("text"),
});

export type KnowledgeDoc = z.infer<typeof KnowledgeDocSchema>;

export const KnowledgeChunkSchema = z.object({
  id: z.string(),
  docId: z.string(),
  title: z.string(),
  text: z.string(),
  vehicleIds: z.array(z.string()).default([]),
  index: z.number().int().nonnegative(),
});

export type KnowledgeChunk = z.infer<typeof KnowledgeChunkSchema>;

const IndexSchema = z.object({
  docs: z.array(KnowledgeDocSchema).default([]),
  chunks: z.array(KnowledgeChunkSchema).default([]),
});

/** Local knowledge base: ingest manuals/notes and keyword-search chunks. */
export class KnowledgeBase {
  private readonly root: string;
  private readonly docsDir: string;
  private readonly indexFile: string;

  constructor(paths: DataPaths = ensureDataDirs()) {
    this.root = paths.knowledge;
    this.docsDir = join(this.root, "docs");
    this.indexFile = join(this.root, "index.json");
    mkdirSync(this.docsDir, { recursive: true });
  }

  private loadIndex(): z.infer<typeof IndexSchema> {
    if (!existsSync(this.indexFile)) return { docs: [], chunks: [] };
    try {
      return IndexSchema.parse(
        JSON.parse(readFileSync(this.indexFile, "utf8")) as unknown,
      );
    } catch {
      return { docs: [], chunks: [] };
    }
  }

  private saveIndex(index: z.infer<typeof IndexSchema>): void {
    writeFileSync(this.indexFile, JSON.stringify(index, null, 2), "utf8");
  }

  list(): KnowledgeDoc[] {
    return this.loadIndex().docs.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  formatList(): string {
    const docs = this.list();
    if (!docs.length) {
      return "No knowledge docs yet. Add with: /knowledge add <path> [vehicleId]";
    }
    return docs
      .map((d) => {
        const scope = d.vehicleIds.length
          ? `vehicle:${d.vehicleIds.map((id) => id.slice(0, 8)).join(",")}`
          : "global";
        return `• ${d.title} (${d.kind}) · ${scope} · ${d.chunkCount} chunks\n  id: ${d.id}\n  from: ${d.sourcePath}`;
      })
      .join("\n");
  }

  add(
    filePath: string,
    opts: { vehicleIds?: string[]; tags?: string[]; title?: string } = {},
  ): KnowledgeDoc {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) throw new Error(`File not found: ${resolved}`);

    const ext = extname(resolved).toLowerCase();
    const kind =
      ext === ".md" ? "markdown" : ext === ".txt" ? "text" : ext === ".pdf" ? "pdf" : "other";

    const text = extractText(resolved, kind);
    if (!text.trim()) {
      throw new Error(
        `Could not extract text from ${basename(resolved)}. Convert PDF to .txt/.md and try again.`,
      );
    }

    const id = uuidv4();
    const storedName = `${id}${ext || ".txt"}`;
    const storedPath = join(this.docsDir, storedName);
    copyFileSync(resolved, storedPath);

    const chunks = chunkText(text, 900).map((chunk, index) =>
      KnowledgeChunkSchema.parse({
        id: `${id}_${index}`,
        docId: id,
        title: opts.title ?? basename(resolved),
        text: chunk,
        vehicleIds: opts.vehicleIds ?? [],
        index,
      }),
    );

    const doc = KnowledgeDocSchema.parse({
      id,
      title: opts.title ?? basename(resolved),
      sourcePath: resolved,
      storedPath,
      vehicleIds: opts.vehicleIds ?? [],
      tags: opts.tags ?? [],
      addedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      kind,
    });

    const index = this.loadIndex();
    index.docs.push(doc);
    index.chunks.push(...chunks);
    this.saveIndex(index);
    return doc;
  }

  remove(idOrTitle: string): boolean {
    const index = this.loadIndex();
    const needle = idOrTitle.toLowerCase();
    const doc = index.docs.find(
      (d) => d.id === idOrTitle || d.id.startsWith(idOrTitle) || d.title.toLowerCase() === needle,
    );
    if (!doc) return false;
    index.docs = index.docs.filter((d) => d.id !== doc.id);
    index.chunks = index.chunks.filter((c) => c.docId !== doc.id);
    if (existsSync(doc.storedPath)) unlinkSync(doc.storedPath);
    this.saveIndex(index);
    return true;
  }

  /**
   * Rebuild chunk index from stored doc files; drop entries whose files are gone.
   */
  rebuildIndex(): { docs: number; chunks: number; removed: number } {
    const index = this.loadIndex();
    const keptDocs: KnowledgeDoc[] = [];
    const keptChunks: KnowledgeChunk[] = [];
    let removed = 0;

    for (const doc of index.docs) {
      if (!existsSync(doc.storedPath)) {
        removed += 1;
        continue;
      }
      try {
        const text = extractText(doc.storedPath, doc.kind);
        if (!text.trim()) {
          removed += 1;
          continue;
        }
        const chunks = chunkText(text, 900).map((chunk, i) =>
          KnowledgeChunkSchema.parse({
            id: `${doc.id}_${i}`,
            docId: doc.id,
            title: doc.title,
            text: chunk,
            vehicleIds: doc.vehicleIds,
            index: i,
          }),
        );
        keptDocs.push({ ...doc, chunkCount: chunks.length });
        keptChunks.push(...chunks);
      } catch {
        removed += 1;
      }
    }

    this.saveIndex({ docs: keptDocs, chunks: keptChunks });
    return { docs: keptDocs.length, chunks: keptChunks.length, removed };
  }

  /**
   * Keyword search over chunks. Returns clearly labeled user-document hits.
   */
  search(
    query: string,
    opts: { vehicleIds?: string[]; limit?: number } = {},
  ): string {
    const q = query.trim();
    if (!q) return "Empty knowledge query.";
    const tokens = tokenize(q);
    const index = this.loadIndex();
    if (!index.chunks.length) {
      return "Knowledge base is empty. Add manuals/notes with /knowledge add <path>.";
    }

    const vehicleFilter = new Set(opts.vehicleIds ?? []);
    const scored = index.chunks
      .filter((c) => {
        if (!vehicleFilter.size) return true;
        // global docs (no vehicle) always eligible; vehicle-linked must overlap
        if (!c.vehicleIds.length) return true;
        return c.vehicleIds.some((id) => vehicleFilter.has(id));
      })
      .map((c) => {
        const hay = c.text.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          if (hay.includes(t)) score += 2;
        }
        if (hay.includes(q.toLowerCase())) score += 5;
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 5);

    if (!scored.length) {
      return `No matches in local knowledge for: "${q}"\n(Source: user knowledge base — empty result)`;
    }

    const blocks = scored.map(({ c, score }, i) => {
      const doc = index.docs.find((d) => d.id === c.docId);
      return [
        `### Hit ${i + 1} · score ${score}`,
        `Source: USER DOCUMENT — ${doc?.title ?? c.title}`,
        doc ? `File: ${doc.sourcePath}` : null,
        c.vehicleIds.length
          ? `Linked vehicles: ${c.vehicleIds.map((id) => id.slice(0, 8)).join(", ")}`
          : "Scope: global",
        "",
        c.text.trim(),
      ]
        .filter(Boolean)
        .join("\n");
    });

    return [
      `Local knowledge search for: "${q}"`,
      "These excerpts are from YOUR documents (not general web knowledge).",
      "",
      ...blocks,
    ].join("\n\n");
  }
}

function extractText(path: string, kind: KnowledgeDoc["kind"]): string {
  const buf = readFileSync(path);
  if (kind === "markdown" || kind === "text" || kind === "other") {
    return buf.toString("utf8");
  }
  if (kind === "pdf") {
    return extractPdfText(buf.toString("latin1"));
  }
  return buf.toString("utf8");
}

/** Lightweight PDF text scrape (works for many text-based PDFs; not a full parser). */
function extractPdfText(raw: string): string {
  const bits: string[] = [];
  const re = /\((?:\\.|[^\\)]){2,}\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const inner = m[0].slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\(.)/g, "$1");
    if (/[a-zA-Z]{3,}/.test(inner)) bits.push(inner);
  }
  // Also pull Tj/TJ-adjacent plain runs
  const tj = raw.match(/\[(.*?)\]\s*TJ/gs) ?? [];
  for (const block of tj) {
    const parts = block.match(/\((?:\\.|[^\\)])*\)/g) ?? [];
    for (const p of parts) {
      const inner = p.slice(1, -1).replace(/\\(.)/g, "$1");
      if (/[a-zA-Z]{3,}/.test(inner)) bits.push(inner);
    }
  }
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function chunkText(text: string, size: number): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(i, end);
      const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "));
      if (breakAt > size * 0.4) end = i + breakAt + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end;
  }
  return chunks.filter(Boolean);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 2);
}
