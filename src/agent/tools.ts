import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { DataPaths } from "../config/config.js";
import type { KnowledgeBase } from "../knowledge/knowledge.js";
import type { LongTermMemory } from "../memory/longterm.js";
import type { ModRegistry } from "../mods/registry.js";
import { OwnershipEngine } from "../ownership/engine.js";
import type { TasteManager } from "../taste/taste.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { computeMaintenanceItems } from "../workflows/maintenance.js";
import {
  formatChecklist,
  formatCostBreakdown,
  formatDiagnostic,
  formatMaintenanceTable,
  formatPartsComparison,
  type CostLine,
} from "./outputs.js";
import { looksSafetyCritical } from "./safety.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  ok: boolean;
  output: string;
}

export interface ToolContext {
  vehicles: VehicleStore;
  taste: TasteManager;
  paths: DataPaths;
  knowledge?: KnowledgeBase;
  longTerm?: LongTermMemory;
  mods?: ModRegistry;
}

const SearchWebSchema = z.object({ query: z.string().min(1) });
const PathSchema = z.object({ path: z.string().min(1) });
const WriteFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});
const CalculateSchema = z.object({ expression: z.string().min(1) });
const GetVehicleSchema = z.object({
  id: z.string().optional(),
});
const UpdateVehicleSchema = z.object({
  id: z.string().optional(),
  currentMileage: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  modifications: z.array(z.string()).optional(),
  knownIssues: z.array(z.string()).optional(),
  trim: z.string().optional(),
  engine: z.string().optional(),
  transmission: z.string().optional(),
  drivetrain: z.string().optional(),
  fuelType: z.enum(["gas", "diesel", "hybrid", "ev", "other"]).optional(),
  vin: z.string().optional(),
  addModification: z.string().optional(),
  addKnownIssue: z.string().optional(),
});
const CreateChecklistSchema = z.object({
  title: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
});
const EstimateCostSchema = z.object({
  title: z.string().min(1),
  lines: z
    .array(
      z.object({
        name: z.string(),
        partsLow: z.number().nonnegative(),
        partsHigh: z.number().nonnegative(),
        laborHours: z.number().nonnegative().optional(),
        laborRate: z.number().nonnegative().optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1),
  laborRate: z.number().nonnegative().optional(),
});
const SearchRecallsSchema = z.object({
  query: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
});
const MaintenanceScheduleSchema = z.object({
  vehicleId: z.string().optional(),
  horizonMiles: z.number().positive().default(15000),
});
const ComparePartsSchema = z.object({
  title: z.string().min(1),
  part: z.string().min(1),
  oemNotes: z.string().optional(),
  aftermarketNotes: z.string().optional(),
  budgetNotes: z.string().optional(),
});
const DiagnoseSchema = z.object({
  symptoms: z.array(z.string()).min(1),
  notes: z.string().optional(),
});
const SearchKnowledgeSchema = z.object({
  query: z.string().min(1),
  vehicleId: z.string().optional(),
});

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_web",
    description: "Search the web for vehicle maintenance, parts, specs, or diagnostics.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "read_file",
    description: "Read a local text file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a local text file (plans, checklists, exports).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_dir",
    description: "List files in a local directory.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "calculate",
    description: "Evaluate a safe arithmetic expression.",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
    },
  },
  {
    name: "get_vehicle",
    description: "Load a full vehicle profile (defaults to active vehicle).",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
    },
  },
  {
    name: "update_vehicle",
    description: "Update mileage, notes, modifications, issues, or specs on a vehicle.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        currentMileage: { type: "number" },
        notes: { type: "string" },
        modifications: { type: "array", items: { type: "string" } },
        knownIssues: { type: "array", items: { type: "string" } },
        addModification: { type: "string" },
        addKnownIssue: { type: "string" },
        fuelType: { type: "string" },
        engine: { type: "string" },
        trim: { type: "string" },
      },
    },
  },
  {
    name: "create_checklist",
    description: "Generate an actionable step-by-step checklist.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
      },
      required: ["title", "steps"],
    },
  },
  {
    name: "estimate_cost",
    description: "Rough parts + labor cost estimation with ranges.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        laborRate: { type: "number" },
        lines: { type: "array" },
      },
      required: ["title", "lines"],
    },
  },
  {
    name: "search_recalls_tsb",
    description: "Search for recalls and technical service bulletins for a vehicle.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        make: { type: "string" },
        model: { type: "string" },
        year: { type: "number" },
      },
    },
  },
  {
    name: "generate_maintenance_schedule",
    description: "Create a mileage-based maintenance schedule for a vehicle.",
    parameters: {
      type: "object",
      properties: {
        vehicleId: { type: "string" },
        horizonMiles: { type: "number" },
      },
    },
  },
  {
    name: "compare_parts",
    description: "Compare OEM vs aftermarket/budget options using user taste.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        part: { type: "string" },
        oemNotes: { type: "string" },
        aftermarketNotes: { type: "string" },
        budgetNotes: { type: "string" },
      },
      required: ["title", "part"],
    },
  },
  {
    name: "diagnose_symptoms",
    description: "Structure diagnostic reasoning from symptoms (suggestions only).",
    parameters: {
      type: "object",
      properties: {
        symptoms: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["symptoms"],
    },
  },
  {
    name: "search_knowledge",
    description:
      "Search the user's local knowledge base (manuals, notes, PDFs). Results are labeled as USER DOCUMENT.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        vehicleId: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "ownership_insights",
    description:
      "Local ownership health, cost/mi, reliability, and due predictions for a vehicle or the garage.",
    parameters: {
      type: "object",
      properties: {
        garage: { type: "boolean" },
        vehicleId: { type: "string" },
      },
    },
  },
  {
    name: "mod_lookup",
    description:
      "Look up a declarative local mod tool by name (Markdown/JSON only — no remote code).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_web": {
        const { query } = SearchWebSchema.parse(args);
        return { name, ok: true, output: await searchWeb(query) };
      }
      case "read_file": {
        const { path } = PathSchema.parse(args);
        return { name, ok: true, output: readFileTool(path) };
      }
      case "write_file": {
        const { path, content } = WriteFileSchema.parse(args);
        return { name, ok: true, output: writeFileTool(path, content, ctx.paths) };
      }
      case "list_dir": {
        const { path } = PathSchema.parse(args);
        return { name, ok: true, output: listDirTool(path) };
      }
      case "calculate": {
        const { expression } = CalculateSchema.parse(args);
        return { name, ok: true, output: calculateTool(expression) };
      }
      case "get_vehicle": {
        const { id } = GetVehicleSchema.parse(args);
        return { name, ok: true, output: getVehicleTool(ctx, id) };
      }
      case "update_vehicle": {
        const patch = UpdateVehicleSchema.parse(args);
        return { name, ok: true, output: updateVehicleTool(ctx, patch) };
      }
      case "create_checklist": {
        const data = CreateChecklistSchema.parse(args);
        return {
          name,
          ok: true,
          output: formatChecklist(data.title, data.steps),
        };
      }
      case "estimate_cost": {
        const data = EstimateCostSchema.parse(args);
        return {
          name,
          ok: true,
          output: formatCostBreakdown(
            data.title,
            data.lines as CostLine[],
            data.laborRate ?? 140,
          ),
        };
      }
      case "search_recalls_tsb": {
        const data = SearchRecallsSchema.parse(args);
        return { name, ok: true, output: await searchRecallsTsb(ctx, data) };
      }
      case "generate_maintenance_schedule": {
        const data = MaintenanceScheduleSchema.parse(args);
        return {
          name,
          ok: true,
          output: generateMaintenanceSchedule(ctx, data.vehicleId, data.horizonMiles),
        };
      }
      case "compare_parts": {
        const data = ComparePartsSchema.parse(args);
        return { name, ok: true, output: comparePartsTool(ctx, data) };
      }
      case "diagnose_symptoms": {
        const data = DiagnoseSchema.parse(args);
        return { name, ok: true, output: diagnoseTool(data.symptoms, data.notes) };
      }
      case "search_knowledge": {
        const data = SearchKnowledgeSchema.parse(args);
        if (!ctx.knowledge) {
          return { name, ok: false, output: "Knowledge base not available." };
        }
        const vehicleIds = data.vehicleId
          ? [data.vehicleId]
          : ctx.vehicles.getActiveId()
            ? [ctx.vehicles.getActiveId()!]
            : [];
        return {
          name,
          ok: true,
          output: ctx.knowledge.search(data.query, { vehicleIds }),
        };
      }
      case "ownership_insights": {
        const garage = Boolean(args.garage);
        const vehicleId =
          typeof args.vehicleId === "string" ? args.vehicleId : undefined;
        const engine = new OwnershipEngine(ctx.vehicles, ctx.taste);
        if (garage) {
          return {
            name,
            ok: true,
            output: engine.formatGarageReport(engine.garageOverview()),
          };
        }
        const v = vehicleId
          ? ctx.vehicles.get(vehicleId)
          : ctx.vehicles.getActive();
        if (!v) {
          return { name, ok: false, output: "No vehicle found for ownership insights." };
        }
        return {
          name,
          ok: true,
          output: engine.formatVehicleReport(engine.analyzeVehicle(v)),
        };
      }
      case "mod_lookup": {
        const toolName = z.object({ name: z.string().min(1) }).parse(args).name;
        if (!ctx.mods) {
          return { name, ok: false, output: "Mods registry not available." };
        }
        const out = ctx.mods.lookupTool(toolName);
        if (!out) {
          return {
            name,
            ok: false,
            output: `No enabled mod tool named "${toolName}". Use /mods list.`,
          };
        }
        return { name, ok: true, output: out };
      }
      default:
        return { name, ok: false, output: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return {
      name,
      ok: false,
      output: err instanceof Error ? err.message : String(err),
    };
  }
}

async function searchWeb(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "Empty query.";

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "CodebaseCLI/0.3" },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      const lines: string[] = [`Query: ${q}`];
      if (data.AbstractText) {
        lines.push(`Summary: ${data.AbstractText}`);
        if (data.AbstractURL) lines.push(`Source: ${data.AbstractURL}`);
      }
      const related = (data.RelatedTopics ?? [])
        .filter((t) => t.Text)
        .slice(0, 6)
        .map((t) => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
      if (related.length) {
        lines.push("Related:");
        lines.push(...related);
      }
      if (lines.length > 1) {
        lines.push(
          "",
          "Note: Verify critical specs with OEM service information before acting.",
        );
        return lines.join("\n");
      }
    }
  } catch {
    // fall through
  }

  return [
    `Search results unavailable offline for: "${q}"`,
    "Suggested verification sources:",
    "- NHTSA recalls: https://www.nhtsa.gov/recalls",
    "- OEM service info / TSB portals",
    "- Haynes/Chilton or factory workshop manuals",
    "Frame queries as: year + make + model + symptom/part + TSB/recall",
  ].join("\n");
}

