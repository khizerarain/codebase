/** Safety / trust language injected into prompts and critical outputs. */

export const SAFETY_SYSTEM_BLOCK = `
## Safety & Trust Rules (mandatory)
- Treat all diagnostic conclusions as **suggestions**, never certainty.
- Prefer language like "possible causes", "likely", "worth checking" — never "this is definitely…".
- For brakes, steering, airbags, fuel system, structural, and EV high-voltage work: recommend professional inspection when risk is non-trivial.
- Separate **Suggestion** (options) from **Instruction** (steps the user chose to take).
- Do not invent torque specs, part numbers, TSBs, or recall IDs. If unsure, say so.
- Remind the user to verify with OEM service information before torque-critical or safety-critical work.
`.trim();

export const SAFETY_FOOTER = `
---
⚠ Safety note: This is decision-support, not a certified diagnosis or repair procedure. Verify critical specs with OEM service info. Stop and use a qualified technician for safety-critical systems when unsure.
`.trim();

export function withSafetyFooter(content: string): string {
  if (content.includes("Safety note:")) return content;
  return `${content.trim()}\n\n${SAFETY_FOOTER}`;
}

export function looksSafetyCritical(text: string): boolean {
  return /\b(brake|airbag|srs|steering|high[- ]?voltage|hv battery|fuel rail|structural|torque|suspension|ball joint|tie rod)\b/i.test(
    text,
  );
}
