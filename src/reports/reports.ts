import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { DataPaths } from "../config/config.js";
import type { ExportBuffers } from "../export/export.js";
import {
  buildOwnershipDecision,
  buildPrePurchaseReport,
} from "../ownership/decision.js";
import { OwnershipEngine } from "../ownership/engine.js";
import type { TasteManager } from "../taste/taste.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { formatDueReport } from "../workflows/due.js";
import type { ModRegistry } from "../mods/registry.js";

export const ReportKindSchema = z.enum([
  "health",
  "diagnostic",
  "service",
  "ownership",
  "costs",
  "prepurchase",
  "garage",
  "decision",
]);
export type ReportKind = z.infer<typeof ReportKindSchema>;

export interface ReportContext {
  paths: DataPaths;
  vehicles: VehicleStore;
  taste: TasteManager;
  ownership: OwnershipEngine;
  exports: ExportBuffers;
  mods?: ModRegistry;
  /** Optional args after /report <kind> */
  args?: string;
}

export interface SavedReport {
  kind: ReportKind;
  path: string;
  markdown: string;
  bytes: number;
}

const DISCLAIMER = [
  "---",
  "",
  "**Disclaimer:** Codebase is a local decision-support tool — not a certified mechanic,",
  "appraiser, or financial advisor. Verify critical specs with OEM information.",
  "Diagnoses and ownership scores are heuristics from your local data only.",
].join("\n");

export function listReportKinds(): string {
  return [
    "Report kinds",
    "────────────",
    "health        Vehicle health report (active)",
    "diagnostic    Last / saved diagnostic narrative",
    "service       Last / saved service plan",
    "ownership     Ownership cost + reliability + predictions",
    "costs         Alias for ownership cost focus",
    "prepurchase   Pre-purchase style report",
    "garage        Garage summary report",
    "decision      buy|keep|sell framing for active vehicle",
    "",
    "Usage: /report <kind>   ·   saved under exports/reports/",
  ].join("\n");
}

