import type { Agent } from "../agent/agent.js";
import type { Config, DataPaths } from "../config/config.js";
import { MockVehicleDataProvider, type MockScenario } from "../obd/mock.js";
import { ObdManager, type ObdProviderKind } from "../obd/manager.js";
import { friendlyError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type { VehicleStore } from "../vehicles/vehicles.js";

export interface Phase10Context {
  obd: ObdManager;
}

export function createPhase10(
  paths: DataPaths,
  config: Config,
  vehicles: VehicleStore,
): Phase10Context {
  return { obd: new ObdManager(paths, config, vehicles) };
}

export async function handleObdCommand(
  line: string,
  ctx: Phase10Context,
  agent: Agent,
): Promise<void> {
  const rest = line.replace(/^\/obd\s*/, "").trim();
  const [cmd, ...args] = rest.split(/\s+/);
  const argstr = args.join(" ").trim();

  try {
    if (!cmd || cmd === "help") {
      console.log("\n" + OBD_HELP + "\n");
      return;
    }

    if (cmd === "connect") {
      const kindRaw = (args[0] ?? "mock").toLowerCase();
      let kind: ObdProviderKind = "mock";
      let scenario: MockScenario | undefined;
      if (kindRaw === "serial") {
        kind = "serial";
      } else if (kindRaw === "mock" || !args[0]) {
        kind = "mock";
        const scen = (args[0] === "mock" ? args[1] : args[0]) as MockScenario | undefined;
        if (
          scen === "idle" ||
          scen === "cruise" ||
          scen === "fault_catalyst" ||
          scen === "hot"
        ) {
          scenario = scen;
        }
      } else if (
        kindRaw === "idle" ||
        kindRaw === "cruise" ||
        kindRaw === "fault_catalyst" ||
        kindRaw === "hot"
      ) {
        kind = "mock";
        scenario = kindRaw;
      } else {
        logger.warn("Usage: /obd connect [mock|serial] [idle|cruise|fault_catalyst|hot]");
        return;
      }

      const msg = await ctx.obd.connect(kind, { scenario });
      // If mock + scenario after connect, re-apply (connect already sets if passed)
      if (kind === "mock" && scenario) {
        const p = ctx.obd.getProvider();
        if (p instanceof MockVehicleDataProvider) p.setScenario(scenario);
      }
      logger.success(msg);
      return;
    }

    if (cmd === "disconnect") {
      logger.info(await ctx.obd.disconnect());
      return;
    }

    if (cmd === "status") {
      const text = await ctx.obd.status();
      console.log("\n" + text + "\n");
      return;
    }

    if (cmd === "snapshot") {
      const { markdown } = await ctx.obd.snapshot(true);
      agent.setLastExportable(markdown, "diagnosis");
      logger.agent(markdown);
      logger.dim("Saved under ~/.bay/obd/snapshots · also logged to service history");
      return;
    }

    if (cmd === "dtc") {
      if (/^clear$/i.test(argstr)) {
        console.log("\n" + (await ctx.obd.dtc({ clear: true })) + "\n");
        return;
      }
      const text = await ctx.obd.dtc({ attachHistory: true });
      agent.setLastExportable(text, "diagnosis");
      console.log("\n" + text + "\n");
      return;
    }

    if (cmd === "monitor") {
      const n = Number(args[0]);
      const samples = Number.isFinite(n) && n > 0 ? Math.min(n, 30) : 8;
      const spinnerMsg = `Monitoring ${samples} samples…`;
      logger.dim(spinnerMsg);
      const text = await ctx.obd.monitor(samples);
      console.log("\n" + text + "\n");
      return;
    }

    if (cmd === "trends") {
      const notes = ctx.obd.store.trendNotes();
      console.log(
        "\n" +
          (notes.length
            ? ["OBD trend notes", "───────────────", ...notes.map((n) => `• ${n}`)].join(
                "\n",
              )
            : "No OBD trend notes yet. Capture snapshots / DTCs first.") +
          "\n",
      );
      return;
    }

    logger.warn("Unknown /obd command. Try /obd help");
  } catch (err) {
    logger.warn(friendlyError(err));
  }
}

const OBD_HELP = `
OBD / live vehicle data
───────────────────────
  /obd connect [mock|serial] [scenario]
      mock scenarios: idle | cruise | fault_catalyst | hot
  /obd status              Connection + live values
  /obd snapshot            Freeze current values (saves locally + history)
  /obd dtc                 Read codes (logged to history)
  /obd dtc clear           Clear codes on provider (mock)
  /obd monitor [n]         Sample live values n times (default 8)
  /obd trends              Local repeated-code / temp trend notes
  /obd disconnect

Config: /config set obd.provider mock|serial
        /config set obd.port COM3

Mock mode is first-class — no hardware required.
Serial provider is a skeleton for future ELM327 wiring (see docs/obd.md).
Live data is assistance only, not a certified diagnosis.
`.trim();