function readFileTool(path: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  const st = statSync(resolved);
  if (!st.isFile()) throw new Error(`Not a file: ${resolved}`);
  if (st.size > 400_000) throw new Error("File too large (>400KB)");
  return readFileSync(resolved, "utf8");
}

function writeFileTool(path: string, content: string, paths: DataPaths): string {
  const resolved = resolve(path);
  // Prefer writing under data root or cwd; block obvious system paths
  const allowedRoots = [paths.root, paths.exports, paths.plans, process.cwd()];
  const ok = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(root + "\\") || resolved.startsWith(root + "/"),
  );
  if (!ok) {
    // Still allow relative writes under cwd already covered; if not, write into exports
    const fallback = resolve(paths.exports, path.replace(/^[/\\]+/, ""));
    mkdirSync(dirname(fallback), { recursive: true });
    writeFileSync(fallback, content, "utf8");
    return `Wrote ${fallback} (${content.length} chars)`;
  }
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, content, "utf8");
  return `Wrote ${resolved} (${content.length} chars)`;
}

function listDirTool(path: string): string {
  const resolved = resolve(path || ".");
  if (!existsSync(resolved)) throw new Error(`Directory not found: ${resolved}`);
  if (!statSync(resolved).isDirectory()) throw new Error(`Not a directory: ${resolved}`);
  return readdirSync(resolved)
    .slice(0, 200)
    .map((name) => {
      try {
        const full = resolve(resolved, name);
        const st = statSync(full);
        return `${st.isDirectory() ? "dir " : "file"} ${name}`;
      } catch {
        return `?    ${name}`;
      }
    })
    .join("\n");
}

