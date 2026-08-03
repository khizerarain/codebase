import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

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

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_web",
    description:
      "Search for vehicle maintenance, TSBs, parts, or diagnostic information. Phase 1 uses a lightweight mock/search stub when no API is configured.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_file",
    description: "Read a local text file (notes, manuals excerpts, taste files).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_dir",
    description: "List files in a local directory.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
      },
      required: ["path"],
    },
  },
  {
    name: "calculate",
    description:
      "Evaluate a safe arithmetic expression (fuel economy, unit conversions helpers, simple math).",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Arithmetic expression using numbers and + - * / ( ) .",
        },
      },
      required: ["expression"],
    },
  },
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "search_web":
        return {
          name,
          ok: true,
          output: await searchWeb(String(args.query ?? "")),
        };
      case "read_file":
        return { name, ok: true, output: readFileTool(String(args.path ?? "")) };
      case "list_dir":
        return { name, ok: true, output: listDirTool(String(args.path ?? "")) };
      case "calculate":
        return {
          name,
          ok: true,
          output: calculateTool(String(args.expression ?? "")),
        };
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

  // Optional free DuckDuckGo Instant Answer API (no key). Falls back to guidance stub.
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "CodebaseCLI/0.1" },
      signal: AbortSignal.timeout(6000),
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
        .slice(0, 5)
        .map((t) => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ""}`);
      if (related.length) {
        lines.push("Related:");
        lines.push(...related);
      }
      if (lines.length > 1) return lines.join("\n");
    }
  } catch {
    // fall through to stub
  }

  return [
    `Search stub for: "${q}"`,
    "No rich results available offline.",
    "Suggest verifying with OEM service info, Haynes/Chilton, or a trusted forum for this vehicle.",
    "Useful angles: symptoms + year/make/model, TSB numbers, fluid specs, torque values.",
  ].join("\n");
}

function readFileTool(path: string): string {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`File not found: ${resolved}`);
  const st = statSync(resolved);
  if (!st.isFile()) throw new Error(`Not a file: ${resolved}`);
  if (st.size > 200_000) throw new Error("File too large (>200KB) for Phase 1 read_file");
  return readFileSync(resolved, "utf8");
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
