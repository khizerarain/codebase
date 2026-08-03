import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withSafetyFooter, assessRisk } from "../agent/safety.js";
import type { DataPaths } from "../config/config.js";
import type { KnowledgeBase } from "../knowledge/knowledge.js";
import type { TasteManager } from "../taste/taste.js";
import type { Vehicle } from "../vehicles/vehicles.js";

export interface ServicePlan {
  title: string;
  job: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estHours: string;
  costLow: number;
  costHigh: number;
  parts: Array<{ name: string; oem?: string; aftermarket?: string; notes?: string }>;
  tools: string[];
  steps: string[];
  torqueNotes: string[];
  tasteReasoning: string;
  safetyNotes: string[];
}

type TasteBias = {
  diy: boolean;
  oem: boolean;
  budget: boolean;
  shop: boolean;
};

function tasteBias(taste: TasteManager): TasteBias {
  const t = taste.compactTasteSummary().toLowerCase();
  const skills = taste.listSkills().map((s) => s.slug);
  return {
    diy: /diy/.test(t) || skills.includes("diy-first"),
    oem: /oem/.test(t) || skills.includes("oem-preferred"),
    budget: /budget/.test(t) || skills.includes("budget-conscious"),
    shop: /shop/.test(t) || skills.includes("shop-preferred"),
  };
}

/** Build a full service/repair plan for a job description. */
export function buildServicePlan(
  jobRaw: string,
  vehicle: Vehicle | undefined,
  taste: TasteManager,
  knowledge?: KnowledgeBase,
): { plan: ServicePlan; markdown: string } {
  const job = jobRaw.trim() || "general service";
  const bias = tasteBias(taste);
  const template = matchTemplate(job, bias, vehicle);
  const knowledgeNotes = pullKnowledgeNotes(job, vehicle, knowledge);

  if (knowledgeNotes.length) {
    template.torqueNotes = [...template.torqueNotes, ...knowledgeNotes];
  }

  template.tasteReasoning = buildTasteReasoning(bias, template);

  const markdown = formatServicePlanMarkdown(template, vehicle);
  return { plan: template, markdown };
}

export function buildPrepBrief(
  job: string,
  vehicle: Vehicle | undefined,
  taste: TasteManager,
  knowledge?: KnowledgeBase,
): string {
  const { plan } = buildServicePlan(job, vehicle, taste, knowledge);
  return withSafetyFooter(
    [
      `# Job prep — ${plan.title}`,
      vehicle
        ? `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : "Vehicle: unspecified",
      "",
      "## Parts to stage",
      ...plan.parts.map(
        (p) =>
          `- [ ] ${p.name}${p.oem ? ` · OEM: ${p.oem}` : ""}${p.aftermarket ? ` · Alt: ${p.aftermarket}` : ""}${p.notes ? ` (${p.notes})` : ""}`,
      ),
      "",
      "## Tools to stage",
      ...plan.tools.map((t) => `- [ ] ${t}`),
      "",
      "## Key notes",
      ...plan.torqueNotes.map((n) => `- ${n}`),
      "",
      `Est. time: ${plan.estHours} · Difficulty ${plan.difficulty}/5 · Cost $${plan.costLow}–$${plan.costHigh}`,
      "",
      `Taste: ${plan.tasteReasoning}`,
    ].join("\n"),
    job,
  );
}

export function buildInspectionChecklist(
  kind: "pre-purchase" | "periodic",
  vehicle: Vehicle | undefined,
): string {
  const title =
    kind === "pre-purchase"
      ? "Pre-purchase inspection checklist"
      : "Periodic inspection checklist";
  const v = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : "target vehicle";

  const items =
    kind === "pre-purchase"
      ? [
          "Verify VIN, title status, and service records",
          "Scan for codes / freeze frame (OBD if available)",
          "Cold start: idle quality, noises, smoke",
          "Test drive: shifts, braking, steering, vibrations",
          "Undercarriage: leaks, rust, exhaust, bushings",
          "Brakes: pads/rotors/hoses, parking brake",
          "Tires: tread, age codes, uneven wear",
          "Cooling/oil: levels, condition, evidence of mix",
          "Electrical: charging voltage, lights, windows",
          "EV/hybrid (if applicable): HV warning lights, charge behavior — pro inspection recommended",
        ]
      : [
          "Fluids: oil, coolant, brake, washer, transmission (as applicable)",
          "Belts/hoses condition",
          "Brake inspection (pads/rotors/fluid)",
          "Tire pressures + tread + torque lug nuts to OEM spec after work",
          "Lights / wipers / horn",
          "Battery terminals / corrosion",
          "Listen for new noises at idle and 30–40 mph",
          "Note warning lights",
        ];

  return withSafetyFooter(
    [
      `# ${title}`,
      `Target: ${v}`,
      "",
      "Suggestion: this is an inspection aid, not a certification.",
      "",
      ...items.map((i, n) => `${n + 1}. [ ] ${i}`),
      "",
      "Action: stop and use a professional for structural, brake, steering, airbag, or HV concerns.",
    ].join("\n"),
    kind,
  );
}