/** Safe arithmetic-only evaluator (no identifiers / functions). */
export function calculateTool(expression: string): string {
  const expr = expression.trim();
  if (!expr) throw new Error("Empty expression");
  if (!/^[\d\s.+\-*/()]+$/.test(expr)) {
    throw new Error("Only numbers and + - * / ( ) . are allowed");
  }
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${expr});`)() as unknown;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error("Expression did not evaluate to a finite number");
  }
  return String(result);
}

function getVehicleTool(ctx: ToolContext, id?: string): string {
  const v = id ? ctx.vehicles.get(id) : ctx.vehicles.getActive();
  if (!v) return "No vehicle found. Add one with /vehicles add …";
  return JSON.stringify(v, null, 2);
}

function updateVehicleTool(
  ctx: ToolContext,
  patch: z.infer<typeof UpdateVehicleSchema>,
): string {
  const id = patch.id ?? ctx.vehicles.getActiveId();
  if (!id) throw new Error("No active vehicle to update");
  const existing = ctx.vehicles.get(id);
  if (!existing) throw new Error(`Vehicle not found: ${id}`);

  const modifications = patch.modifications
    ? patch.modifications
    : patch.addModification
      ? [...existing.modifications, patch.addModification]
      : existing.modifications;
  const knownIssues = patch.knownIssues
    ? patch.knownIssues
    : patch.addKnownIssue
      ? [...existing.knownIssues, patch.addKnownIssue]
      : existing.knownIssues;

  const updated = ctx.vehicles.update(id, {
    currentMileage: patch.currentMileage,
    notes: patch.notes,
    modifications,
    knownIssues,
    trim: patch.trim,
    engine: patch.engine,
    transmission: patch.transmission,
    drivetrain: patch.drivetrain,
    fuelType: patch.fuelType,
    vin: patch.vin,
  });
  return ctx.vehicles.formatDetail(updated);
}

async function searchRecallsTsb(
  ctx: ToolContext,
  data: z.infer<typeof SearchRecallsSchema>,
): Promise<string> {
  const active = ctx.vehicles.getActive();
  const make = data.make ?? active?.make ?? "";
  const model = data.model ?? active?.model ?? "";
  const year = data.year ?? active?.year;
  const q =
    data.query?.trim() ||
    [year, make, model, "recall TSB"].filter(Boolean).join(" ");

  const web = await searchWeb(q);
  return [
    `Recalls / TSB search for: ${[year, make, model].filter(Boolean).join(" ") || "unspecified vehicle"}`,
    `Query: ${q}`,
    "",
    "Official sources to verify:",
    `- NHTSA: https://www.nhtsa.gov/recalls`,
    make ? `- NHTSA make search: https://www.nhtsa.gov/vehicle/${year ?? ""}/${encodeURIComponent(make)}/${encodeURIComponent(model)}` : null,
    "",
    "Web/search notes:",
    web,
    "",
    "These are leads only — confirm campaign/TSB IDs on official OEM/NHTSA pages.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function generateMaintenanceSchedule(
  ctx: ToolContext,
  vehicleId?: string,
  horizonMiles = 15000,
): string {
  const v = vehicleId ? ctx.vehicles.get(vehicleId) : ctx.vehicles.getActive();
  if (!v) return "No vehicle available. Add/select one first.";
  const items = computeMaintenanceItems(v, ctx.taste, horizonMiles);
  return formatMaintenanceTable(v, items);
}

