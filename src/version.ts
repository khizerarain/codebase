import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_DISPLAY_NAME,
  APP_NAME,
  APP_PITCH,
  APP_TAGLINE,
  APP_VALUE_PROPS,
  DATA_DIR_NAME,
  ENV_HOME,
  PUBLIC_SAFETY_BLURB,
  REPO_URL,
} from "./brand.js";

const require = createRequire(import.meta.url);

function readPackageVersion(): string {
  try {
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
  return "0.14.0";
}

export { APP_NAME, APP_DISPLAY_NAME, APP_TAGLINE };
export const APP_VERSION = readPackageVersion();

export function formatVersionLine(): string {
  return `${APP_NAME} ${APP_VERSION}`;
}

export function formatAbout(): string {
  return [
    `${APP_DISPLAY_NAME} — ${APP_TAGLINE}`,
    "─────────────────────────────────────────",
    `Version:     ${APP_VERSION}`,
    "License:     MIT",
    `Repository:  ${REPO_URL}`,
    "",
    "What it is",
    `  ${APP_PITCH}`,
    "",
    "Why it's different",
    ...APP_VALUE_PROPS.map((v) => `  • ${v}`),
    "",
    "Privacy",
    "  No accounts · no cloud sync · no telemetry",
    `  Data lives in ~/${DATA_DIR_NAME} (or ${ENV_HOME} / project .bay)`,
    "",
    "Safety",
    `  ${PUBLIC_SAFETY_BLURB}`,
    "  See /safety",
    "",
    "Docs",
    "  README · docs/install.md · docs/launch.md · docs/commands.md",
    "",
    "Commands: /help · /version · /status · /doctor · /config",
  ].join("\n");
}
