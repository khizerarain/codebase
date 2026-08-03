import type { Config } from "../config/config.js";
import type { DataPaths } from "../config/config.js";
import type { MemoryStore } from "../memory/memory.js";
import {
  formatPlanForTerminal,
  PlanStore,
  type Plan,
} from "../plans/plans.js";
import type { TasteManager } from "../taste/taste.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { logger } from "../utils/logger.js";
import { createLLMProvider, type LLMProvider } from "./llm.js";
import {
  buildPlanPrompt,
  buildSystemPrompt,
  shouldAutoPlan,
} from "./prompts.js";
import { withSafetyFooter } from "./safety.js";
import { executeTool, TOOL_DEFINITIONS, type ToolContext } from "./tools.js";

export interface AgentTurnResult {
  response: string;
  userMessage: string;
  kind?: "answer" | "plan" | "clarification";
  plan?: Plan;
}

export class Agent {
  readonly llm: LLMProvider;
  readonly plans: PlanStore;
  private pendingPlan: Plan | null = null;
  private lastExportable = "";

  constructor(
    private readonly config: Config,
    private readonly taste: TasteManager,
    private readonly memory: MemoryStore,
    private readonly vehicles: VehicleStore,
    private readonly paths: DataPaths,
    llm?: LLMProvider,
  ) {
    this.llm = llm ?? createLLMProvider(config);
    this.taste.setLLM(this.llm);
    this.plans = new PlanStore(paths);
  }

  getPendingPlan(): Plan | null {
    return this.pendingPlan;
  }

  getLastExportable(): string {
    return this.lastExportable;
  }

  private toolContext(): ToolContext {
    return {
      vehicles: this.vehicles,
      taste: this.taste,
      paths: this.paths,
    };
  }

  private promptContext(userMessage: string, mode?: string, approvedPlan?: string) {
    const active = this.vehicles.getActive();
    const vehicleIds = active ? [active.id] : this.memory.getSession().vehicleIds;
    const skills = this.taste.selectRelevantSkills(userMessage, vehicleIds, 4);

    return {
      tasteSummary: this.taste.compactTasteSummary(),
      relevantSkills: this.taste.formatSkillsForPrompt(skills),
      vehiclesSummary: this.vehicles.promptSummary(active?.id),
      activeVehicle: active
        ? this.vehicles.formatDetail(active)
        : "_No active vehicle. Use /vehicles add …_",
      memoryNotes: this.memory.recentNotesSummary(),
      mode,
      approvedPlan,
    };
  }

  /** Decide whether to plan first, then either return a plan or answer. */
  async respond(
    userMessage: string,
    opts: { forcePlan?: boolean; mode?: Plan["mode"] } = {},
  ): Promise<AgentTurnResult> {
    const forcePlan = opts.forcePlan ?? false;
    if (forcePlan || shouldAutoPlan(userMessage)) {
      return this.createPlan(userMessage, opts.mode ?? "general");
    }
    return this.answer(userMessage, { mode: opts.mode });
  }

  async createPlan(
    goal: string,
    mode: Plan["mode"] = "general",
  ): Promise<AgentTurnResult> {
    const active = this.vehicles.getActive();
    const ctx = this.promptContext(goal, `planning:${mode}`);
    logger.info("Creating plan…");

    let title = goal.slice(0, 80);
    let steps: string[] = [];

    try {
      const res = await this.llm.chat([
        { role: "system", content: buildPlanPrompt(goal, ctx) },
        { role: "user", content: goal },
      ]);
      const parsed = extractPlanJson(res.content);
      if (parsed) {
        title = parsed.title || title;
        steps = parsed.steps;
      }
    } catch (err) {
      logger.warn(
        `Plan LLM failed (${err instanceof Error ? err.message : String(err)}); using fallback plan.`,
      );
    }

    if (!steps.length) {
      steps = fallbackSteps(goal, mode);
    }

    const plan = this.plans.create({
      title,
      goal,
      steps,
      vehicleId: active?.id,
      mode,
    });
    this.pendingPlan = plan;
    this.lastExportable = formatPlanForTerminal(plan);

    const response = [
      formatPlanForTerminal(plan),
      "",
      `Saved: ${this.plans.markdownPath(plan.id)}`,
    ].join("\n");

    this.memory.addMessage({ role: "user", content: goal });
    this.memory.addMessage({ role: "assistant", content: response });
    this.memory.persistSession();

    return {
      response,
      userMessage: goal,
      kind: "plan",
      plan,
    };
  }

  async revisePending(feedback: string): Promise<AgentTurnResult> {
    if (!this.pendingPlan) {
      return {
        response: "No pending plan to revise. Use /plan <goal> first.",
        userMessage: feedback,
        kind: "clarification",
      };
    }

    // Ask LLM for revised steps when possible
    let newSteps: string[] | undefined;
    try {
      const ctx = this.promptContext(feedback, "planning:revise");
      const res = await this.llm.chat([
        {
          role: "system",
          content: buildPlanPrompt(
            `${this.pendingPlan.goal}\n\nUser revision feedback: ${feedback}`,
            ctx,
          ),
        },
        { role: "user", content: feedback },
      ]);
      newSteps = extractPlanJson(res.content)?.steps;
    } catch {
      // keep structural revise
    }

    const plan = this.plans.revise(this.pendingPlan.id, feedback, newSteps);
    this.pendingPlan = plan;
    this.lastExportable = formatPlanForTerminal(plan);
    const response = formatPlanForTerminal(plan);
    return { response, userMessage: feedback, kind: "plan", plan };
  }