function comparePartsTool(
  ctx: ToolContext,
  data: z.infer<typeof ComparePartsSchema>,
): string {
  const taste = ctx.taste.compactTasteSummary().toLowerCase();
  const skills = ctx.taste
    .listSkills()
    .map((s) => s.slug)
    .join(" ");

  const prefersOem = /oem/.test(taste) || skills.includes("oem-preferred");
  const prefersBudget = /budget/.test(taste) || skills.includes("budget-conscious");
  const prefersPerf =
    /performance/.test(taste) || skills.includes("performance-oriented");

  let recommendation: string;
  if (prefersOem && !prefersBudget) {
    recommendation = `Taste leans OEM — choose OEM/OE-quality for ${data.part} unless cost is a hard constraint.`;
  } else if (prefersBudget && !prefersOem) {
    recommendation = `Taste leans budget — start with a reputable value aftermarket for ${data.part}, upgrade if quality risk is high.`;
  } else if (prefersPerf) {
    recommendation = `Taste leans performance — consider performance aftermarket if reliability tradeoffs are acceptable for ${data.part}.`;
  } else {
    recommendation = `Balanced pick: OE-quality aftermarket or OEM for ${data.part}; avoid the cheapest no-name option on safety parts.`;
  }

  return formatPartsComparison({
    title: data.title,
    options: [
      {
        label: "OEM / Dealer",
        type: "oem",
        estCost: "Highest",
        pros: ["Fitment confidence", "Warranty path", data.oemNotes ?? "Known quality"].filter(Boolean),
        cons: ["Price", "Availability"],
        tasteFit: prefersOem ? "Strong fit" : "Neutral",
      },
      {
        label: "Reputable aftermarket",
        type: "aftermarket",
        estCost: "Mid",
        pros: ["Value", "Wide availability", data.aftermarketNotes ?? "Often OE supplier"].filter(Boolean),
        cons: ["Quality varies by brand"],
        tasteFit: !prefersOem && !prefersBudget ? "Strong fit" : "Good fit",
      },
      {
        label: "Budget option",
        type: "budget",
        estCost: "Lowest",
        pros: ["Low upfront cost", data.budgetNotes ?? "Ok for non-critical consumables"].filter(Boolean),
        cons: ["Higher failure risk", "False economy on safety parts"],
        tasteFit: prefersBudget ? "Strong fit" : "Weak fit for safety-critical parts",
      },
    ],
    recommendation,
  });
}

