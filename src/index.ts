#!/usr/bin/env node
import { buildProgram } from "./cli.js";

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