  async approveAndExecute(): Promise<AgentTurnResult> {
    if (!this.pendingPlan) {
      return {
        response: "No pending plan. Use /plan <goal> first.",
        userMessage: "/approve",
        kind: "clarification",
      };
    }

    const plan = this.plans.approve(this.pendingPlan.id);
    plan.status = "executing";
    this.plans.save(plan);

    logger.info("Plan approved — executing…");
    const result = await this.answer(
      `Execute the approved plan: ${plan.title}\n\nGoal: ${plan.goal}\n\nSteps:\n${plan.steps.map((s) => `${s.n}. ${s.text}`).join("\n")}`,
      {
        mode: `execute:${plan.mode}`,
        approvedPlan: formatPlanForTerminal(plan),
      },
    );

    const done = this.plans.markDone(plan.id, result.response);
    this.pendingPlan = null;
    this.lastExportable = result.response;

    return {
      ...result,
      plan: done,
      kind: "answer",
    };
  }

  /** Direct answer / tool loop (no planning gate). */
  async answer(
    userMessage: string,
    opts: { mode?: string; approvedPlan?: string } = {},
  ): Promise<AgentTurnResult> {
    this.memory.addMessage({ role: "user", content: userMessage });

    const system = buildSystemPrompt(
      this.promptContext(userMessage, opts.mode, opts.approvedPlan),
    );
    const messages = [
      { role: "system" as const, content: system },
      ...this.memory.getMessagesForPrompt(this.config.contextMessageLimit),
    ];

    let finalContent = "";
    const observations: string[] = [];

    for (let round = 0; round < this.config.maxToolRounds; round++) {
      let llmResponse;
      try {
        logger.dim(`  thinking (round ${round + 1})…`);
        llmResponse = await this.llm.chat(messages, TOOL_DEFINITIONS);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(msg);
        finalContent =
          "I hit an LLM provider error. Check your provider config (OpenRouter key or Ollama).\n\n" +
          msg;
        break;
      }

      if (llmResponse.toolCalls?.length) {
        if (llmResponse.content.trim()) {
          logger.thought(llmResponse.content.trim());
        }

        const callSummary = llmResponse.toolCalls
          .map((c) => `${c.name}(${JSON.stringify(c.arguments)})`)
          .join("; ");
        const assistantToolMsg = {
          role: "assistant" as const,
          content: llmResponse.content || `Calling tools: ${callSummary}`,
        };
        messages.push(assistantToolMsg);
        this.memory.addMessage(assistantToolMsg);

        for (const call of llmResponse.toolCalls) {
          logger.tool(call.name, JSON.stringify(call.arguments));
          const result = await executeTool(call.name, call.arguments, this.toolContext());
          const observation = result.ok
            ? result.output
            : `Tool error: ${result.output}`;
          observations.push(`[${call.name}] ${truncate(observation, 400)}`);
          logger.dim(`  → ${truncate(observation, 200)}`);

          const toolMessage = {
            role: "tool" as const,
            name: call.name,
            toolCallId: call.id,
            content: observation,
          };
          messages.push(toolMessage);
          this.memory.addMessage(toolMessage);
        }
        continue;
      }

      finalContent = llmResponse.content.trim() || "(empty response)";
      break;
    }

    if (!finalContent) {
      if (observations.length) {
        finalContent = [
          "Completed tool work but reached the tool-call limit before a final narrative.",
          "",
          ...observations.slice(-4),
          "",
          "Try /approve again or ask a narrower follow-up.",
        ].join("\n");
      } else {
        finalContent =
          "I reached the tool-call limit without a final answer. Try rephrasing or /clear.";
      }
    }

    finalContent = withSafetyFooter(finalContent);
    this.lastExportable = finalContent;
    this.memory.addMessage({ role: "assistant", content: finalContent });
    this.memory.persistSession();

    return { response: finalContent, userMessage, kind: "answer" };
  }
}

function extractPlanJson(
  content: string,
): { title?: string; steps: string[] } | null {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = (fenced ?? content).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      title?: string;
      steps?: unknown;
    };
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.map(String).filter(Boolean)
      : [];
    if (!steps.length) return null;
    return { title: parsed.title, steps };
  } catch {
    return null;
  }
}

function fallbackSteps(goal: string, mode: Plan["mode"]): string[] {
  switch (mode) {
    case "diagnose":
      return [
        "Load active vehicle profile",
        "Clarify symptoms and conditions",
        "Run structured diagnostic reasoning",
        "Search recalls/TSBs if relevant",
        "Produce suggested checks + safety notes",
      ];
    case "parts":
      return [
        "Load active vehicle + taste",
        "Identify the part/system needed",
        "Compare OEM vs aftermarket vs budget options",
        "Estimate rough cost ranges",
        "Recommend based on taste",
      ];
    case "schedule":
      return [
        "Load active vehicle mileage/fuel type",
        "Generate maintenance schedule",
        "Highlight overdue / due-soon items",
        "Estimate near-term costs if useful",
      ];
    default:
      return [
        `Clarify requirements for: ${truncate(goal, 80)}`,
        "Load active vehicle profile and taste",
        "Gather needed facts via tools",
        "Produce structured deliverable (checklist/schedule/estimate)",
        "Add safety notes and next actions",
      ];
  }
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
