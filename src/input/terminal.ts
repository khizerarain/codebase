import * as readline from "node:readline/promises";
import type { Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import type { InputProvider } from "./types.js";

export interface TerminalInputOptions {
  history?: string[];
  historySize?: number;
  completer?: (line: string) => [string[], string];
}

/** Interactive TTY input with optional history + tab completion. */
export class TerminalInputProvider implements InputProvider {
  readonly id = "terminal";
  readonly label = "Terminal";
  private rl: Interface;

  constructor(opts: TerminalInputOptions = {}) {
    this.rl = readline.createInterface({
      input,
      output,
      terminal: true,
      history: opts.history ?? [],
      historySize: opts.historySize ?? 200,
      ...(opts.completer ? { completer: opts.completer } : {}),
    });
  }

  async getInput(prompt = chalk.bold.green("you › ")): Promise<string> {
    const line = await this.rl.question(prompt);
    return line.trim();
  }

  /** Expose for SIGINT / legacy callers that still need the interface. */
  getReadline(): Interface {
    return this.rl;
  }

  close(): void {
    this.rl.close();
  }
}
