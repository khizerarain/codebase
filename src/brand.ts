/**
 * Frozen product identity (Phase 14).
 * Single source of truth for display name, CLI, env vars, and data dirs.
 */

/** CLI / package binary name */
export const APP_NAME = "bay";

/** Human-facing product name */
export const APP_DISPLAY_NAME = "Bay";

/** One-sentence positioning */
export const APP_TAGLINE =
  "Local-first AI garage agent that learns how you take care of your vehicles.";

/** Slightly longer pitch (README / about) */
export const APP_PITCH =
  "Bay is a terminal-first garage intelligence CLI: add vehicles, diagnose issues, plan service, track ownership health, and teach it your taste — all on your machine, with no accounts or cloud sync.";

export const APP_VALUE_PROPS = [
  "Learns your vehicle taste from Accept / Reject / Edit — not a generic chatbot.",
  "Real garage workflows: diagnose, service plans, due items, ownership reports, mock OBD.",
  "Local-first and private by default — data stays under ~/.bay.",
] as const;

/** Default user data directory name under $HOME */
export const DATA_DIR_NAME = ".bay";

/** Project-local data directory name */
export const LOCAL_DATA_DIR_NAME = ".bay";

/** Env: override data root */
export const ENV_HOME = "BAY_HOME";

/** Env: provider openrouter|ollama */
export const ENV_PROVIDER = "BAY_PROVIDER";

/** Env: verbose timing logs */
export const ENV_VERBOSE = "BAY_VERBOSE";

/** Legacy names from pre-launch "codebase" identity — still honored for data migration */
export const LEGACY_DATA_DIR_NAME = ".codebase";
export const LEGACY_ENV_HOME = "CODEBASE_HOME";
export const LEGACY_ENV_PROVIDER = "CODEBASE_PROVIDER";
export const LEGACY_ENV_VERBOSE = "CODEBASE_VERBOSE";

export const REPO_URL = "https://github.com/khizerarain/codebase";
export const DOCS_SAFETY = "docs/safety.md";

export const PUBLIC_SAFETY_BLURB =
  "Decision-support only — not a certified mechanic. Diagnoses are ranked hypotheses, never certainty. High-risk systems (brakes, steering, airbags, EV high-voltage) warrant professional inspection.";
