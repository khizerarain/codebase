import type { ChatMessage } from "../memory/memory.js";
import type { ToolDefinition } from "../agent/tools.js";
import type { LLMProvider, LLMResponse, ToolCall } from "../agent/llm.js";

export type MockLLMMatcher =
  | string
  | RegExp
  | ((messages: ChatMessage[], tools?: ToolDefinition[]) => boolean);

export interface MockLLMScript {
  /** Match against the last user message (or custom predicate). */
  match?: MockLLMMatcher;
  /** Exact response for this turn. */
  response: LLMResponse;
  /** If true, script is removed after one use. Default true. */
  once?: boolean;
}

export interface MockLLMOptions {
  /** Default when no script matches. */
  defaultResponse?: LLMResponse;
  scripts?: MockLLMScript[];
}

/**
 * Deterministic LLM for tests — no network, no API keys.
 * Script responses by user-message match or call order.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  private scripts: MockLLMScript[];
  private readonly defaultResponse: LLMResponse;
  /** Full call history for assertions. */
  readonly calls: Array<{
    messages: ChatMessage[];
    tools?: ToolDefinition[];
  }> = [];

  constructor(opts: MockLLMOptions = {}) {
    this.scripts = [...(opts.scripts ?? [])];
    this.defaultResponse = opts.defaultResponse ?? {
      content:
        "Mock LLM default reply. This is a suggestion only — verify before acting.",
    };
  }

  /** Queue a scripted response (FIFO among unmatched scripts). */
  enqueue(response: LLMResponse, match?: MockLLMMatcher): void {
    this.scripts.push({ response, match, once: true });
  }

  /** Convenience: next chat() returns plain text. */
  enqueueText(content: string, match?: MockLLMMatcher): void {
    this.enqueue({ content }, match);
  }

  /** Convenience: next chat() returns a tool call then you can enqueue the final answer. */
  enqueueToolCall(
    name: string,
    args: Record<string, unknown> = {},
    content = "",
    match?: MockLLMMatcher,
  ): void {
    const toolCall: ToolCall = {
      id: `mock_tool_${this.calls.length + 1}`,
      name,
      arguments: args,
    };
    this.enqueue({ content, toolCalls: [toolCall] }, match);
  }

  /** Script a JSON plan payload the agent can parse. */
  enqueuePlan(
    title: string,
    steps: string[],
    match?: MockLLMMatcher,
  ): void {
    this.enqueueText(
      JSON.stringify({ title, steps }),
      match,
    );
  }

  clearScripts(): void {
    this.scripts = [];
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse> {
    this.calls.push({ messages, tools });
    const idx = this.scripts.findIndex((s) => matches(s.match, messages, tools));
    if (idx === -1) {
      return structuredClone(this.defaultResponse);
    }
    const script = this.scripts[idx]!;
    if (script.once !== false) {
      this.scripts.splice(idx, 1);
    }
    return structuredClone(script.response);
  }
}

function matches(
  match: MockLLMMatcher | undefined,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): boolean {
  if (match == null) return true;
  if (typeof match === "function") return match(messages, tools);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const hay = lastUser?.content ?? "";
  if (typeof match === "string") {
    return hay.toLowerCase().includes(match.toLowerCase());
  }
  return match.test(hay);
}
