import type { AutomationAlert } from "./types.js";
import type { WatchdogEngine } from "./engine.js";

const ICON = {
  urgent: "●",
  watch: "◎",
  info: "○",
} as const;

export function formatAlertList(alerts: AutomationAlert[], title = "Proactive insights"): string {
  if (!alerts.length) {
    return [
      title,
      "─".repeat(Math.min(title.length, 28)),
      "Nothing urgent from enabled watchdogs.",
      "Run `/watchdogs run` anytime · tune with `/watchdogs list`",
    ].join("\n");
  }

  const blocks = alerts.map((a, i) => {
    const where = a.vehicleLabel ? ` · ${a.vehicleLabel}` : "";
    const cmds = a.suggestedCommands.length
      ? `  → try: ${a.suggestedCommands.slice(0, 3).join(" · ")}`
      : "";
    return [
      `${i + 1}. ${ICON[a.severity]} [${a.severity}] ${a.title}${where}`,
      `   why: ${a.reason}`,
      cmds,
      `   id: ${a.id.slice(0, 8)} · dismiss: /watchdogs dismiss ${a.id.slice(0, 8)}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    title,
    "─".repeat(Math.min(title.length + 4, 32)),
    ...blocks,
    "",
    "Suggestions only — not mandates. Safety: /safety · controls: /watchdogs",
  ].join("\n");
}

export function formatWatchdogList(engine: WatchdogEngine): string {
  const state = engine.store.load();
  const lines = engine.listDefinitions().map((d) => {
    const on = engine.isEnabled(d.id);
    const last = state.lastRunAt[d.id];
    return [
      `• [${on ? "ON " : "off"}] ${d.id}`,
      `  ${d.name} — ${d.description}`,
      last ? `  last run: ${last.slice(0, 19)}` : "  last run: (never)",
    ].join("\n");
  });

  return [
    "Watchdogs",
    "─────────",
    `Assertiveness: ${engine.assertiveness()} · max briefing alerts: ${engine.maxAlerts()}`,
    "",
    ...lines,
    "",
    "Commands: /watchdogs enable|disable <id> · /watchdogs run · /watchdogs briefing",
    "          /watchdogs dismiss <id> · /watchdogs clear-dismissals · /watchdogs history",
    "Config:   /config set automation.assertiveness quiet|normal|assertive",
    "          /config set automation.briefingOnStart true|false",
  ].join("\n");
}

export function formatGarageBriefing(alerts: AutomationAlert[]): string {
  return formatAlertList(alerts, "Garage briefing");
}

/** Compact one-liner block to append under /status /due /health. */
export function formatProactiveAppendix(alerts: AutomationAlert[]): string {
  if (!alerts.length) return "";
  const top = alerts.slice(0, 3);
  return [
    "",
    "Proactive (watchdogs)",
    ...top.map(
      (a) =>
        `• ${ICON[a.severity]} ${a.title}${a.suggestedCommands[0] ? ` → ${a.suggestedCommands[0]}` : ""}`,
    ),
    alerts.length > 3 ? `• … +${alerts.length - 3} more (/watchdogs run)` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
