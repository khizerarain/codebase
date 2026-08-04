/**
 * Pluggable input sources for the chat loop.
 * Voice can be added later without rewriting the agent.
 */
export interface InputProvider {
  readonly id: string;
  readonly label: string;
  getInput(prompt?: string): Promise<string>;
  /** Optional cleanup (close readline, mic, etc.). */
  close?(): void | Promise<void>;
}

export type InputProviderKind = "auto" | "terminal" | "piped" | "voice";
