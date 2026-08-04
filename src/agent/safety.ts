import chalk from "chalk";

export type RiskLevel = "low" | "medium" | "high";

const HIGH_RISK =
  /\b(brake|brakes|airbag|srs|steering|high[- ]?voltage|hv battery|fuel rail|structural|ball joint|tie rod|caliper|master cylinder|abs module|wheel bearing failure)\b/i;

const MEDIUM_RISK =
  /\b(diagnos|repair|torque|suspension|transmission|coolant|overheat|misfire|no start|fuel system|hub|axle|cv joint|timing|safety)\b/i;

const MAINTENANCE_HINT =
  /\b(oil|filter|wiper|cabin filter|tire rotation|schedule|maintenance|fluid top[- ]?off)\b/i;

/** Safety rules injected into every system prompt. */
export const SAFETY_SYSTEM_BLOCK = `
## Safety & Trust Rules (mandatory)
- Treat all diagnostic conclusions as **suggestions**, never certainty.
- Prefer language like "possible causes", "likely", "worth checking" — never "this is definitely…" or "the problem is…".
- Risk levels:
  - HIGH: brakes, steering, airbags/SRS, fuel system under pressure, structural, EV high-voltage → recommend professional inspection.
  - MEDIUM: powertrain diagnostics, suspension, torque-critical fasteners → caution + verify OEM specs.
  - LOW: routine maintenance / parts research → still verify specs when torque or fluids matter.
- Visually separate **Suggestion** (options / hypotheses) from **Action** (steps only if the user proceeds).
- Do not invent torque specs, part numbers, TSBs, or recall IDs. If unsure, say so.
- Remind the user to verify with OEM service information before torque-critical or safety-critical work.
`.trim();

export const SAFETY_HELP = `
Bay Safety & Limitations
────────────────────────
Bay is a local decision-support agent — not a certified mechanic, not a diagnostic scan tool,
and not a substitute for OEM service procedures.

What it will do
  • Suggest possible causes and checks (never claim certainty)
  • Prefer your learned taste (DIY level, OEM/budget, risk tolerance)
  • Flag high-risk systems and recommend a professional when appropriate
  • Keep all data on your machine

What it will NOT do
  • Guarantee a diagnosis ("this is definitely X")
  • Replace torque specs / procedures from factory service info
  • Authorize unsafe DIY on brakes, steering, airbags, or EV high-voltage systems

Risk levels
  LOW     Routine maintenance, parts research, schedules
  MEDIUM  Diagnostics, repairs involving torque/fluids/powertrain
  HIGH    Brakes, steering, airbags/SRS, structural, EV HV, pressurized fuel

How to read answers
  Suggestion  → hypotheses / options (not a verdict)
  Action      → steps only if you choose to proceed and are equipped to do so

Always verify critical specs with OEM documentation.
`.trim();

export function assessRisk(text: string): RiskLevel {
  if (HIGH_RISK.test(text)) return "high";
  if (MEDIUM_RISK.test(text)) return "medium";
  if (MAINTENANCE_HINT.test(text)) return "low";
  return "low";
}

export function riskLabel(level: RiskLevel): string {
  switch (level) {
    case "high":
      return "HIGH RISK";
    case "medium":
      return "MEDIUM RISK";
    case "low":
      return "LOW RISK";
  }
}

export function riskBanner(level: RiskLevel): string {
  const label = riskLabel(level);
  if (level === "high") {
    return [
      `⚠ ${label} — safety-critical topic`,
      "Suggestion only. Prefer a qualified technician for inspection before continued driving if unsure.",
    ].join("\n");
  }
  if (level === "medium") {
    return [
      `⚠ ${label}`,
      "Treat conclusions as suggestions. Verify torque/specs with OEM service info.",
    ].join("\n");
  }
  return `ℹ ${label} — routine guidance; still verify critical specs when relevant.`;
}

export function safetyFooter(level: RiskLevel): string {
  const base =
    "Safety note: Decision-support only — not a certified diagnosis or repair procedure. Verify critical specs with OEM service info.";
  if (level === "high") {
    return `---\n⚠ ${base}\nStop and use a qualified technician for brakes, steering, airbags, structural, pressurized fuel, or EV high-voltage work when unsure.`;
  }
  if (level === "medium") {
    return `---\n⚠ ${base}\nIf symptoms affect drivability or safety systems, get a professional inspection.`;
  }
  return `---\nℹ ${base}`;
}

/** Apply risk banner + footer; avoid double-stamping. */
export function withSafetyFooter(content: string, contextText?: string): string {
  const level = assessRisk(`${contextText ?? ""}\n${content}`);
  let body = content.trim();
  if (!/Suggestion\s*:/i.test(body) && !/Action\s*:/i.test(body)) {
    body = structureSuggestionAction(body, level);
  }
  if (!body.includes("Safety note:")) {
    body = `${riskBanner(level)}\n\n${body}\n\n${safetyFooter(level)}`;
  } else if (!/LOW RISK|MEDIUM RISK|HIGH RISK/.test(body)) {
    body = `${riskBanner(level)}\n\n${body}`;
  }
  return body;
}

/** Soft structure for answers lacking Suggestion/Action headers. */
export function structureSuggestionAction(content: string, level: RiskLevel): string {
  // Keep tiny low-risk replies uncluttered
  if (content.length < 80 && level === "low") return content;

  if (level === "low" && content.length < 200 && !/possible causes/i.test(content)) {
    return content;
  }

  return [
    "Suggestion:",
    content.trim(),
    "",
    "Action:",
    level === "high"
      ? "- If you proceed, only do checks you are trained/equipped for; otherwise book a professional inspection."
      : "- Proceed only with steps you understand; verify specs before torque-critical work.",
  ].join("\n");
}

export function formatSafetyForTerminal(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (/HIGH RISK/.test(line)) return chalk.red.bold(line);
      if (/MEDIUM RISK/.test(line)) return chalk.yellow(line);
      if (/LOW RISK/.test(line)) return chalk.cyan(line);
      if (/^Suggestion:/i.test(line)) return chalk.bold.white(line);
      if (/^Action:/i.test(line)) return chalk.bold.green(line);
      if (/Safety note:/i.test(line)) return chalk.dim(line);
      return line;
    })
    .join("\n");
}

export function looksSafetyCritical(text: string): boolean {
  return assessRisk(text) === "high";
}
