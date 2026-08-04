import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { z } from "zod";
import { APP_DISPLAY_NAME, APP_TAGLINE } from "../brand.js";
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
  console.log(chalk.bold.white(`  Welcome to ${APP_DISPLAY_NAME}`));
  console.log(chalk.dim(`  ${APP_TAGLINE}`));
  console.log(chalk.dim("  ─────────────────────────────────────────────"));
  console.log();
  console.log(chalk.white("  How taste learning works"));
  console.log(
    chalk.dim(
      `  After each answer, Accept / Reject / Edit. ${APP_DISPLAY_NAME} learns your DIY level,`,
    ),
  );
  console.log(
    chalk.dim(
      "  parts quality, budget, and risk preferences — stored only on this machine.",
    ),
  );
  console.log();
  console.log(chalk.white("  Start here (90-second path)"));
  if (vehiclesEmpty) {
    console.log(
      chalk.cyan("  1."),
      "Add your vehicle:",
      chalk.green("/vehicles add 2018 Toyota Tacoma 92000 gas"),
    );
  } else {
    console.log(chalk.cyan("  1."), "Confirm active vehicle:", chalk.green("/active"));
  }
  console.log(chalk.cyan("  2."), "Try:", chalk.green("/diagnose brake squeal cold"), "or", chalk.green("/due"));
  console.log(chalk.cyan("  3."), "Teach taste:", chalk.green("/accept"), "·", chalk.green("/reject"), "·", chalk.green("/edit"));
  console.log(chalk.cyan("  4."), "Optional demo OBD:", chalk.green("/obd connect mock"));
  console.log();
  console.log(chalk.white("  Useful commands"));
  console.log(
    chalk.dim(
      "  /help  /quick  /about  /safety  /service  /ownership  /report  /garage",
    ),
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
