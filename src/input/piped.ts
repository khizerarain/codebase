import * as readline from "node:readline/promises";
import { stdin as input } from "node:process";
import type { InputProvider } from "./types.js";

/**
 * Non-interactive / piped stdin — one line per getInput().
 * Ends the session when stdin closes (empty read after EOF).
 */
export class PipedInputProvider implements InputProvider {
  readonly id = "piped";
  readonly label = "Piped stdin";
  private readonly rl: readline.Interface;
  private done = false;

  constructor() {
    this.rl = readline.createInterface({ input, crlfDelay: Infinity });
  }

  async getInput(_prompt?: string): Promise<string> {
    if (this.done) return "/exit";
    const iter = this.rl[Symbol.asyncIterator]();
    const next = await iter.next();
    if (next.done) {
      this.done = true;
      return "/exit";
    }
    return String(next.value ?? "").trim();
  }

  close(): void {
    this.done = true;
    this.rl.close();
  }
}