export function saveServicePlanExport(paths: DataPaths, markdown: string): string {
  mkdirSync(paths.exports, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = join(paths.exports, `service-${stamp}.md`);
  writeFileSync(file, markdown, "utf8");
  return file;
}

function matchTemplate(
  job: string,
  bias: TasteBias,
  vehicle?: Vehicle,
): ServicePlan {
  const j = job.toLowerCase();
  const vlabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : "vehicle";

  if (/brake pad|brakes?\b/.test(j)) {
    return {
      title: `Brake service — ${vlabel}`,
      job,
      difficulty: 3,
      estHours: bias.diy ? "1.5–3h DIY" : "1–2h shop",
      costLow: bias.budget ? 80 : 120,
      costHigh: bias.oem ? 450 : 320,
      parts: [
        {
          name: "Brake pads (axle set)",
          oem: bias.oem ? "OEM / OE-quality ceramic or semi-metallic as specified" : "OE-quality",
          aftermarket: bias.budget ? "Reputable value brand" : "Premium aftermarket",
          notes: "Avoid no-name pads on daily drivers",
        },
        { name: "Hardware kit / abutment clips", notes: "Often overlooked" },
        { name: "Brake cleaner + high-temp grease (quiet)" },
      ],
      tools: [
        "Jack + stands (rated)",
        "Lug wrench / torque wrench",
        "C-clamp or caliper tool",
        "Socket set",
      ],
      steps: [
        "Safe lift / support vehicle; chock wheels",
        "Remove wheels; support caliper — do not hang by hose",
        "Inspect pads/rotors/hoses; measure thickness",
        "Replace pads (+ rotors if below spec/warped)",
        "Compress piston carefully; watch ABS/electronic park brake procedures",
        "Reassemble; torque lugs to OEM spec in star pattern",
        "Bed pads per compound instructions; verify pedal",
      ],
      torqueNotes: [
        "Use OEM lug-nut torque — do not invent numbers; verify in service info / your knowledge base.",
        "Caliper bracket bolts are torque-critical — confirm OEM values before final tighten.",
      ],
      tasteReasoning: "",
      safetyNotes: [
        "Brakes are HIGH RISK — if unsure, stop and use a qualified technician.",
      ],
    };
  }

  if (/oil/.test(j)) {
    return {
      title: `Oil & filter service — ${vlabel}`,
      job,
      difficulty: 1,
      estHours: "0.5–1h",
      costLow: bias.budget ? 25 : 40,
      costHigh: bias.oem ? 120 : 90,
      parts: [
        {
          name: "Engine oil (correct viscosity/spec)",
          oem: "Meet OEM spec (e.g. dexos/GF/ACEA as required)",
          aftermarket: bias.budget ? "Quality conventional/synthetic blend if allowed" : "Full synthetic meeting spec",
        },
        {
          name: "Oil filter",
          oem: bias.oem ? "OEM filter" : "OE-quality filter",
          aftermarket: "Reputable brand",
        },
        { name: "Crush washer (if applicable)" },
      ],
      tools: ["Oil filter wrench", "Drain pan", "Torque wrench", "Funnel", "Gloves"],
      steps: [
        "Warm engine slightly; park level; support safely if lifting",
        "Drain oil; replace washer; torque drain plug to OEM spec",
        "Replace filter (oil the gasket)",
        "Refill to spec capacity; run and recheck level/leaks",
        "Reset oil light/maintenance minder if equipped",
      ],
      torqueNotes: [
        "Drain plug torque is OEM-specific — look up for this engine; do not guess.",
      ],
      tasteReasoning: "",
      safetyNotes: ["Dispose of oil/filter responsibly."],
    };
  }

  if (/spark|plug/.test(j) && vehicle?.fuelType !== "ev") {
    return {
      title: `Spark plug service — ${vlabel}`,
      job,
      difficulty: 2,
      estHours: "1–2.5h",
      costLow: 40,
      costHigh: bias.oem ? 220 : 160,
      parts: [
        {
          name: "Spark plugs (correct heat range/gap)",
          oem: bias.oem ? "OEM plugs" : "OE-equivalent",
        },
        { name: "Dielectric grease (as applicable)", notes: "Boots/coils" },
      ],
      tools: ["Spark plug socket", "Torque wrench", "Extensions", "Gap tool if required"],
      steps: [
        "Work cold; label coil connectors",
        "Remove coils/boots carefully",
        "Extract plugs; inspect for fouling",
        "Install new plugs; torque to OEM spec (critical)",
        "Refit coils; clear codes; road test",
      ],
      torqueNotes: [
        "Spark plug torque is easy to get wrong — always verify OEM ft-lb/in-lb and thread engagement.",
      ],
      tasteReasoning: "",
      safetyNotes: ["Do not drop debris into open plug wells."],
    };
  }

  // Generic repair/service shell
  return {
    title: `Service plan — ${job} — ${vlabel}`,
    job,
    difficulty: 3,
    estHours: bias.shop ? "shop quote" : "2–4h estimated",
    costLow: 50,
    costHigh: 400,
    parts: [
      {
        name: "Primary replacement parts for the job",
        oem: bias.oem ? "Prefer OEM / OE-quality" : "OE-quality or reputable aftermarket",
        aftermarket: bias.budget ? "Value option if non-safety" : "Quality aftermarket",
      },
      { name: "Consumables (cleaner, gasket maker, fluids as needed)" },
    ],
    tools: ["Basic hand tools", "Torque wrench", "Jack/stands if undercar", "PPE"],
    steps: [
      "Define success criteria and safety boundaries for this job",
      "Gather parts/tools; verify OEM torque/fluid specs from service info or knowledge base",
      "Perform inspection before committing to parts replacement",
      "Execute repair/service in logical order; one change at a time when diagnosing",
      "Verify fix; road test where safe; document in /log",
    ],
    torqueNotes: [
      "Pull torque specs from OEM service info or `/knowledge search` — do not invent numbers.",
    ],
    tasteReasoning: "",
    safetyNotes:
      assessRisk(job) === "high"
        ? ["High-risk topic — professional inspection recommended if unsure."]
        : ["Stop if you hit a step beyond your tools/training."],
  };
}

function buildTasteReasoning(bias: TasteBias, plan: ServicePlan): string {
  const bits: string[] = [];
  if (bias.diy && !bias.shop) {
    bits.push(`DIY-leaning taste → difficulty ${plan.difficulty}/5 with tool list emphasized`);
  } else if (bias.shop) {
    bits.push("Shop-leaning taste → treat DIY steps as optional; get a quote for labor");
  } else {
    bits.push("Balanced DIY/shop taste → DIY if equipped, otherwise shop the high-severity steps");
  }
  if (bias.oem) bits.push("OEM preference → prioritize OEM/OE-quality parts on this plan");
  if (bias.budget) bits.push("Budget preference → include value aftermarket where non-critical");
  if (!bits.length) bits.push("No strong bias — OE-quality parts and clear safety stops");
  return bits.join("; ") + ".";
}

function pullKnowledgeNotes(
  job: string,
  vehicle: Vehicle | undefined,
  knowledge?: KnowledgeBase,
): string[] {
  if (!knowledge) return [];
  const hit = knowledge.search(job, {
    vehicleIds: vehicle ? [vehicle.id] : [],
    limit: 2,
  });
  if (!/USER DOCUMENT/.test(hit) || /No matches/.test(hit)) return [];
  const lines = hit
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 20 && !l.startsWith("#") && !l.startsWith("Source:"))
    .slice(0, 3)
    .map((l) => `From USER DOCUMENT: ${l.slice(0, 180)}`);
  return lines;
}

