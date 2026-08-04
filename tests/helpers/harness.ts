import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { Agent } from "../../src/agent/agent.js";
import { WatchdogEngine } from "../../src/automation/engine.js";
import {
  ensureDataDirs,
  getDataPaths,
  loadConfig,
  type Config,
  type DataPaths,
} from "../../src/config/config.js";
import { LocalDataStore } from "../../src/data/store.js";
import { KnowledgeBase } from "../../src/knowledge/knowledge.js";
import { MemoryStore } from "../../src/memory/memory.js";
import { LongTermMemory } from "../../src/memory/longterm.js";
import { ObdManager } from "../../src/obd/manager.js";
import { OwnershipEngine } from "../../src/ownership/engine.js";
import { PlanStore } from "../../src/plans/plans.js";
import { MockLLMProvider } from "../../src/testing/mock-llm.js";
import { TasteManager } from "../../src/taste/taste.js";
import { VehicleStore } from "../../src/vehicles/vehicles.js";
import {
  SAMPLE_CIVIC,
  SAMPLE_SERVICE_HISTORY,
  SAMPLE_TACOMA,
} from "./fixtures.js";

const liveRoots: string[] = [];

/** Register temp dirs for cleanup — call once per test file. */
export function useTempCleanup(): void {
  afterEach(() => {
    for (const d of liveRoots.splice(0)) {
      rmSync(d, { recursive: true, force: true });
    }
  });
}

export interface TestHarness {
  root: string;
  paths: DataPaths;
  config: Config;
  vehicles: VehicleStore;
  taste: TasteManager;
  memory: MemoryStore;
  longTerm: LongTermMemory;
  knowledge: KnowledgeBase;
  plans: PlanStore;
  data: LocalDataStore;
  llm: MockLLMProvider;
  agent: Agent;
  ownership: OwnershipEngine;
  obd: ObdManager;
  watchdogs: WatchdogEngine;
}

export interface HarnessOptions {
  /** Prefill a Tacoma as active with sample service history. */
  withTacoma?: boolean;
  /** Also add a high-mileage Civic (not active). */
  withCivic?: boolean;
  /** Prefix for temp directory name. */
  prefix?: string;
  /** Mutate config after load. */
  configure?: (config: Config) => void;
}

/** Isolated local data root + stores + MockLLM agent. No network. */
export function createTestHarness(opts: HarnessOptions = {}): TestHarness {
  const root = mkdtempSync(
    join(tmpdir(), opts.prefix ?? "codebase-h-"),
  );
  liveRoots.push(root);
  const paths = ensureDataDirs(getDataPaths(root));
  const config = loadConfig(paths);
  // Keep agent loops short in tests
  config.maxToolRounds = 4;
  config.toolRetries = 0;
  config.automation.briefingOnStart = false;
  opts.configure?.(config);

  const vehicles = new VehicleStore(paths);
  const llm = new MockLLMProvider();
  const taste = new TasteManager(paths, llm);
  const memory = new MemoryStore(paths);
  const longTerm = new LongTermMemory(paths);
  const knowledge = new KnowledgeBase(paths);
  const plans = new PlanStore(paths);
  const data = new LocalDataStore({
    paths,
    config,
    vehicles,
    taste,
    memory,
    longTerm,
    knowledge,
    plans,
  });
  const agent = new Agent(config, taste, memory, vehicles, paths, llm);
  const ownership = new OwnershipEngine(vehicles, taste);
  const obd = new ObdManager(paths, config, vehicles);
  agent.setObd(obd);
  const watchdogs = new WatchdogEngine(paths, config, vehicles, taste, obd);

  if (opts.withTacoma) {
    const v = vehicles.add(SAMPLE_TACOMA);
    for (const rec of SAMPLE_SERVICE_HISTORY) {
      vehicles.addServiceRecord(v.id, rec);
    }
    vehicles.setActive(v.id);
    memory.setActiveVehicle(v.id);
  }
  if (opts.withCivic) {
    vehicles.add(SAMPLE_CIVIC);
  }

  return {
    root,
    paths,
    config,
    vehicles,
    taste,
    memory,
    longTerm,
    knowledge,
    plans,
    data,
    llm,
    agent,
    ownership,
    obd,
    watchdogs,
  };
}
