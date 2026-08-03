import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { withSafetyFooter, assessRisk } from "../agent/safety.js";
import type { DataPaths } from "../config/config.js";
import type { KnowledgeBase } from "../knowledge/knowledge.js";
import type { TasteManager } from "../taste/taste.js";
import type { Vehicle } from "../vehicles/vehicles.js";

export const RankedCauseSchema = z.object({
  cause: stringMin(),
  probability: z.enum(["high", "medium", "low"]),
  severity: z.number().int().min(1).max(5),
  costBand: z.enum(["$", "$$", "$$$"]),
  diyDifficulty: z.number().int().min(1).max(5),
  checks: z.array(z.string()),
  why: z.string(),
});

function stringMin() {
  return z.string().min(1);
}

export type RankedCause = z.infer<typeof RankedCauseSchema>;

export interface DiagnosticSession {
  id: string;
  vehicleId?: string;
  symptoms: string[];
  answers: Record<string, string>;
  pendingQuestions: string[];
  status: "collecting" | "complete";
  report?: string;
  createdAt: string;
}

export type DiagnosticStep =
  | { type: "questions"; content: string; session: DiagnosticSession }
  | { type: "report"; content: string; session: DiagnosticSession };

/** Structured multi-step diagnostic workflow (suggestions only). */
export class DiagnosticWorkflow {
  private session: DiagnosticSession | null = null;

  constructor(
    private readonly paths: DataPaths,
    private readonly taste: TasteManager,
    private readonly knowledge?: KnowledgeBase,
  ) {}

  getSession(): DiagnosticSession | null {
    return this.session;
  }

  isCollecting(): boolean {
    return this.session?.status === "collecting";
  }

  cancel(): void {
    this.session = null;
  }

  start(input: string, vehicle?: Vehicle): DiagnosticStep {
    const symptoms = parseSymptoms(input);
    if (!symptoms.length) {
      symptoms.push(input.trim() || "unspecified concern");
    }

    const questions = buildClarifyingQuestions(symptoms, vehicle);
    this.session = {
      id: uuidv4(),
      vehicleId: vehicle?.id,
      symptoms,
      answers: {},
      pendingQuestions: questions,
      status: questions.length ? "collecting" : "complete",
      createdAt: new Date().toISOString(),
    };

    if (!questions.length) {
      return this.finalize(vehicle);
    }

    const content = [
      "Structured diagnosis — clarifying questions",
      vehicle
        ? `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.currentMileage.toLocaleString()} mi)`
        : "Vehicle: (none active — results will be more generic)",
      "",
      "Symptoms noted:",
      ...symptoms.map((s) => `- ${s}`),
      "",
      "Please answer (one line each, or reply freely). Type `done` to generate the report now, `cancel` to abort:",
      ...questions.map((q, i) => `${i + 1}. ${q}`),
    ].join("\n");

    return { type: "questions", content, session: this.session };
  }

  /** Feed free-text answers while collecting. */
  continueWith(answer: string, vehicle?: Vehicle): DiagnosticStep {
    if (!this.session || this.session.status !== "collecting") {
      return this.start(answer, vehicle);
    }

    const text = answer.trim();
    if (/^cancel$/i.test(text)) {
      this.cancel();
      return {
        type: "report",
        content: "Diagnostic session cancelled.",
        session: {
          id: "cancelled",
          symptoms: [],
          answers: {},
          pendingQuestions: [],
          status: "complete",
          createdAt: new Date().toISOString(),
        },
      };
    }

    if (/^(done|skip|go|report)$/i.test(text)) {
      return this.finalize(vehicle);
    }

    // Map answer onto next pending question or store as freeform
    const nextQ = this.session.pendingQuestions.shift();
    if (nextQ) {
      this.session.answers[nextQ] = text;
    } else {
      this.session.answers[`note-${Object.keys(this.session.answers).length}`] =
        text;
    }

    // Also absorb extra symptom keywords
    for (const s of parseSymptoms(text)) {
      if (!this.session.symptoms.includes(s)) this.session.symptoms.push(s);
    }

    if (this.session.pendingQuestions.length === 0) {
      return this.finalize(vehicle);
    }

    const content = [
      "Thanks — a few more details:",
      ...this.session.pendingQuestions.map((q, i) => `${i + 1}. ${q}`),
      "",
      "Type `done` anytime to generate the differential report.",
    ].join("\n");

    return { type: "questions", content, session: this.session };
  }

