/**
 * Short aliases → full slash commands.
 * Applied before the main command router.
 */

export const ALIAS_MAP: Record<string, string> = {
  // Core garage
  "/g": "/garage",
  "/ga": "/garage",
  "/du": "/due",
  "/dueg": "/due garage",
  "/h": "/health",
  "/hg": "/health garage",
  "/o": "/ownership",
  "/og": "/ownership garage",
  "/attn": "/attention",
  "/a": "/attention",
  "/st": "/status",
  "/i": "/insights",

  // Diagnose / service
  "/d": "/diagnose",
  "/dx": "/diagnose",
  "/svc": "/service",
  "/s": "/service",
  "/p": "/prep",
  "/sch": "/schedule",

  // OBD
  "/ob": "/obd status",
  "/snap": "/obd snapshot",
  "/dtc": "/obd dtc",
  "/mon": "/obd monitor",

  // Watchdogs / briefing
  "/w": "/watchdogs briefing",
  "/br": "/watchdogs briefing",
  "/wr": "/watchdogs run",

  // Taste / session
  "/ok": "/accept",
  "/no": "/reject",
  "/t": "/taste",
  "/?": "/help",
  "/v": "/version",

  // Mode / quick
  "/mg": "/mode garage",
  "/mn": "/mode normal",
  "/q": "/quick",
};

export function expandAlias(line: string, aliasesEnabled = true): string {
  if (!aliasesEnabled || !line.startsWith("/")) return line;
  const parts = line.trim().split(/\s+/);
  const head = parts[0]!.toLowerCase();
  const mapped = ALIAS_MAP[head];
  if (!mapped) return line;
  const rest = parts.slice(1).join(" ");
  // If alias already expands to a multi-word command and user added args, append
  if (!rest) return mapped;
  // e.g. /d squeal brakes → /diagnose squeal brakes
  if (mapped.includes(" ")) {
    // Fixed target like /due garage — append only if user added more
    return `${mapped} ${rest}`.trim();
  }
  return `${mapped} ${rest}`.trim();
}

export function aliasHelp(): string {
  const rows = Object.entries(ALIAS_MAP)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([a, b]) => `  ${a.padEnd(8)} → ${b}`);
  return ["Command aliases", "───────────────", ...rows, "", "Toggle: /config set interaction.aliases true|false"].join(
    "\n",
  );
}

/** Tab-completion candidates for readline completer. */
export function completionCandidates(): string[] {
  const cmds = [
    "/help",
    "/garage",
    "/due",
    "/diagnose",
    "/service",
    "/log",
    "/obd",
    "/ownership",
    "/health",
    "/watchdogs",
    "/mode",
    "/quick",
    "/pretrip",
    "/snap",
    "/aliases",
    "/vehicles",
    "/status",
    "/attention",
    "/accept",
    "/reject",
    "/clear",
    "/exit",
    ...Object.keys(ALIAS_MAP),
  ];
  return [...new Set(cmds)].sort();
}

export function makeCompleter(): (line: string) => [string[], string] {
  const all = completionCandidates();
  return (line: string) => {
    const hit = all.filter((c) => c.startsWith(line));
    return [hit.length ? hit : all.filter((c) => c.startsWith("/")), line];
  };
}
