#!/usr/bin/env node
import { buildProgram } from "./cli.js";
import { friendlyError } from "./utils/errors.js";

async function main(): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  console.error(friendlyError(err));
  process.exit(1);
});
