import chalk from "chalk";

let enabled = false;

export function setVerbose(on: boolean): void {
  enabled = on;
}

export function isVerbose(): boolean {
  return enabled || process.env.CODEBASE_VERBOSE === "1";
}

export function verboseLog(message: string): void {
  if (!isVerbose()) return;
  console.log(chalk.dim(`  … ${message}`));
}

/** Simple timing helper for verbose mode. */
export function timed<T>(label: string, fn: () => T): T {
  if (!isVerbose()) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    verboseLog(`${label}: ${(performance.now() - start).toFixed(1)}ms`);
  }
}

export async function timedAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isVerbose()) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    verboseLog(`${label}: ${(performance.now() - start).toFixed(1)}ms`);
  }
}
