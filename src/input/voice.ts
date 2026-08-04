import type { InputProvider } from "./types.js";

export interface VoiceInputOptions {
  /** Future: local whisper.cpp binary, vosk model path, etc. */
  engine?: "none" | "local";
  modelPath?: string;
}

/**
 * Local-first voice-to-text skeleton.
 * Does not call any cloud speech API. Connect a local STT later.
 */
export class VoiceInputProvider implements InputProvider {
  readonly id = "voice";
  readonly label = "Voice (skeleton)";
  private readonly opts: VoiceInputOptions;

  constructor(opts: VoiceInputOptions = {}) {
    this.opts = opts;
  }

  async getInput(_prompt?: string): Promise<string> {
    throw new Error(
      [
        "Voice input is not fully wired yet (local-first skeleton).",
        "No cloud speech API is used.",
        "",
        "To finish later:",
        "1. Capture mic audio locally",
        "2. Transcribe with a local STT engine (whisper.cpp / vosk / etc.)",
        "3. Return the transcript string from getInput()",
        "",
        `Config: interaction.voiceEnabled=true · engine=${this.opts.engine ?? "none"}`,
        "Until then: use terminal input, or pipe text via stdin.",
      ].join("\n"),
    );
  }
}
