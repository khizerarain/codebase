import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { VehicleSchema } from "../vehicles/schema.js";
import type { LocalDataStore } from "./store.js";

export type DoctorSeverity = "ok" | "warn" | "error";

export interface DoctorFinding {
  severity: DoctorSeverity;
  area: string;
  message: string;
}

export interface DoctorReport {
  findings: DoctorFinding[];
  ok: number;
  warn: number;
  error: number;
}

/** Scan local data for broken references, orphans, and schema issues. */
export function runDoctor(data: LocalDataStore): DoctorReport {
  const findings: DoctorFinding[] = [];
  const vehicleIds = new Set(data.vehicles.list().map((v) => v.id));
  const paths = data.paths;

  // Vehicles on disk
  if (existsSync(paths.vehicles)) {
    for (const name of readdirSync(paths.vehicles)) {
      if (!name.endsWith(".json") || name.startsWith("_")) continue;
      const file = join(paths.vehicles, name);
      try {
        const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
        const parsed = VehicleSchema.safeParse(raw);
        if (!parsed.success) {
          findings.push({
            severity: "error",
            area: "vehicles",
            message: `Invalid vehicle file ${name}: ${parsed.error.issues[0]?.message ?? "schema error"}`,
          });
        } else {
          const v = parsed.data;
          if (!v.make || !v.model || !v.year) {
            findings.push({
              severity: "warn",
              area: "vehicles",
              message: `${name}: missing make/model/year`,
            });
          }
          if (v.currentMileage < 0) {
            findings.push({
              severity: "error",
              area: "vehicles",
              message: `${v.year} ${v.make} ${v.model}: negative mileage`,
            });
          }
        }
      } catch (err) {
        findings.push({
          severity: "error",
          area: "vehicles",
          message: `Unreadable ${name}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  // Active / default vehicle pointers
  const activeId = data.vehicles.getActiveId();
  if (activeId && !vehicleIds.has(activeId)) {
    findings.push({
      severity: "error",
      area: "vehicles",
      message: `Active vehicle id ${activeId.slice(0, 8)}… points to missing vehicle`,
    });
  }
  if (data.config.defaultVehicleId && !vehicleIds.has(data.config.defaultVehicleId)) {
    findings.push({
      severity: "warn",
      area: "config",
      message: `defaultVehicleId ${data.config.defaultVehicleId.slice(0, 8)}… not in garage`,
    });
  }

  // Memory vehicle links
  for (const fact of data.longTerm.list()) {
    for (const vid of fact.vehicleIds) {
      if (!vehicleIds.has(vid)) {
        findings.push({
          severity: "warn",
          area: "memory",
          message: `Fact ${fact.id.slice(0, 8)} links missing vehicle ${vid.slice(0, 8)}`,
        });
      }
    }
  }

  // Knowledge orphans
  const docs = data.knowledge.list();
  for (const doc of docs) {
    if (!existsSync(doc.storedPath)) {
      findings.push({
        severity: "error",
        area: "knowledge",
        message: `Doc "${doc.title}" missing stored file ${doc.storedPath}`,
      });
    }
    for (const vid of doc.vehicleIds) {
      if (!vehicleIds.has(vid)) {
        findings.push({
          severity: "warn",
          area: "knowledge",
          message: `Doc "${doc.title}" links missing vehicle ${vid.slice(0, 8)}`,
        });
      }
    }
  }

  // Orphan files in knowledge/docs not in index
  const docsDir = join(paths.knowledge, "docs");
  if (existsSync(docsDir)) {
    const indexed = new Set(docs.map((d) => d.storedPath));
    for (const name of readdirSync(docsDir)) {
      const full = join(docsDir, name);
      try {
        if (!statSync(full).isFile()) continue;
      } catch {
        continue;
      }
      if (![...indexed].some((p) => p.endsWith(name))) {
        findings.push({
          severity: "warn",
          area: "knowledge",
          message: `Orphan knowledge file (not in index): ${name}`,
        });
      }
    }
  }

  // Plans with missing vehicles
  for (const plan of data.plans.list()) {
    if (plan.vehicleId && !vehicleIds.has(plan.vehicleId)) {
      findings.push({
        severity: "warn",
        area: "plans",
        message: `Plan "${plan.title}" references missing vehicle`,
      });
    }
  }

  // Memory bloat
  const facts = data.longTerm.list();
  const max = data.config.maxMemoryFacts ?? 200;
  if (facts.length > max) {
    findings.push({
      severity: "warn",
      area: "memory",
      message: `${facts.length} memory facts (soft cap ${max}). Consider /memory prune or pin keepers.`,
    });
  }

  // Config file
  if (!existsSync(paths.configFile)) {
    findings.push({
      severity: "warn",
      area: "config",
      message: "config.json missing (defaults in use)",
    });
  }

  if (!findings.length) {
    findings.push({
      severity: "ok",
      area: "system",
      message: "All checks passed — local data looks healthy",
    });
  }

  return {
    findings,
    ok: findings.filter((f) => f.severity === "ok").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    error: findings.filter((f) => f.severity === "error").length,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const icon = (s: DoctorSeverity) =>
    s === "error" ? "✗" : s === "warn" ? "!" : "✓";
  const lines = report.findings.map(
    (f) => `${icon(f.severity)} [${f.area}] ${f.message}`,
  );
  return [
    "Data doctor",
    "───────────",
    ...lines,
    "",
    `Summary: ${report.error} error(s), ${report.warn} warning(s)`,
    "Fixes: /rebuild · /backup · /memory prune · /vehicles …",
  ].join("\n");
}

/** Copy all user data into a timestamped backup folder under data root. */
export function backupUserData(data: LocalDataStore): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(data.paths.root, "backups", `backup-${stamp}`);
  mkdirSync(dest, { recursive: true });

  const copyTree = (from: string, to: string) => {
    if (!existsSync(from)) return;
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (name === "backups") continue; // avoid recursive backup copies
      const src = join(from, name);
      const dst = join(to, name);
      const st = statSync(src);
      if (st.isDirectory()) copyTree(src, dst);
      else copyFileSync(src, dst);
    }
  };

  copyTree(data.paths.root, dest);

  // Manifest (privacy-safe — no secrets echoed)
  writeFileSync(
    join(dest, "_backup-manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        vehicles: data.vehicles.list().length,
        memoryFacts: data.longTerm.list().length,
        knowledgeDocs: data.knowledge.list().length,
        skills: data.taste.engine.skills.list({ includeDisabled: true }).length,
      },
      null,
      2,
    ),
    "utf8",
  );

  return dest;
}

/** Rebuild knowledge index from stored doc files; prune memory bloat. */
export function rebuildIndexes(data: LocalDataStore): string {
  const knowledge = data.knowledge.rebuildIndex();
  const pruned = data.longTerm.prune({
    maxFacts: data.config.maxMemoryFacts ?? 200,
  });
  data.invalidateCache();
  return [
    "Indexes rebuilt",
    "───────────────",
    `knowledge: ${knowledge.docs} docs · ${knowledge.chunks} chunks · ${knowledge.removed} stale removed`,
    `memory:    pruned ${pruned} unpinned/low-value facts (pinned kept)`,
    "cache:     cleared",
  ].join("\n");
}
