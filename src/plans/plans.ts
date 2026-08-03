import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { ensureDataDirs, type DataPaths } from "../config/config.js";

export const PlanStepSchema = z.object({
  n: z.number().int().positive(),
  text: z.string(),
  status: z.enum(["pending", "done", "skipped"]).default("pending"),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  goal: z.string(),
  steps: z.array(PlanStepSchema),
  status: z.enum([
    "draft",
    "awaiting_approval",
    "approved",
    "executing",
    "done",
    "revised",
  ]),
  createdAt: z.string(),
  updatedAt: z.string(),
  vehicleId: z.string().optional(),
  mode: z
    .enum(["general", "diagnose", "parts", "schedule", "maintenance"])
    .default("general"),
  resultMarkdown: z.string().optional(),
});

export type Plan = z.infer<typeof PlanSchema>;

export class PlanStore {
  private readonly dir: string;

  constructor(paths: DataPaths = ensureDataDirs()) {
    this.dir = paths.plans;
    mkdirSync(this.dir, { recursive: true });
  }

  private jsonPath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  private mdPath(id: string): string {
    return join(this.dir, `${id}.md`);
  }

  create(input: {
    title: string;
    goal: string;
    steps: string[];
    vehicleId?: string;
    mode?: Plan["mode"];
  }): Plan {
    const now = new Date().toISOString();
    const plan = PlanSchema.parse({
      id: uuidv4(),
      title: input.title,
      goal: input.goal,
      steps: input.steps.map((text, i) => ({
        n: i + 1,
        text,
        status: "pending" as const,
      })),
      status: "awaiting_approval",
      createdAt: now,
      updatedAt: now,
      vehicleId: input.vehicleId,
      mode: input.mode ?? "general",
    });
    this.save(plan);
    return plan;
  }

  save(plan: Plan): Plan {
    const parsed = PlanSchema.parse({
      ...plan,
      updatedAt: new Date().toISOString(),
    });
    writeFileSync(this.jsonPath(parsed.id), JSON.stringify(parsed, null, 2), "utf8");
    writeFileSync(this.mdPath(parsed.id), planToMarkdown(parsed), "utf8");
    return parsed;
  }

  get(id: string): Plan | undefined {
    const file = this.jsonPath(id);
    if (!existsSync(file)) {
      return this.list().find((p) => p.id.startsWith(id));
    }
    try {
      return PlanSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
    } catch {
      return undefined;
    }
  }

  latest(): Plan | undefined {
    return this.list()[0];
  }

  list(): Plan[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return PlanSchema.parse(
            JSON.parse(readFileSync(join(this.dir, f), "utf8")) as unknown,
          );
        } catch {
          return null;
        }
      })
      .filter((p): p is Plan => p !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  approve(id: string): Plan {
    const plan = this.get(id);
    if (!plan) throw new Error(`Plan not found: ${id}`);
    plan.status = "approved";
    return this.save(plan);
  }

  revise(id: string, feedback: string, newSteps?: string[]): Plan {
    const plan = this.get(id);
    if (!plan) throw new Error(`Plan not found: ${id}`);
    if (newSteps?.length) {
      plan.steps = newSteps.map((text, i) => ({
        n: i + 1,
        text,
        status: "pending",
      }));
    } else {
      plan.steps.push({
        n: plan.steps.length + 1,
        text: `Revise based on feedback: ${feedback}`,
        status: "pending",
      });
    }
    plan.status = "awaiting_approval";
    plan.goal = `${plan.goal}\n\nRevision feedback: ${feedback}`;
    return this.save(plan);
  }

  markDone(id: string, resultMarkdown?: string): Plan {
    const plan = this.get(id);
    if (!plan) throw new Error(`Plan not found: ${id}`);
    plan.status = "done";
    plan.steps = plan.steps.map((s) => ({ ...s, status: "done" as const }));
    if (resultMarkdown) plan.resultMarkdown = resultMarkdown;
    return this.save(plan);
  }

  markdownPath(id: string): string {
    return this.mdPath(id);
  }
}

export function planToMarkdown(plan: Plan): string {
  return [
    `# ${plan.title}`,
    "",
    `> Status: **${plan.status}** · Mode: ${plan.mode} · Updated: ${plan.updatedAt}`,
    "",
    "## Goal",
    "",
    plan.goal,
    "",
    "## Steps",
    "",
    ...plan.steps.map((s) => `${s.n}. [${s.status}] ${s.text}`),
    "",
    ...(plan.resultMarkdown
      ? ["## Result", "", plan.resultMarkdown, ""]
      : []),
  ].join("\n");
}

export function formatPlanForTerminal(plan: Plan): string {
  const lines = [
    `Plan: ${plan.title}`,
    `Status: ${plan.status} · id: ${plan.id.slice(0, 8)}`,
    "",
    `Goal: ${plan.goal.split("\n")[0]}`,
    "",
    "Steps:",
    ...plan.steps.map((s) => `  ${s.n}. ${s.text}`),
    "",
    "Approve with /approve · revise with /revise <feedback> · or type feedback",
  ];
  return lines.join("\n");
}
