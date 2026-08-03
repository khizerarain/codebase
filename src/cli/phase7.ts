import type { LocalDataStore } from "../data/store.js";
import {
  backupUserData,
  formatDoctorReport,
  rebuildIndexes,
  runDoctor,
} from "../data/doctor.js";
import { logger } from "../utils/logger.js";
import { setVerbose } from "../utils/verbose.js";

export function handleStatusCommand(data: LocalDataStore): void {
  console.log("\n" + data.statusSnapshot() + "\n");
}

export function handleDoctorCommand(data: LocalDataStore): void {
  const report = runDoctor(data);
  console.log("\n" + formatDoctorReport(report) + "\n");
}

export function handleBackupCommand(data: LocalDataStore): void {
  const dest = backupUserData(data);
  logger.success(`Backup written to:\n  ${dest}`);
}

export function handleRebuildCommand(data: LocalDataStore): void {
  console.log("\n" + rebuildIndexes(data) + "\n");
  logger.success("Rebuild complete.");
}

export function handleAttentionCommand(data: LocalDataStore): void {
  console.log("\n" + data.garageAttentionReport() + "\n");
}

export function handleVerboseToggle(
  line: string,
  data: LocalDataStore,
): void {
  const rest = line.replace(/^\/verbose\s*/, "").trim().toLowerCase();
  let on: boolean;
  if (rest === "on" || rest === "1" || rest === "true") on = true;
  else if (rest === "off" || rest === "0" || rest === "false") on = false;
  else on = !data.config.verbose;

  data.config.verbose = on;
  setVerbose(on);
  logger.success(`Verbose mode ${on ? "ON" : "OFF"} (timing/debug logs).`);
}
