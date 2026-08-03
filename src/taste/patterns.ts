import type { PreferenceCategory, TasteSignal } from "./schema.js";

export interface PatternHit {
  key: string;
  text: string;
  category: PreferenceCategory;
  tags: string[];
  skillSlug: string;
  skillName: string;
  whenToApply: string;
  weight: number;
  polarity: "positive" | "negative";
}

interface PatternDef {
  key: string;
  category: PreferenceCategory;
  tags: string[];
  skillSlug: string;
  skillName: string;
  whenToApply: string;
  positiveText: string;
  negativeText: string;
  matchers: RegExp[];
}

const PATTERNS: PatternDef[] = [
  {
    key: "diy_first",
    category: "diy_vs_shop",
    tags: ["diy", "garage", "wrench", "tools"],
    skillSlug: "diy-first",
    skillName: "DIY First",
    whenToApply: "Maintenance, repairs, and upgrade planning questions",
    positiveText: "Prefer DIY-first guidance with clear steps and tool lists",
    negativeText: "Prefer shop/pro recommendations over DIY walkthroughs",
    matchers: [
      /\bdiy\b/i,
      /\bdo[- ]it[- ]yourself\b/i,
      /\bhome garage\b/i,
      /\bi('ll| will) do it\b/i,
      /\bown tools\b/i,
    ],
  },
  {
    key: "shop_preferred",
    category: "diy_vs_shop",
    tags: ["shop", "dealer", "mechanic", "pro"],
    skillSlug: "shop-preferred",
    skillName: "Shop Preferred",
    whenToApply: "When recommending who should perform the work",
    positiveText: "Prefer professional shop / dealer service over DIY",
    negativeText: "Avoid defaulting to shop-only advice when DIY is reasonable",
    matchers: [
      /\b(take it to|let) (a )?(shop|dealer|mechanic)\b/i,
      /\bprofessional (only|service)\b/i,
      /\bnot diy\b/i,
      /\bleave it to (a )?pro\b/i,
    ],
  },
  {
    key: "oem_preferred",
    category: "part_quality",
    tags: ["oem", "parts", "genuine", "quality"],
    skillSlug: "oem-preferred",
    skillName: "OEM Preferred",
    whenToApply: "Parts recommendations and replacement decisions",
    positiveText: "Prefer OEM / OEM-quality parts over cheap generics",
    negativeText: "Open to aftermarket / value parts when quality is adequate",
    matchers: [
      /\boem\b/i,
      /\bgenuine\b/i,
      /\bdealer part\b/i,
      /\boe[- ]quality\b/i,
      /\boriginal equipment\b/i,
    ],
  },
  {
    key: "budget_conscious",
    category: "budget",
    tags: ["budget", "cheap", "cost", "value", "affordable"],
    skillSlug: "budget-conscious",
    skillName: "Budget Conscious",
    whenToApply: "Parts, fluids, tools, and service cost tradeoffs",
    positiveText: "Prefer budget-conscious options with good value",
    negativeText: "Prefer quality over lowest price",
    matchers: [
      /\bbudget\b/i,
      /\bcheap(er|est)?\b/i,
      /\baffordable\b/i,
      /\bsave money\b/i,
      /\blow[- ]cost\b/i,
      /\bvalue option\b/i,
    ],
  },
  {
    key: "performance_oriented",
    category: "performance",
    tags: ["performance", "mods", "power", "track", "suspension"],
    skillSlug: "performance-oriented",
    skillName: "Performance Oriented",
    whenToApply: "Modifications, upgrades, and performance tradeoffs",
    positiveText: "Prefer performance-oriented upgrades and setups",
    negativeText: "Prefer comfort / reliability over performance mods",
    matchers: [
      /\bperformance\b/i,
      /\bhorsepower\b/i,
      /\btune\b/i,
      /\btrack\b/i,
      /\bmod(s|ifications)?\b/i,
      /\bsuspension upgrade\b/i,
    ],
  },
  {
    key: "safety_first",
    category: "risk",
    tags: ["safety", "risk", "torque", "brakes", "caution"],
    skillSlug: "safety-first",
    skillName: "Safety First",
    whenToApply: "Any repair involving brakes, suspension, airbags, EV HV, or torque-critical fasteners",
    positiveText: "Emphasize safety warnings and when to stop / go to a pro",
    negativeText: "Less cautionary tone; user accepts higher DIY risk (still never skip critical safety)",
    matchers: [
      /\bsafety\b/i,
      /\bunsafe\b/i,
      /\brisk(y)?\b/i,
      /\bdangerous\b/i,
      /\btorque\b/i,
      /\bprofessional (service|help)\b/i,
    ],
  },
  {
    key: "checklist_style",
    category: "communication",
    tags: ["checklist", "steps", "concise", "bullet"],
    skillSlug: "checklist-style",
    skillName: "Checklist Style",
    whenToApply: "How-to answers, maintenance plans, and diagnostics",
    positiveText: "Prefer concise checklists and step-by-step bullets",
    negativeText: "Prefer fuller narrative explanations over terse lists",
    matchers: [
      /\bchecklist\b/i,
      /\bstep[- ]by[- ]step\b/i,
      /\bbullet(s|ed)?\b/i,
      /\btoo long\b/i,
      /\bmore concise\b/i,
      /\btldr\b/i,
    ],
  },
  {
    key: "preventive_maintenance",
    category: "maintenance_style",
    tags: ["maintenance", "interval", "preventive", "schedule"],
    skillSlug: "preventive-maintenance",
    skillName: "Preventive Maintenance",
    whenToApply: "Service intervals, fluid changes, and ownership planning",
    positiveText: "Prefer preventive / early maintenance over waiting for failure",
    negativeText: "Prefer run-to-fail / deferred maintenance when safe",
    matchers: [
      /\bpreventive\b/i,
      /\bpreventative\b/i,
      /\bearly (service|change)\b/i,
      /\bmaintenance schedule\b/i,
      /\bservice interval\b/i,
    ],
  },
  {
    key: "ev_aware",
    category: "ev_ice",
    tags: ["ev", "battery", "charging", "hybrid", "hv"],
    skillSlug: "ev-aware",
    skillName: "EV Aware",
    whenToApply: "EV / hybrid diagnostics, charging, and HV safety topics",
    positiveText: "Treat EV/hybrid high-voltage safety as non-negotiable; prefer EV-specific guidance",
    negativeText: "User is mostly ICE-focused; keep EV digressions short unless asked",
    matchers: [
      /\bev\b/i,
      /\belectric vehicle\b/i,
      /\bhigh[- ]voltage\b/i,
      /\bcharging\b/i,
      /\bhybrid\b/i,
      /\bbattery pack\b/i,
    ],
  },
  {
    key: "brand_preference",
    category: "brand",
    tags: ["brand", "bosch", "mobil", "amsoil", "bilstein", "kyb"],
    skillSlug: "brand-preferences",
    skillName: "Brand Preferences",
    whenToApply: "When recommending specific fluids, filters, or branded parts",
    positiveText: "Honor stated brand preferences when recommending parts/fluids",
    negativeText: "Avoid pushing specific brands unless the user asked",
    matchers: [
      /\bprefer (bosch|mobil|amsoil|castrol|bilstein|kyb|denso|ngk|acdelco)\b/i,
      /\bonly use\b/i,
      /\bstick with\b/i,
    ],
  },
];

/** Extract preference hits from a signal using local heuristics only. */
export function extractPatternHits(signal: TasteSignal): PatternHit[] {
  const corpus = [
    signal.reason ?? "",
    signal.userCorrection ?? "",
    signal.context.userMessage,
    // For rejects, the original response is negative evidence about that style
    signal.type === "reject" ? signal.originalResponse : "",
    // For edits, compare correction language
    signal.type === "edit" ? signal.userCorrection ?? "" : "",
  ]
    .join("\n")
    .trim();

  if (!corpus) return [];

  const hits: PatternHit[] = [];

  for (const def of PATTERNS) {
    const matched = def.matchers.some((re) => re.test(corpus));
    if (!matched) continue;

    const polarity = inferPolarity(signal, def, corpus);
    const weight = baseWeight(signal) * (polarity === "positive" ? 1 : 0.9);

    hits.push({
      key: def.key,
      text: polarity === "positive" ? def.positiveText : def.negativeText,
      category: def.category,
      tags: def.tags,
      skillSlug: polarity === "positive" ? def.skillSlug : `${def.skillSlug}-inverse`,
      skillName:
        polarity === "positive" ? def.skillName : `${def.skillName} (Inverse)`,
      whenToApply: def.whenToApply,
      weight,
      polarity,
    });
  }

  // Edit corrections are strong direct preferences even without pattern keywords
  if (signal.type === "edit" && signal.userCorrection?.trim()) {
    const correction = signal.userCorrection.trim().replace(/\s+/g, " ");
    hits.push({
      key: `edit:${hashKey(correction)}`,
      text: `User correction preference: ${truncate(correction, 180)}`,
      category: "other",
      tags: tokenizeTags(correction),
      skillSlug: "user-corrections",
      skillName: "User Corrections",
      whenToApply: "Whenever prior corrections are relevant to the topic",
      weight: 1.1,
      polarity: "positive",
    });
  }

  // Explicit reject reasons become "avoid" preferences
  if (signal.type === "reject" && signal.reason?.trim()) {
    hits.push({
      key: `reject:${hashKey(signal.reason)}`,
      text: `Avoid this approach: ${truncate(signal.reason.trim(), 160)}`,
      category: "other",
      tags: tokenizeTags(signal.reason),
      skillSlug: "rejection-lessons",
      skillName: "Rejection Lessons",
      whenToApply: "Avoid repeating previously rejected advice patterns",
      weight: 1.0,
      polarity: "negative",
    });
  }

  return hits;
}

function inferPolarity(
  signal: TasteSignal,
  def: PatternDef,
  corpus: string,
): "positive" | "negative" {
  if (signal.type === "accept") return "positive";
  if (signal.type === "edit") {
    // If correction mentions the pattern, treat as positive preference for it
    if (def.matchers.some((re) => re.test(signal.userCorrection ?? ""))) {
      return "positive";
    }
    return "positive";
  }
  // reject: if reason mentions wanting the pattern, positive; if rejecting that pattern, negative
  const reason = signal.reason ?? "";
  if (/\b(want|prefer|should|need)\b/i.test(reason) && def.matchers.some((re) => re.test(reason))) {
    return "positive";
  }
  if (def.matchers.some((re) => re.test(reason))) {
    // "too budget", "unsafe", etc. in reject reason → push toward inverse
    if (/\b(too|overly|don't|do not|not|unsafe|ignore)\b/i.test(reason)) {
      return "negative";
    }
    return "positive";
  }
  // Rejected response contained the pattern → user disliked that angle
  if (def.matchers.some((re) => re.test(signal.originalResponse))) {
    return "negative";
  }
  // Fallback from corpus polarity words
  if (/\b(don't|do not|never|avoid|hate)\b/i.test(corpus)) return "negative";
  return "positive";
}

function baseWeight(signal: TasteSignal): number {
  switch (signal.type) {
    case "edit":
      return 1.2;
    case "reject":
      return 1.0;
    case "accept":
      return signal.reason ? 0.7 : 0.45;
  }
}

function hashKey(text: string): string {
  const flat = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0;
  for (let i = 0; i < flat.length; i++) h = (h * 31 + flat.charCodeAt(i)) >>> 0;
  return h.toString(16).slice(0, 8);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function tokenizeTags(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 3)
    .slice(0, 6);
}
