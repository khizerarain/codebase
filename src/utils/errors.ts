/** User-facing error helpers — never dump raw stack traces in the CLI. */

export function friendlyError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message || "Unknown error";

    if (/OPENROUTER_API_KEY/i.test(msg)) {
      return "OpenRouter API key missing. Set OPENROUTER_API_KEY or switch with /config set provider ollama.";
    }
    if (/Cannot reach Ollama|ECONNREFUSED|fetch failed/i.test(msg)) {
      return "Could not reach the LLM provider. Check that Ollama is running or your network/API key is valid.";
    }
    if (/OpenRouter error|Ollama error/i.test(msg)) {
      return `LLM provider error: ${shorten(msg, 220)}`;
    }
    if (/Vehicle not found/i.test(msg)) {
      return msg;
    }
    if (/ENOENT/i.test(msg)) {
      return "File or directory not found. Check the path and try again.";
    }
    if (/timeout|AbortError/i.test(msg)) {
      return "The request timed out. Try again, or narrow the question.";
    }
    return shorten(msg, 280);
  }
  return shorten(String(err), 280);
}

export function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
