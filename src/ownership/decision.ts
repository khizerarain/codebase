import { withSafetyFooter } from "../agent/safety.js";
import type { TasteManager } from "../taste/taste.js";
import type { Vehicle, VehicleStore } from "../vehicles/vehicles.js";
import { buildInspectionChecklist } from "../workflows/servicePlans.js";
import { OwnershipEngine, type OwnershipSnapshot } from "./engine.js";

export type DecisionFrame = "buy" | "keep" | "sell" | "compare";

/**
 * Decision-support only — framed as assistance, never advice.
 */
export function buildPrePurchaseReport(
  vehicle: Vehicle | undefined,
  taste: TasteManager,
  ownership?: OwnershipEngine,
): string {
  const checklist = buildInspectionChecklist("pre-purchase", vehicle);
  const snap = vehicle && ownership ? ownership.analyzeVehicle(vehicle) : null;
  const tasteLine = taste.compactTasteSummary().split("\n").slice(0, 4).join("\n");

  const risk = snap
    ? [
        "## Risk highlights (from local data)",
        `History gap risk: **${snap.reliability.historyGapRisk}**`,
        `Known issues: ${snap.reliability.knownIssueCount}`,
        `Ownership health (if this were your logged profile): ${snap.health.grade} (${snap.health.score}/100)`,
        "",
        "Gaps / watchouts:",
        ...riskBullets(snap),
      ]
    : [
        "## Risk highlights",
        "- No vehicle profile linked — treat as blank-slate inspection.",
        "- Ask seller for service records, title status, and accident history.",
      ];

  const body = [
    "# Pre-Purchase Decision Support Report",
    "",
    `_Generated ${new Date().toISOString().slice(0, 10)}_`,
    vehicle
      ? `**Subject:** ${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.currentMileage.toLocaleString()} mi`
      : "**Subject:** (unspecified — add a vehicle or note year/make/model)",
    "",
    "> Assistance only — not a certification, appraisal, or recommendation to buy.",
    "",
    "## Taste context",
    tasteLine || "_No taste summary yet._",
    "",
    ...risk,
    "",
    "## Structured inspection checklist",
    checklist.replace(/^# .+\n/, ""),
    "",
    "## Suggested decision frame (not advice)",
    "1. **Walk away signals:** unresolved title, structural rust, brake/steering defects, accident concealment, no records on high-mileage example.",
    "2. **Negotiate signals:** overdue maintenance, wear items due soon, incomplete history (price in catch-up service).",
    "3. **Proceed-to-PPI:** any vehicle you seriously want — independent pre-purchase inspection still wins.",
    "",
    "### Action if you proceed",
    "- Complete checklist items you can verify safely",
    "- Budget catch-up service using `/report ownership` style cost bands after purchase",
    "- Log baseline with `/log` once owned",
  ].join("\n");

  return withSafetyFooter(body, "pre-purchase");
}

export function buildOwnershipDecision(
  frame: DecisionFrame,
  vehicles: VehicleStore,
  taste: TasteManager,
  ownership: OwnershipEngine,
  idA?: string,
  idB?: string,
): string {
  if (frame === "compare") {
    return buildCompareDecision(vehicles, ownership, taste, idA, idB);
  }

  const v = idA ? vehicles.get(idA) : vehicles.getActive();
  if (!v) throw new Error("Need an active vehicle (or pass an id).");
  const snap = ownership.analyzeVehicle(v);
  const tasteNotes = snap.tasteNotes;

  const title =
    frame === "buy"
      ? "Should I buy? (decision support)"
      : frame === "keep"
        ? "Should I keep? (decision support)"
        : "Should I sell? (decision support)";

  const factors = [
    `Health grade **${snap.health.grade}** (${snap.health.score}/100)`,
    `Logged spend $${snap.cost.loggedPartsAndService.toFixed(0)} · $/mi ${snap.cost.costPerMile != null ? `$${snap.cost.costPerMile.toFixed(3)}` : "n/a"}`,
    `${snap.health.overdueCount} overdue · ${snap.health.dueSoonCount} due soon`,
    `History gap risk: ${snap.reliability.historyGapRisk}`,
    ...snap.reliability.topIssues.slice(0, 3).map((i) => `Issue: ${i}`),
  ];

  const lean = leanDirection(frame, snap);

  return withSafetyFooter(
    [
      `# ${title}`,
      "",
      `_Generated ${new Date().toISOString().slice(0, 10)}_`,
      `**Vehicle:** ${snap.label} · ${snap.mileage.toLocaleString()} mi`,
      "",
      "> Not financial, legal, or mechanical advice. Local heuristics + your taste only.",
      "",
      "## Factors from your data",
      ...factors.map((f) => `- ${f}`),
      "",
      "## Taste lens",
      tasteNotes,
      "",
      "## Suggestion (options)",
      lean.suggestion,
      "",
      "## Action (if you proceed)",
      ...lean.actions.map((a) => `- ${a}`),
    ].join("\n"),
    frame,
  );
}

function buildCompareDecision(
  vehicles: VehicleStore,
  ownership: OwnershipEngine,
  taste: TasteManager,
  idA?: string,
  idB?: string,
): string {
  if (!idA || !idB) {
    throw new Error("Usage: /decide compare <idA> <idB>");
  }
  const a = vehicles.get(idA);
  const b = vehicles.get(idB);
  if (!a || !b) throw new Error("Both vehicle ids must exist in the garage.");
  const sa = ownership.analyzeVehicle(a);
  const sb = ownership.analyzeVehicle(b);

  const winnerHealth = sa.health.score >= sb.health.score ? sa : sb;
  const winnerCost =
    (sa.cost.costPerMile ?? Infinity) <= (sb.cost.costPerMile ?? Infinity) ? sa : sb;

  return withSafetyFooter(
    [
      "# Ownership comparison (decision support)",
      "",
      `_Generated ${new Date().toISOString().slice(0, 10)}_`,
      "",
      "| Factor | A | B |",
      "|--------|---|---|",
      `| Vehicle | ${sa.label} | ${sb.label} |`,
      `| Mileage | ${sa.mileage.toLocaleString()} | ${sb.mileage.toLocaleString()} |`,
      `| Health | ${sa.health.grade} (${sa.health.score}) | ${sb.health.grade} (${sb.health.score}) |`,
      `| Logged $ | ${sa.cost.loggedPartsAndService.toFixed(0)} | ${sb.cost.loggedPartsAndService.toFixed(0)} |`,
      `| $/mi | ${fmtCpm(sa)} | ${fmtCpm(sb)} |`,
      `| Overdue | ${sa.health.overdueCount} | ${sb.health.overdueCount} |`,
      `| Issues | ${sa.reliability.knownIssueCount} | ${sb.reliability.knownIssueCount} |`,
      `| History gap | ${sa.reliability.historyGapRisk} | ${sb.reliability.historyGapRisk} |`,
      "",
      "## Suggestion (not a verdict)",
      `- Stronger ownership-health signal: **${winnerHealth.label}**`,
      `- Lower observed $/mi signal: **${winnerCost.label}**`,
      "- Weight safety/overdue items over pure cost if taste favors reliability.",
      "",
      "## Taste",
      taste.compactTasteSummary().split("\n").slice(0, 5).join("\n"),
      "",
      "## Action",
      "- Use `/inspect pre-purchase` if acquiring either",
      "- Use `/report ownership` on each before a keep/sell call",
    ].join("\n"),
    "compare",
  );
}

function fmtCpm(s: OwnershipSnapshot): string {
  return s.cost.costPerMile != null ? `$${s.cost.costPerMile.toFixed(3)}` : "n/a";
}

function riskBullets(snap: OwnershipSnapshot): string[] {
  const out: string[] = [];
  if (snap.reliability.historyGapRisk !== "low") {
    out.push(`- Service history looks thin for mileage (${snap.reliability.historyGapRisk} gap risk)`);
  }
  if (snap.health.overdueCount) {
    out.push(`- ${snap.health.overdueCount} overdue maintenance item(s) if intervals apply`);
  }
  for (const issue of snap.reliability.topIssues.slice(0, 4)) {
    out.push(`- Known issue on file: ${issue}`);
  }
  if (!out.length) out.push("- No strong red flags in local profile — still verify in person.");
  return out;
}

function leanDirection(
  frame: DecisionFrame,
  snap: OwnershipSnapshot,
): { suggestion: string; actions: string[] } {
  const stressed = snap.health.score < 60 || snap.reliability.historyGapRisk === "high";
  if (frame === "buy") {
    return {
      suggestion: stressed
        ? "Data leans cautious — price in catch-up work or walk if title/structure/safety issues appear on PPI."
        : "Local profile is not screaming danger, but a professional PPI still belongs in the loop before money moves.",
      actions: [
        "Run full pre-purchase checklist",
        "Budget near-term due items from predictions",
        "Verify title, liens, and accident history outside this tool",
      ],
    };
  }
  if (frame === "keep") {
    return {
      suggestion: stressed
        ? "Keeping is viable if you fund overdue/safety items soon; otherwise carrying cost + risk may dominate."
        : "Health signals support continued ownership if the vehicle still fits your use and taste.",
      actions: [
        "Clear overdue items (`/due`)",
        "Track cost/mi with `/log` + `/costs`",
        "Revisit if known issues recur",
      ],
    };
  }
  // sell
  return {
    suggestion: stressed
      ? "Rising catch-up needs / weak history can support a sell-or-rehome conversation — still run numbers for your market."
      : "No strong push to sell from health alone; decide from use-case fit, cash needs, and upcoming big jobs.",
    actions: [
      "List overdue + known issues honestly for buyers",
      "Generate `/report health` and `/report ownership` for your records",
      "Compare against a candidate via `/decide compare`",
    ],
  };
}
