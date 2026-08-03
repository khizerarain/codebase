import { describe, expect, it } from "vitest";
import { friendlyError } from "../src/utils/errors.js";

describe("friendlyError", () => {
  it("maps provider/network failures to readable messages", () => {
    expect(friendlyError(new Error("OPENROUTER_API_KEY is not set"))).toMatch(
      /OpenRouter API key/i,
    );
    expect(friendlyError(new Error("Cannot reach Ollama at localhost"))).toMatch(
      /Could not reach/i,
    );
    expect(friendlyError(new Error("something timeout happened"))).toMatch(/timed out/i);
  });
});
