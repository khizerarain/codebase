import type { Config } from "../config/config.js";
import type { ChatMessage } from "../memory/memory.js";
import type { ToolDefinition } from "./tools.js";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  raw?: unknown;
}

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}

interface OpenAIStyleMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

function toOpenAIMessages(messages: ChatMessage[]): OpenAIStyleMessage[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId ?? "tool",
        ...(m.name ? { name: m.name } : {}),
      };
    }
    return {
      role: m.role,
      content: m.content,
    };
  });
}

function toolsToOpenAI(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function parseToolCalls(
  toolCalls: OpenAIStyleMessage["tool_calls"],
): ToolCall[] | undefined {
  if (!toolCalls?.length) return undefined;
  return toolCalls.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = { raw: tc.function.arguments };
    }
    return {
      id: tc.id,
      name: tc.function.name,
      arguments: args,
    };
  });
}

/** OpenRouter (OpenAI-compatible) provider — default free-tier path. */
export class OpenRouterProvider implements LLMProvider {
  name = "openrouter";

  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Set it in your environment or switch to Ollama with BAY_PROVIDER=ollama.",
      );
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: toOpenAIMessages(messages),
    };
    if (tools?.length) {
      body.tools = toolsToOpenAI(tools);
      body.tool_choice = "auto";
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/khizerarain/codebase",
        "X-Title": "Bay",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: OpenAIStyleMessage["tool_calls"];
        };
      }>;
    };

    const message = data.choices?.[0]?.message;
    return {
      content: message?.content ?? "",
      toolCalls: parseToolCalls(message?.tool_calls),
      raw: data,
    };
  }
}

/**
 * Ollama local provider.
 * Uses /api/chat. Tool calling is best-effort — some models support it natively.
 */
export class OllamaProvider implements LLMProvider {
  name = "ollama";

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      stream: false,
      messages: messages.map((m) => ({
        role: m.role === "tool" ? "tool" : m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
    };

    if (tools?.length) {
      body.tools = toolsToOpenAI(tools);
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Cannot reach Ollama at ${this.baseUrl}. Is it running? (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      message?: {
        content?: string;
        tool_calls?: Array<{
          function?: { name?: string; arguments?: Record<string, unknown> | string };
        }>;
      };
    };

    const content = data.message?.content ?? "";
    const rawCalls = data.message?.tool_calls;
    let toolCalls: ToolCall[] | undefined;

    if (rawCalls?.length) {
      toolCalls = rawCalls.map((tc, i) => {
        const args = tc.function?.arguments;
        return {
          id: `ollama_tool_${i}`,
          name: tc.function?.name ?? "unknown",
          arguments:
            typeof args === "string"
              ? (safeJson(args) as Record<string, unknown>)
              : ((args as Record<string, unknown>) ?? {}),
        };
      });
    } else {
      // Fallback: parse a simple ReAct-style ACTION block from text models without tool APIs
      const parsed = parseReactAction(content);
      if (parsed) {
        toolCalls = [parsed];
        return { content: parsed.thought ?? "", toolCalls, raw: data };
      }
    }

    return { content, toolCalls, raw: data };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Minimal ReAct parser for models without native tool calling. */
function parseReactAction(
  content: string,
): (ToolCall & { thought?: string }) | null {
  const actionMatch = content.match(
    /Action\s*:\s*([a-zA-Z0-9_]+)\s*\nAction Input\s*:\s*([\s\S]*?)(?:\nObservation:|\nFinal Answer:|$)/i,
  );
  if (!actionMatch) return null;

  const thought = content.match(/Thought\s*:\s*([\s\S]*?)(?:\nAction:|$)/i)?.[1]?.trim();
  const name = actionMatch[1]!;
  const inputRaw = actionMatch[2]!.trim();
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(inputRaw) as Record<string, unknown>;
  } catch {
    args = { input: inputRaw };
  }

  return {
    id: `react_${Date.now()}`,
    name,
    arguments: args,
    thought,
  };
}

export function createLLMProvider(config: Config): LLMProvider {
  if (config.provider === "ollama") {
    return new OllamaProvider(config.ollama.baseUrl, config.ollama.model);
  }
  return new OpenRouterProvider(
    config.openrouter.apiKey,
    config.openrouter.model,
    config.openrouter.baseUrl,
  );
}
