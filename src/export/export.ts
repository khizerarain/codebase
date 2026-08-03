import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { DataPaths } from "../config/config.js";
import { planToMarkdown, type Plan } from "../plans/plans.js";

export const ExportKindSchema = z.enum([
  "plan",
  "schedule",
  "checklist",
  "diagnosis",
  "service",
  "last",
  "txt",
]);
export type ExportKind = z.infer<typeof ExportKindSchema>;

export const ExportFormatSchema = z.enum(["md", "txt"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export interface ExportBuffers {
  last: string;
  plan?: string;
  schedule?: string;
  checklist?: string;
  diagnosis?: string;
  service?: string;
}

export interface ExportResult {
  path: string;
  kind: ExportKind;
  format: ExportFormat;
  bytes: number;
}

export function rememberExport(
  buffers: ExportBuffers,
  content: string,
  hint?: string,
): void {
  buffers.last = content;
  const h = `${hint ?? ""}\n${content}`.toLowerCase();
  if (/maintenance schedule|due_soon|overdue/.test(h)) {
    buffers.schedule = content;
  }
  if (/diagnostic|possible causes|symptoms:|diagnostic report/.test(h)) {
    buffers.diagnosis = content;
  }
  if (/service plan|procedure outline|job prep/.test(h) || hint === "service") {
    buffers.service = content;
  }
  if (/\[ \]|checklist|# .*\n\n1\. \[/.test(content) || /checklist/.test(h)) {
    buffers.checklist = content;
  }
  if (/^Plan:|Status: awaiting_approval|## Steps/.test(content)) {
    buffers.plan = content;
  }
}

export function exportContent(
  paths: DataPaths,
  buffers: ExportBuffers,
  kindRaw: string,
  format: ExportFormat = "md",
  pendingPlan?: Plan | null,
): ExportResult {
  const kind = normalizeKind(kindRaw);
  let content = pickContent(buffers, kind, pendingPlan);
  if (!content?.trim()) {
    throw new Error(
      `Nothing to export for "${kind}". Generate a ${kind === "last" ? "response" : kind} first.`,
    );
  }

  if (format === "txt") {
    content = toPlainText(content);
  }

  mkdirSync(paths.exports, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join(paths.exports, `${kind}-${stamp}.${format}`);
  writeFileSync(file, content, "utf8");
  return { path: file, kind, format, bytes: Buffer.byteLength(content, "utf8") };
}

function normalizeKind(raw: string): ExportKind {
  const t = raw.trim().toLowerCase() || "last";
  if (t === "diagnostic" || t === "diagnose") return "diagnosis";
  if (t === "text" || t === "plain") return "txt";
  const parsed = ExportKindSchema.safeParse(t);
  if (parsed.success) return parsed.data;
  // custom filename-ish → treat as last with that used only as kind label via last
  return "last";
}

function pickContent(
  buffers: ExportBuffers,
  kind: ExportKind,
  pendingPlan?: Plan | null,
): string {
  switch (kind) {
    case "plan":
      if (pendingPlan) return planToMarkdown(pendingPlan);
      return buffers.plan ?? buffers.last;
    case "schedule":
      return buffers.schedule ?? buffers.last;
    case "checklist":
      return buffers.checklist ?? buffers.last;
    case "diagnosis":
      return buffers.diagnosis ?? buffers.last;
    case "service":
      return buffers.service ?? buffers.plan ?? buffers.last;
    case "txt":
      return buffers.last;
    case "last":
    default:
      return buffers.last;
  }
}

function toPlainText(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}
