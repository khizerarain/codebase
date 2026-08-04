import type { Agent } from "../agent/agent.js";
import type { DataPaths } from "../config/config.js";
import type { TasteManager } from "../taste/taste.js";
import { friendlyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { DiagnosticWorkflow } from "../workflows/diagnostics.js";
import { formatDueReport } from "../workflows/due.js";
import {
  buildInspectionChecklist,
  buildPrepBrief,
  buildServicePlan,
  saveServicePlanExport,
} from "../workflows/servicePlans.js";

export interface Phase6Handlers {
  diagnostics: DiagnosticWorkflow;
}

export function createPhase6(paths: DataPaths, taste: TasteManager, agent: Agent): Phase6Handlers {
  return {
    diagnostics: new DiagnosticWorkflow(paths, taste, agent.knowledge),
  };
}

export async function handleDiagnoseCommand(
  line: string,
  handlers: Phase6Handlers,
  vehicles: VehicleStore,
  agent: Agent,
): Promise<"collecting" | "done"> {
  const symptomsRaw = line.replace(/^\/diagnose\s*/, "").trim();
  const vehicle = vehicles.getActive();

  if (!symptomsRaw) {
    logger.warn(
      "Usage: /diagnose <symptoms>   e.g. /diagnose squeal on braking when cold",
    );
    logger.dim("Or describe the problem, then answer clarifying questions.");
    return "done";
  }

  if (/^cancel$/i.test(symptomsRaw)) {
    handlers.diagnostics.cancel();
    logger.info("Diagnostic session cancelled.");
    return "done";
  }

  const step = await handlers.diagnostics.start(symptomsRaw, vehicle);
  if (step.type === "questions") {
    logger.section("Diagnosis");
    console.log(step.content + "\n");
    return "collecting";
  }

  agent.setLastExportable(step.content, "diagnosis");
  logger.agent(step.content);
  logger.dim("Saved under exports/ · /export diagnosis");
  return "done";
}

export async function continueDiagnosis(
  answer: string,
  handlers: Phase6Handlers,
  vehicles: VehicleStore,
  agent: Agent,
): Promise<"collecting" | "done"> {
  const step = await handlers.diagnostics.continueWith(
    answer,
    vehicles.getActive(),
  );
  if (step.session.id === "cancelled") {
    logger.info(step.content);
    return "done";
  }
  if (step.type === "questions") {
    console.log("\n" + step.content + "\n");
    return "collecting";
  }
  agent.setLastExportable(step.content, "diagnosis");
  logger.agent(step.content);
  logger.dim("Saved under exports/ · /export diagnosis");
  return "done";
}

export function handleServiceCommand(
  line: string,
  vehicles: VehicleStore,
  taste: TasteManager,
  agent: Agent,
  paths: DataPaths,
): void {
  const job = line.replace(/^\/service\s*/, "").trim();
  if (!job) {
    logger.warn("Usage: /service <job>   e.g. /service front brake pads");
    return;
  }

  const vehicle = vehicles.getActive();
  const { plan, markdown } = buildServicePlan(job, vehicle, taste, agent.knowledge);
  const file = saveServicePlanExport(paths, markdown);
  agent.setLastExportable(markdown, "service");
  agent.exports.service = markdown;

  agent.adoptPlan({
    title: plan.title,
    goal: `Carry out service/repair: ${job}\n\nFollow the service plan already generated (parts, tools, steps).`,
    steps: [
      "Review the service plan parts/tools list",
      ...plan.steps.slice(0, 5),
      "Log completion with /log",
    ],
    mode: "maintenance",
    vehicleId: vehicle?.id,
  });

  logger.agent(markdown);
  logger.success(`Service plan saved: ${file}`);
  logger.dim("Plan ready for /approve · /revise <feedback> · /export service");
}

export function handlePrepCommand(
  line: string,
  vehicles: VehicleStore,
  taste: TasteManager,
  agent: Agent,
): void {
  const job = line.replace(/^\/prep\s*/, "").trim();
  if (!job) {
    logger.warn("Usage: /prep <job>   e.g. /prep oil change");
    return;
  }
  const md = buildPrepBrief(job, vehicles.getActive(), taste, agent.knowledge);
  agent.setLastExportable(md, "checklist");
  logger.agent(md);
}

export function handleInspectCommand(
  line: string,
  vehicles: VehicleStore,
  agent: Agent,
  onPrePurchase?: () => void,
): void {
  const arg = line.replace(/^\/inspect\s*/, "").trim().toLowerCase();
  const kind = arg.includes("pre") || arg.includes("purchase") ? "pre-purchase" : "periodic";
  if (kind === "pre-purchase" && onPrePurchase) {
    onPrePurchase();
    return;
  }
  const md = buildInspectionChecklist(kind, vehicles.getActive());
  agent.setLastExportable(md, "checklist");
  logger.agent(md);
}

export function handleDueCommand(
  line: string,
  vehicles: VehicleStore,
  taste: TasteManager,
  agent: Agent,
): void {
  const arg = line.replace(/^\/due\s*/, "").trim().toLowerCase();
  const garage = arg === "garage" || arg === "all";
  const report = formatDueReport(vehicles, taste, { garage });
  agent.setLastExportable(report, "schedule");
  logger.agent(report);
}

export function handleLogCommand(
  line: string,
  vehicles: VehicleStore,
): void {
  // /log <description> [mileage] [cost] [diy|shop]
  const rest = line.replace(/^\/log\s*/, "").trim();
  if (!rest) {
    logger.warn(
      'Usage: /log <description> [mileage] [cost] [diy|shop]\nExample: /log "Oil + filter" 93000 65 diy',
    );
    return;
  }

  const active = vehicles.getActive();
  if (!active) {
    logger.warn("No active vehicle. /vehicles add … or /vehicles switch <id>");
    return;
  }

  try {
    const parsed = parseLogLine(rest, active.currentMileage);
    vehicles.addServiceRecord(active.id, {
      date: new Date().toISOString().slice(0, 10),
      mileage: parsed.mileage,
      description: parsed.description,
      cost: parsed.cost,
      diy: parsed.diy,
      parts: parsed.parts,
    });
    if (parsed.mileage > active.currentMileage) {
      vehicles.update(active.id, { currentMileage: parsed.mileage });
    }
    logger.success(
      `Logged on ${active.year} ${active.make} ${active.model}: ${parsed.description}` +
        (parsed.cost != null ? ` ($${parsed.cost})` : "") +
        (parsed.diy === true ? " · DIY" : parsed.diy === false ? " · shop" : ""),
    );
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

function parseLogLine(
  rest: string,
  fallbackMileage: number,
): {
  description: string;
  mileage: number;
  cost?: number;
  diy?: boolean;
  parts: string[];
} {
  // Support quoted description
  let description = rest;
  let tail = "";
  const q = rest.match(/^"([^"]+)"\s*(.*)$/) || rest.match(/^'([^']+)'\s*(.*)$/);
  if (q) {
    description = q[1]!;
    tail = q[2] ?? "";
  } else {
    const parts = rest.split(/\s+/);
    // Find trailing mileage/cost/diy tokens from the end
    const consumed: string[] = [];
    while (parts.length) {
      const last = parts[parts.length - 1]!;
      if (/^\d+(\.\d+)?$/.test(last) || /^(diy|shop)$/i.test(last) || /^\$?\d+(\.\d+)?$/.test(last)) {
        consumed.unshift(parts.pop()!);
      } else break;
    }
    description = parts.join(" ").trim() || rest;
    tail = consumed.join(" ");
  }

  let mileage = fallbackMileage;
  let cost: number | undefined;
  let diy: boolean | undefined;
  const tokens = tail.split(/\s+/).filter(Boolean);

  for (const tok of tokens) {
    if (/^(diy)$/i.test(tok)) diy = true;
    else if (/^(shop)$/i.test(tok)) diy = false;
    else if (/^\$?\d+(\.\d+)?$/.test(tok)) {
      const n = Number(tok.replace("$", ""));
      // Heuristic: 4+ digit → mileage, else cost (unless mileage not set from a larger number)
      if (n >= 1000) mileage = Math.round(n);
      else cost = n;
    }
  }

  // If two numbers and we only assigned one mileage, second small is cost — already handled
  // If description still empty
  if (!description) throw new Error("Missing service description");

  return { description, mileage, cost, diy, parts: [] };
}
