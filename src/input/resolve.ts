import type { Config } from "../config/config.js";
import { PipedInputProvider } from "./piped.js";
import { TerminalInputProvider, type TerminalInputOptions } from "./terminal.js";
import type { InputProvider } from "./types.js";
import { VoiceInputProvider } from "./voice.js";

export interface ResolveInputOptions extends TerminalInputOptions {
  /** Force a provider (tests / CLI flags). */
  force?: "terminal" | "piped" | "voice";
}

/** Pick an input provider; degrade cleanly when voice/TTY unavailable. */
export function resolveInputProvider(
  config: Config,
  opts: ResolveInputOptions = {},
): InputProvider {
  const kind = opts.force ?? config.interaction?.input ?? "auto";

  if (kind === "voice") {
    if (!config.interaction?.voiceEnabled) {
      // Explicit voice request but disabled → terminal with clear path
      return new TerminalInputProvider({
        history: opts.history,
        historySize: opts.historySize,
        completer: opts.completer,
      });
    }
    return new VoiceInputProvider({
      engine: config.interaction.voiceEngine ?? "none",
    });
  }

  if (kind === "piped" || (kind === "auto" && !process.stdin.isTTY)) {
    return new PipedInputProvider();
  }

  return new TerminalInputProvider({
    history: opts.history,
    historySize: opts.historySize,
    completer: opts.completer,
  });
}