function diagnoseTool(symptoms: string[], notes?: string): string {
  const joined = `${symptoms.join(" ")} ${notes ?? ""}`.toLowerCase();
  const causes: Array<{
    cause: string;
    likelihood: "low" | "medium" | "high";
    checks: string[];
  }> = [];

  if (/rough idle|misfire|shake|vibration at idle/.test(joined)) {
    causes.push({
      cause: "Ignition/misfire (plugs, coils, injectors)",
      likelihood: "high",
      checks: ["Scan for misfire codes", "Inspect plugs/coils", "Check fuel trims"],
    });
    causes.push({
      cause: "Vacuum leak",
      likelihood: "medium",
      checks: ["Smoke test or spray test", "Inspect PCV/intake boots"],
    });
  }
  if (/brake|squeal|grinding|pedal soft|pedal hard/.test(joined)) {
    causes.push({
      cause: "Brake wear or hydraulic issue",
      likelihood: "high",
      checks: ["Pad/rotor thickness", "Fluid level/condition", "Leak inspection"],
    });
  }
  if (/overheat|temp|coolant/.test(joined)) {
    causes.push({
      cause: "Cooling system fault (thermo/stat, fans, pump, air)",
      likelihood: "high",
      checks: ["Coolant level", "Fan operation", "Thermostat temp", "Pressure test"],
    });
  }
  if (/battery|no start|click|electrical/.test(joined)) {
    causes.push({
      cause: "Battery / charging / starter circuit",
      likelihood: "high",
      checks: ["Battery voltage/load test", "Alternator output", "Grounds/terminals"],
    });
  }
  if (!causes.length) {
    causes.push({
      cause: "Insufficient symptom detail for ranked hypotheses",
      likelihood: "medium",
      checks: [
        "Capture when it happens (cold/hot/speed)",
        "Note warning lights / codes",
        "Recent work or fluid services",
      ],
    });
  }

  const seeProfessional =
    looksSafetyCritical(joined) || /grinding|overheat|no start|airbag/.test(joined);

  return formatDiagnostic({
    symptoms,
    possibleCauses: causes,
    recommendedActions: [
      "Gather freeze-frame / OBD codes if available (suggestion, not required to start inspection)",
      "Inspect the highest-likelihood easy checks first",
      ...(seeProfessional
        ? ["If safety systems are involved, prefer a professional inspection before continued driving"]
        : ["Re-test after each change so you know what fixed it"]),
    ],
    seeProfessional,
  });
}