  private finalize(vehicle?: Vehicle): DiagnosticStep {
    if (!this.session) {
      throw new Error("No diagnostic session");
    }

    const taste = this.taste.compactTasteSummary();
    const skills = this.taste
      .listSkills()
      .slice(0, 6)
      .map((s) => s.slug);
    const causes = rankCauses(this.session.symptoms, this.session.answers, {
      taste,
      skills,
      fuelType: vehicle?.fuelType,
    });

    let knowledgeNote = "";
    if (this.knowledge && vehicle) {
      const q = this.session.symptoms.join(" ");
      const hit = this.knowledge.search(q, {
        vehicleIds: [vehicle.id],
        limit: 2,
      });
      if (/USER DOCUMENT/.test(hit) && !/No matches/.test(hit)) {
        knowledgeNote = [
          "",
          "## From your local knowledge base",
          "(Cited as USER DOCUMENT — not general web knowledge)",
          hit.split("\n").slice(0, 24).join("\n"),
        ].join("\n");
      }
    }

    const report = formatDiagnosticReport({
      vehicle,
      symptoms: this.session.symptoms,
      answers: this.session.answers,
      causes,
      taste,
      skills,
      knowledgeNote,
    });

    this.session.status = "complete";
    this.session.report = report;
    this.saveReport(report);
    const done = this.session;
    this.session = null;

    return { type: "report", content: report, session: done };
  }

