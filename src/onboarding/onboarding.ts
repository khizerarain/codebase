import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { z } from "zod";
import type { DataPaths } from "../config/config.js";
import type { VehicleStore } from "../vehicles/vehicles.js";

const MetaSchema = z.object({
  onboardingComplete: z.boolean().default(false),
  firstRunAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type OnboardingMeta = z.infer<typeof MetaSchema>;

function metaPath(paths: DataPaths): string {
  return join(paths.root, "meta.json");
}

export function loadMeta(paths: DataPaths): OnboardingMeta {
  const file = metaPath(paths);
  if (!existsSync(file)) {
    return MetaSchema.parse({ onboardingComplete: false });
  }
  try {
    return MetaSchema.parse(JSON.parse(readFileSync(file, "utf8")) as unknown);
  } catch {
    return MetaSchema.parse({ onboardingComplete: false });
  }
}

export function saveMeta(paths: DataPaths, meta: OnboardingMeta): void {
  writeFileSync(metaPath(paths), JSON.stringify(MetaSchema.parse(meta), null, 2), "utf8");
}

export function needsOnboarding(paths: DataPaths, vehicles: VehicleStore): boolean {
  const meta = loadMeta(paths);
  if (meta.onboardingComplete) return false;
  // Also treat empty vehicle garage as needing guidance once
  return vehicles.list().length === 0 || !meta.onboardingComplete;
}

export function markOnboardingComplete(paths: DataPaths): void {
  const meta = loadMeta(paths);
  saveMeta(paths, {
    ...meta,
    onboardingComplete: true,
    firstRunAt: meta.firstRunAt ?? new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });
}

export function printOnboarding(vehiclesEmpty: boolean): void {
  console.log();
  console.log(chalk.bold.white("  Welcome to Codebase"));
  console.log(chalk.dim("  Terminal-first AI vehicle agent · local & private"));
  console.log(chalk.dim("  ─────────────────────────────────────────────"));
  console.log();
  console.log(chalk.white("  How taste learning works"));
  console.log(
    chalk.dim(
      "  After each answer, Accept / Reject / Edit. Codebase learns your DIY level,",
    ),
  );
  console.log(
    chalk.dim(
      "  parts quality, budget, and risk preferences — stored only on this machine.",
    ),
  );
  console.log();
  console.log(chalk.white("  Start here"));
  if (vehiclesEmpty) {
    console.log(
      chalk.cyan("  1."),
      "Add your vehicle:",
      chalk.green("/vehicles add 2018 Toyota Tacoma 92000 gas"),
    );
  } else {
    console.log(chalk.cyan("  1."), "Confirm active vehicle:", chalk.green("/active"));
  }
  console.log(chalk.cyan("  2."), "Ask a question or run:", chalk.green("/schedule"));
  console.log(chalk.cyan("  3."), "Teach taste:", chalk.green("/accept"), "·", chalk.green("/reject"), "·", chalk.green("/edit"));
  console.log();
  console.log(chalk.white("  Useful commands"));
  console.log(
    chalk.dim("  /help  /safety  /plan  /diagnose  /parts  /export plan  /config  /taste"),
  );
  console.log();
  console.log(
    chalk.yellow("  Safety:"),
    chalk.dim("suggestions only — never a certified diagnosis. See /safety"),
  );
  console.log();
}

export function printEmptyGarageHint(): void {
  console.log(
    chalk.dim(
      "  Empty garage — add a vehicle so schedules and diagnostics stay grounded:",
    ),
  );
  console.log(chalk.green("  /vehicles add <year> <make> <model> [mileage] [gas|diesel|hybrid|ev]"));
  console.log();
}
