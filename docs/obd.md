# OBD / live vehicle data

Phase 10 adds a **hardware-agnostic** live data layer. The product works fully without any adapter via the **mock** provider.

## Architecture

```
CLI / Agent / Diagnostics
        │
        ▼
   ObdManager  ──► ObdStore (~/.codebase/obd/)
        │
        ▼
 VehicleDataProvider
   ├── MockVehicleDataProvider   (first-class, always available)
   └── SerialObdProvider         (ELM327-ready skeleton)
```

Nothing outside `src/obd/` talks to hardware directly.

## Commands

```text
/obd connect mock
/obd connect mock fault_catalyst
/obd connect mock hot
/obd status
/obd snapshot
/obd dtc
/obd monitor 10
/obd trends
/obd disconnect
```

Serial skeleton (not fully wired — no native serial dependency yet):

```text
/config set obd.provider serial
/config set obd.port COM3
/obd connect serial
```

## Mock scenarios

| Scenario | Intent |
|----------|--------|
| `idle` | Warm idle baseline |
| `cruise` | Highway-ish load |
| `fault_catalyst` | DTCs P0420 + P0171 |
| `hot` | Elevated coolant |

## Storage

Under `~/.codebase/obd/`:

- `snapshots/` — freeze-style captures
- `sessions/` — short live monitor sessions
- `dtc/` — code read events

Snapshots and DTC reads can append a line to the active vehicle’s **service history**.

## Diagnostics integration

When OBD is connected, `/diagnose` pulls live values + DTCs into the report and ranking (still framed as assistance).

## Adding a real ELM327 transport later

Implement against `VehicleDataProvider` in `src/obd/types.ts`:

1. Open the serial port (`obd.port`, `obd.baudRate`)
2. AT handshake (`ATZ`, `ATE0`, `ATL0`, `ATSP0`)
3. Map `CORE_PIDS` → Mode 01 PIDs
4. Parse responses into `VehicleSnapshot`
5. Keep `ObdManager` as the only consumer

Do **not** call adapters from diagnostics, ownership, or the agent loop.

## Safety

Live data is **decision-support only**. It is not a certified scan tool or OEM freeze-frame substitute. See `/safety`.
