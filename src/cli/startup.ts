import { accessSync, constants, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Config, DataPaths } from "../config/config.js";
import { APP_VERSION } from "../version.js";
import { logger } from "../utils/logger.js";

export interface StartupCheck {
  ok: boolean;
  level: "ok" | "warn" | "error";
  message: string;
}

/** Non-destructive startup diagnostics for misconfiguration. */
export function runStartupDiagnostics(
  paths: DataPaths,
  config: Config,
): StartupCheck[] {
  const checks: StartupCheck[] = [];

  const major = Number(process.versions.node.split(".")[0] ?? 0);
  if (major < 20) {
    checks.push({
      ok: false,
      level: "error",
      message: `Node.js ${process.versions.node} detected — Codebase needs Node 20+`,
    });
  } else {
    checks.push({
      ok: true,
      level: "ok",
      message: `Node.js ${process.versions.node}`,
    });
  }

  try {
    mkdirSync(paths.root, { recursive: true });
    const probe = join(paths.root, ".write-probe");
    writeFileSync(probe, "ok", "utf8");
    unlinkSync(probe);
    checks.push({
      ok: true,
      level: "ok",
      message: `Data directory writable: ${paths.root}`,
    });
  } catch (err) {
    checks.push({
      ok: false,
      level: "error",
      message: `Cannot write data directory ${paths.root}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (config.provider === "openrouter") {
    if (!config.openrouter.apiKey) {
      checks.push({
        ok: false,
        level: "warn",
        message:
          "OpenRouter selected but OPENROUTER_API_KEY is missing — chat will fail until set, or use --provider ollama",
      });
    } else {
      checks.push({
        ok: true,
        level: "ok",
        message: `OpenRouter model: ${config.openrouter.model}`,
      });
    }
  } else {
    checks.push({
      ok: true,
      level: "ok",
      message: `Ollama target: ${config.ollama.model} @ ${config.ollama.baseUrl}`,
    });
  }

  // Ensure bin/runtime can see dist when users forget to build (dev only hint)
  try {
    accessSync(join(paths.root, ".."), constants.R_OK);
  } catch {
    // ignore
  }

  return checks;
}

export function printStartupDiagnostics(
  paths: DataPaths,
  config: Config,
  opts: { verbose?: boolean } = {},
): boolean {
  const checks = runStartupDiagnostics(paths, config);
  const errors = checks.filter((c) => c.level === "error");
  const warns = checks.filter((c) => c.level === "warn");

  if (opts.verbose || errors.length || warns.length) {
    logger.dim(`  codebase ${APP_VERSION} · startup checks`);
    for (const c of checks) {
      if (c.level === "error") logger.error(c.message);
      else if (c.level === "warn") logger.warn(c.message);
      else if (opts.verbose) logger.dim(`  ✓ ${c.message}`);
    }
  } else {
    // Quiet happy path: only surface warns/errors; one dim version line
    logger.dim(`  v${APP_VERSION}`);
  }

  return errors.length === 0;
}
