import type { Config } from "../config/config.js";
import type { MemoryStore } from "../memory/memory.js";
import type { TasteManager } from "../taste/taste.js";
import type { VehicleStore } from "../vehicles/vehicles.js";
import { logger } from "../utils/logger.js";
import { createLLMProvider, type LLMProvider } from "./llm.js";
import { buildSystemPrompt } from "./prompts.js";
import { executeTool, TOOL_DEFINITIONS } from "./tools.js";

export interface AgentTurnResult {
  response: string;
  userMessage: string;
}

export class Agent {
  readonly llm: LLMProvider;

  constructor(
    private readonly config: Config,
    private readonly taste: TasteManager,
    private readonly memory: MemoryStore,
    private readonly vehicles: VehicleStore,
    llm?: LLMProvider,
  ) {
    this.llm = llm ?? createLLMProvider(config);
    this.taste.setLLM(this.llm);
  }

  private systemPrompt(userMessage: string): string {
    const vehicleIds = this.memory.getSession().vehicleIds;
    const skills = this.taste.selectRelevantSkills(userMessage, vehicleIds, 4);

    return buildSystemPrompt({
      tasteSummary: this.taste.compactTasteSummary(),
      relevantSkills: this.taste.formatSkillsForPrompt(skills),
      vehiclesSummary: this.vehicles.promptSummary(),
      memoryNotes: this.memory.recentNotesSummary(),
    });
  }

  /** Run one user turn through a simple ReAct / tool loop. */
  async respond(userMessage: string): Promise<AgentTurnResult> {
    this.memory.addMessage({ role: "user", content: userMessage });

    const messages = [
      { role: "system" as const, content: this.systemPrompt(userMessage) },
      ...this.memory.getMessages(),
    ];

    let finalContent = "";

    for (let round = 0; round < this.config.maxToolRounds; round++) {
      let llmResponse;
      try {
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
          const result = await executeTool(call.name, call.arguments);
          const observation = result.ok
            ? result.output
            : `Tool error: ${result.output}`;
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
      finalContent =
        "I reached the tool-call limit without a final answer. Try rephrasing or /clear.";
    }

    this.memory.addMessage({ role: "assistant", content: finalContent });
    this.memory.persistSession();

    return { response: finalContent, userMessage };
  }
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
