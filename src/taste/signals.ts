import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { ensureDataDirs, getDataPaths, type DataPaths } from "../config/config.js";
import { TasteSignalSchema, type TasteSignal } from "./schema.js";

export interface CaptureSignalInput {
  type: TasteSignal["type"];
  originalResponse: string;
  userMessage: string;
  userCorrection?: string;
  reason?: string;
  vehicleIds?: string[];
}

/** Persist a single Accept / Reject / Edit taste signal. */
export function captureSignal(
  input: CaptureSignalInput,
  paths: DataPaths = ensureDataDirs(),
): TasteSignal {
  const signal = TasteSignalSchema.parse({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    type: input.type,
    originalResponse: input.originalResponse,
    userCorrection: input.userCorrection,
    reason: input.reason,
    context: {
      userMessage: input.userMessage,
      vehicleIds: input.vehicleIds,
    },
  });

  const filePath = join(paths.signals, `${signal.timestamp.replace(/[:.]/g, "-")}_${signal.type}_${signal.id.slice(0, 8)}.json`);
  writeFileSync(filePath, JSON.stringify(signal, null, 2), "utf8");
  return signal;
}

export function signalToMarkdownSnippet(signal: TasteSignal): string {
  const header = `- **${signal.type.toUpperCase()}** (${signal.timestamp.slice(0, 10)})`;
  const bits: string[] = [header];

  bits.push(`  - User asked: ${truncate(signal.context.userMessage, 120)}`);

  if (signal.reason) {
    bits.push(`  - Reason: ${signal.reason}`);
  }
  if (signal.userCorrection) {
    bits.push(`  - Correction: ${truncate(signal.userCorrection, 160)}`);
  }

  return bits.join("\n");
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export { getDataPaths };