function formatServicePlanMarkdown(
  plan: ServicePlan,
  vehicle?: Vehicle,
): string {
  const body = [
    `# ${plan.title}`,
    "",
    vehicle
      ? `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.currentMileage.toLocaleString()} mi`
      : "Vehicle: unspecified",
    `Difficulty: ${plan.difficulty}/5 · Time: ${plan.estHours} · Est. cost: $${plan.costLow}–$${plan.costHigh}`,
    "",
    "## Why this plan (taste-aware)",
    plan.tasteReasoning,
    "",
    "## Parts",
    ...plan.parts.map(
      (p) =>
        `- **${p.name}**` +
        (p.oem ? `\n  - OEM path: ${p.oem}` : "") +
        (p.aftermarket ? `\n  - Aftermarket path: ${p.aftermarket}` : "") +
        (p.notes ? `\n  - Note: ${p.notes}` : ""),
    ),
    "",
    "## Tools",
    ...plan.tools.map((t) => `- ${t}`),
    "",
    "## Procedure outline",
    ...plan.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "## Torque / critical notes",
    ...plan.torqueNotes.map((n) => `- ${n}`),
    "",
    "## Safety",
    ...plan.safetyNotes.map((n) => `- ${n}`),
    "",
    "Approve/adapt via `/plan` if you want the agent to execute tool-backed research next.",
    "Log completion with `/log <description> [mileage] [cost] [diy|shop]`.",
  ].join("\n");

  return withSafetyFooter(body, plan.job);
}