export function generateReport(kindRaw: string, ctx: ReportContext): SavedReport {
  const kind = normalizeKind(kindRaw);
  const date = new Date().toISOString().slice(0, 10);
  const active = ctx.vehicles.getActive();
  const vehicleLine = active
    ? `${active.year} ${active.make} ${active.model} · ${active.currentMileage.toLocaleString()} mi · id:${active.id.slice(0, 8)}`
    : "No active vehicle";

  let body: string;
  switch (kind) {
    case "health": {
      const snap = ctx.ownership.activeOrThrow();
      body = [
        "# Vehicle Health Report",
        "",
        meta(date, vehicleLine, ctx.taste),
        "",
        ctx.ownership.formatVehicleReport(snap),
        "",
        "## Due / schedule snapshot",
        formatDueReport(ctx.vehicles, ctx.taste, { garage: false }),
      ].join("\n");
      break;
    }
    case "diagnostic": {
      const src = ctx.exports.diagnosis ?? ctx.exports.last;
      if (!src?.trim()) {
        throw new Error("No diagnostic content yet. Run /diagnose first.");
      }
      body = [
        "# Diagnostic Report",
        "",
        meta(date, vehicleLine, ctx.taste),
        "",
        src.trim(),
      ].join("\n");
      break;
    }
    case "service": {
      const src = ctx.exports.service ?? ctx.exports.plan ?? ctx.exports.last;
      if (!src?.trim()) {
        throw new Error("No service plan yet. Run /service <job> first.");
      }
      body = [
        "# Service Plan Report",
        "",
        meta(date, vehicleLine, ctx.taste),
        "",
        src.trim(),
      ].join("\n");
      break;
    }
    case "ownership":
    case "costs": {
      const snap = ctx.ownership.activeOrThrow();
      body = [
        "# Ownership Cost Report",
        "",
        meta(date, vehicleLine, ctx.taste),
        "",
        ctx.ownership.formatVehicleReport(snap),
        "",
        "## Cost focus",
        `- Logged parts+service: $${snap.cost.loggedPartsAndService.toFixed(2)}`,
        `- Estimated labor share: $${snap.cost.estimatedLaborShare.toFixed(2)}`,
        `- Cost per mile: ${snap.cost.costPerMile != null ? `$${snap.cost.costPerMile.toFixed(4)}` : "n/a"}`,
        `- Records with cost: ${snap.cost.recordsWithCost} / ${snap.cost.recordCount}`,
        "",
        "Log more priced services with `/log \"…\" <mi> <cost>` to sharpen this report.",
      ].join("\n");
      break;
    }
    case "prepurchase": {
      body = [
        "# Pre-Purchase Style Report",
        "",
        meta(date, vehicleLine, ctx.taste),
        "",
        buildPrePurchaseReport(active, ctx.taste, ctx.ownership),
      ].join("\n");
      break;
    }
    case "garage": {
      const overview = ctx.ownership.garageOverview();
      body = [
        "# Garage Summary Report",
        "",
        meta(date, `${overview.vehicleCount} vehicle(s)`, ctx.taste),
        "",
        ctx.ownership.formatGarageReport(overview),
        "",
        "## Garage due horizon",
        formatDueReport(ctx.vehicles, ctx.taste, { garage: true, horizonMiles: 10000 }),
      ].join("\n");
      break;
    }
    case "decision": {
      const frameRaw = (ctx.args ?? "keep").trim().toLowerCase();
      const frame =
        frameRaw === "buy" || frameRaw === "sell" || frameRaw === "keep"
          ? frameRaw
          : "keep";
      body = buildOwnershipDecision(
        frame,
        ctx.vehicles,
        ctx.taste,
        ctx.ownership,
      );
      body = `# Decision Support Report (${frame})\n\n${meta(date, vehicleLine, ctx.taste)}\n\n${body}`;
      break;
    }
    default:
      throw new Error(`Unknown report kind: ${kindRaw}`);
  }

  // Apply optional mod report template wrapper
  if (ctx.mods) {
    const wrapped = ctx.mods.applyReportTemplate(kind, body, {
      date,
      vehicle: vehicleLine,
    });
    if (wrapped) body = wrapped;
  }

  const markdown = ensureDisclaimer(body);
  return saveReport(ctx.paths, kind, markdown);
}

export function saveReport(
  paths: DataPaths,
  kind: string,
  markdown: string,
): SavedReport {
  mkdirSync(paths.reports, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join(paths.reports, `${kind}-${stamp}.md`);
  writeFileSync(file, markdown, "utf8");
  return {
    kind: kind as ReportKind,
    path: file,
    markdown,
    bytes: Buffer.byteLength(markdown, "utf8"),
  };
}

function normalizeKind(raw: string): ReportKind {
  const t = raw.trim().toLowerCase();
  if (t === "cost" || t === "costs") return "costs";
  if (t === "pre-purchase" || t === "ppi" || t === "pre_purchase") return "prepurchase";
  if (t === "diagnose" || t === "diagnosis") return "diagnostic";
  if (t === "health-report") return "health";
  const parsed = ReportKindSchema.safeParse(t);
  if (!parsed.success) {
    throw new Error(`Unknown report kind "${raw}".\n\n${listReportKinds()}`);
  }
  return parsed.data;
}

function meta(date: string, vehicleLine: string, taste: TasteManager): string {
  const tasteBits = taste
    .compactTasteSummary()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((l) => `- ${l.replace(/^[-*]\s*/, "")}`)
    .join("\n");
  return [
    `**Date:** ${date}`,
    `**Vehicle / scope:** ${vehicleLine}`,
    "",
    "**Taste context (compact):**",
    tasteBits || "- _(none yet)_",
  ].join("\n");
}

function ensureDisclaimer(md: string): string {
  if (/Disclaimer:/i.test(md)) return md.trim() + "\n";
  return `${md.trim()}\n\n${DISCLAIMER}\n`;
}
