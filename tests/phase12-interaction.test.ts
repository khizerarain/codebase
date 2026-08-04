import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { expandAlias, ALIAS_MAP } from "../src/cli/aliases.js";
import { CommandHistory, LastVehicleMemory } from "../src/cli/history.js";
import { handleModeCommand } from "../src/cli/phase12.js";
import {
  ensureDataDirs,
  getDataPaths,
  loadConfig,
  saveConfig,
} from "../src/config/config.js";
import { PipedInputProvider } from "../src/input/piped.js";
import { resolveInputProvider } from "../src/input/resolve.js";
import { TerminalInputProvider } from "../src/input/terminal.js";
import { VoiceInputProvider } from "../src/input/voice.js";

describe("Phase 12 interaction", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function harness() {
    const root = mkdtempSync(join(tmpdir(), "codebase-p12-"));
    dirs.push(root);
    const paths = ensureDataDirs(getDataPaths(root));
    const config = loadConfig(paths);
    return { root, paths, config };
  }

  it("expands common aliases", () => {
    expect(expandAlias("/d squeal brakes")).toBe("/diagnose squeal brakes");
    expect(expandAlias("/g")).toBe("/garage");
    expect(expandAlias("/snap")).toBe("/obd snapshot");
    expect(expandAlias("/mg")).toBe("/mode garage");
    expect(expandAlias("/q")).toBe("/quick");
    expect(expandAlias("/du")).toBe("/due");
    expect(Object.keys(ALIAS_MAP).length).toBeGreaterThan(15);
  });

  it("leaves lines alone when aliases disabled", () => {
    expect(expandAlias("/d brakes", false)).toBe("/d brakes");
    expect(expandAlias("not a slash")).toBe("not a slash");
  });

  it("persists garage mode via /mode", () => {
    const { paths, config } = harness();
    expect(config.interaction.mode).toBe("normal");
    const next = handleModeCommand("/mode garage", config, paths);
    expect(next.interaction.mode).toBe("garage");
    const reloaded = loadConfig(paths);
    expect(reloaded.interaction.mode).toBe("garage");
    handleModeCommand("/mode normal", next, paths);
    expect(loadConfig(paths).interaction.mode).toBe("normal");
  });

  it("stores command history and last vehicle", () => {
    const { paths } = harness();
    const hist = new CommandHistory(paths);
    hist.push("/garage");
    hist.push("/due");
    expect(hist.load()).toEqual(["/garage", "/due"]);

    const last = new LastVehicleMemory(paths);
    expect(last.get()).toBeNull();
    last.set("veh-abc");
    expect(last.get()).toBe("veh-abc");
  });

  it("resolves terminal vs piped vs voice providers", () => {
    const { config } = harness();
    config.interaction.input = "terminal";
    const term = resolveInputProvider(config);
    expect(term.id).toBe("terminal");
    term.close?.();

    config.interaction.input = "piped";
    const piped = resolveInputProvider(config);
    expect(piped).toBeInstanceOf(PipedInputProvider);
    piped.close?.();

    config.interaction.input = "voice";
    config.interaction.voiceEnabled = false;
    // Disabled voice → degrade to terminal
    const degraded = resolveInputProvider(config);
    expect(degraded).toBeInstanceOf(TerminalInputProvider);
    degraded.close?.();

    config.interaction.voiceEnabled = true;
    const voice = resolveInputProvider(config);
    expect(voice).toBeInstanceOf(VoiceInputProvider);
    expect(voice.label).toMatch(/Voice/i);
  });

  it("voice skeleton rejects without cloud STT", async () => {
    const v = new VoiceInputProvider({ engine: "none" });
    await expect(v.getInput()).rejects.toThrow(/skeleton|not fully wired/i);
  });

  it("accepts interaction config keys", () => {
    const { paths, config } = harness();
    config.interaction.verbosity = "short";
    config.interaction.aliases = true;
    config.interaction.input = "auto";
    saveConfig(config, paths);
    const reloaded = loadConfig(paths);
    expect(reloaded.interaction.verbosity).toBe("short");
    expect(reloaded.interaction.aliases).toBe(true);
  });
});
