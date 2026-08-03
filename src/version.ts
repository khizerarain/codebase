import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function readPackageVersion(): string {
  try {
    // Prefer dist-adjacent package.json when installed; fall back to repo root.
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(here, "..", "package.json"),
      join(here, "..", "..", "package.json"),
    ];
    for (const file of candidates) {
      try {
        const pkg = require(file) as { version?: string; name?: string };
        if (pkg.version) return pkg.version;
      } catch {
        // try next
      }
    }
  } catch {
    // ignore
  }
  return "0.9.0";
}

export const APP_NAME = "codebase";
export const APP_VERSION = readPackageVersion();

export function formatVersionLine(): string {
  return `${APP_NAME} ${APP_VERSION}`;
}

export function formatAbout(): string {
  return [
    "Codebase — terminal-first AI vehicle agent",
    "─────────────────────────────────────────",
    `Version:     ${APP_VERSION}`,
    "License:     MIT",
    "Repository:  https://github.com/khizerarain/codebase",
    "",
    "What it is",
    "  A local-first garage intelligence CLI that learns your vehicle taste,",
    "  plans maintenance, supports diagnosis, and keeps ownership data private.",
    "",
    "Who it is for",
    "  DIY owners, multi-vehicle households, and anyone who wants decision",
    "  support without cloud accounts or a web dashboard.",
    "",
    "Privacy",
    "  No accounts · no cloud sync · no telemetry",
    "  Data lives in ~/.codebase (or CODEBASE_HOME / project .codebase)",
    "",
    "Safety",
    "  Decision-support only — not a certified mechanic. See /safety",
    "",
    "Docs",
    "  README · docs/install.md · docs/commands.md · docs/troubleshooting.md",
    "",
    "Commands: /help · /version · /status · /doctor · /config",
  ].join("\n");
}