  private saveReport(report: string): void {
    mkdirSync(this.paths.exports, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    writeFileSync(
      join(this.paths.exports, `diagnosis-${stamp}.md`),
      report,
      "utf8",
    );
  }
}

function parseSymptoms(input: string): string[] {
  return input
    .split(/[;,]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 8);
}

function buildClarifyingQuestions(
  symptoms: string[],
  vehicle?: Vehicle,
): string[] {
  const joined = symptoms.join(" ").toLowerCase();
  const qs: string[] = [];

  if (!vehicle) {
    qs.push("What is the year/make/model (and approx mileage)?");
  }

  qs.push("When does it happen (cold start, hot, highway, idle, braking, always)?");

  if (/brake|squeal|grind|pedal/.test(joined)) {
    qs.push("Brake feel: soft, hard, pulsating, or normal? Any ABS/brake light?");
  }
  if (/misfire|rough|shake|idle|stall/.test(joined)) {
    qs.push("Any check-engine light or codes? Recent spark plugs/coils/fuel work?");
  }
  if (/overheat|temp|coolant/.test(joined)) {
    qs.push("Is coolant level known/full? Happens at idle, highway, or both?");
  }
  if (/noise|knock|clunk|rattle/.test(joined)) {
    qs.push("Is the noise speed-related, RPM-related, or only over bumps?");
  }
  if (/battery|no start|click|electrical/.test(joined)) {
    qs.push("Do lights/accessories work? Any recent battery or jump-start?");
  }

  qs.push("Any recent work, fluids, or modifications before this started?");
  return qs.slice(0, 5);
}

function rankCauses(
  symptoms: string[],
  answers: Record<string, string>,
  ctx: { taste: string; skills: string[]; fuelType?: string },
): RankedCause[] {
  const joined = `${symptoms.join(" ")} ${Object.values(answers).join(" ")}`.toLowerCase();
  const diy = /diy/.test(ctx.taste) || ctx.skills.includes("diy-first");
  const budget = /budget/.test(ctx.taste) || ctx.skills.includes("budget-conscious");
  const causes: RankedCause[] = [];

  const push = (c: RankedCause) => causes.push(RankedCauseSchema.parse(c));

  if (/brake|squeal|grind|pedal/.test(joined)) {
    push({
      cause: "Brake pad wear / glazing",
      probability: /grind/.test(joined) ? "high" : "high",
      severity: 4,
      costBand: budget ? "$" : "$$",
      diyDifficulty: diy ? 2 : 3,
      checks: ["Pad thickness", "Rotor condition", "Hardware/anti-rattle clips"],
      why: "Squeal/grind under braking commonly tracks to friction material or rotor surface issues.",
    });
    push({
      cause: "Brake hydraulic issue (fluid/air/leak)",
      probability: /soft|spongy/.test(joined) ? "high" : "medium",
      severity: 5,
      costBand: "$$",
      diyDifficulty: 4,
      checks: ["Fluid level/condition", "Leak inspection", "Pedal travel test"],
      why: "Soft pedal or poor bite raises hydraulic/system integrity concerns — safety-critical.",
    });
  }

  if (/misfire|rough|shake|idle|stall/.test(joined)) {
    push({
      cause: "Ignition misfire (plugs/coils)",
      probability: "high",
      severity: 3,
      costBand: budget ? "$" : "$$",
      diyDifficulty: diy ? 2 : 3,
      checks: ["Scan misfire counters", "Inspect plugs/coils", "Swap-test coil if possible"],
      why: "Rough idle/shake frequently correlates with ignition components, especially with age/mileage.",
    });
    push({
      cause: "Vacuum leak / intake boot",
      probability: "medium",
      severity: 2,
      costBand: "$",
      diyDifficulty: 2,
      checks: ["Listen/spray test carefully", "Inspect PCV and boots"],
      why: "Unmetered air can lean the mixture and destabilize idle without a hard part failure.",
    });
  }

  if (/overheat|temp|coolant/.test(joined)) {
    push({
      cause: "Cooling system fault (thermostat/fans/pump/air)",
      probability: "high",
      severity: 5,
      costBand: "$$",
      diyDifficulty: 3,
      checks: ["Coolant level", "Fan operation", "Thermostat behavior", "Pressure test"],
      why: "Overheating quickly becomes severe; verify cooling path before continued driving.",
    });
  }

  if (/battery|no start|click|electrical/.test(joined)) {
    push({
      cause: "Battery / charging / starter circuit",
      probability: "high",
      severity: 3,
      costBand: "$",
      diyDifficulty: 2,
      checks: ["Battery load test", "Alternator output", "Clean grounds/terminals"],
      why: "Clicking or no-start patterns often begin with state-of-charge or connection resistance.",
    });
  }

  if (!causes.length) {
    push({
      cause: "Insufficient symptom detail for a ranked hypothesis",
      probability: "medium",
      severity: 2,
      costBand: "$",
      diyDifficulty: 1,
      checks: [
        "Capture conditions (cold/hot/speed)",
        "Note warning lights/codes",
        "List recent work",
      ],
      why: "Transparent uncertainty beats fake confidence — more context sharpens the differential.",
    });
  }

  // Taste-aware re-ordering: prefer lower DIY difficulty when DIY-first; keep severity-weighted top
  return causes.sort((a, b) => {
    const score = (c: RankedCause) =>
      (c.probability === "high" ? 30 : c.probability === "medium" ? 20 : 10) +
      c.severity * 3 -
      (diy ? c.diyDifficulty : 0) -
      (budget && c.costBand === "$$$" ? 4 : 0);
    return score(b) - score(a);
  });
}

function formatDiagnosticReport(input: {
  vehicle?: Vehicle;
  symptoms: string[];
  answers: Record<string, string>;
  causes: RankedCause[];
  taste: string;
  skills: string[];
  knowledgeNote: string;
}): string {
  const risk = assessRisk(input.symptoms.join(" "));
  const vline = input.vehicle
    ? `${input.vehicle.year} ${input.vehicle.make} ${input.vehicle.model} · ${input.vehicle.currentMileage.toLocaleString()} mi`
    : "Unspecified vehicle";

  const answerLines = Object.entries(input.answers).map(
    ([q, a]) => `- Q: ${q}\n  A: ${a}`,
  );

  const causeBlocks = input.causes.map((c, i) =>
    [
      `### ${i + 1}. ${c.cause}`,
      `Probability: ${c.probability} · Severity: ${c.severity}/5 · Cost: ${c.costBand} · DIY difficulty: ${c.diyDifficulty}/5`,
      `Why this ranks here: ${c.why}`,
      `Checks: ${c.checks.join("; ")}`,
    ].join("\n"),
  );

  const diy = /diy/.test(input.taste.toLowerCase());
  const actions = [
    "Confirm highest-probability easy checks first (observation before parts cannon).",
    diy
      ? "Taste leans DIY — start with low-difficulty inspections you are equipped for."
      : "Taste does not strongly favor DIY — consider a shop inspection earlier on severity ≥4 items.",
    risk === "high"
      ? "Safety-critical systems involved — prefer professional inspection before continued driving if unsure."
      : "Re-test after each change so you know what actually fixed it.",
  ];

  const body = [
    "# Diagnostic report (suggestions, not a certified diagnosis)",
    "",
    `Vehicle: ${vline}`,
    `Risk level: ${risk.toUpperCase()}`,
    "",
    "## Symptoms",
    ...input.symptoms.map((s) => `- ${s}`),
    "",
    "## Clarifying answers",
    ...(answerLines.length ? answerLines : ["- (none provided)"]),
    "",
    "## Possible causes (ranked)",
    "These are hypotheses ranked by probability, severity, cost band, and DIY difficulty — not certainty.",
    "",
    ...causeBlocks,
    "",
    "## Recommended next actions",
    ...actions.map((a, i) => `${i + 1}. ${a}`),
    "",
    "## Taste context",
    "Why options lean this way:",
    `- Active skills: ${input.skills.join(", ") || "(none)"}`,
    `- Taste summary (compact): ${input.taste.split("\n").slice(0, 6).join(" / ")}`,
    input.knowledgeNote,
    "",
    "Export again anytime with `/export diagnosis`.",
  ].join("\n");

  return withSafetyFooter(body, input.symptoms.join(" "));
}
