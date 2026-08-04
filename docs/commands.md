# Command overview

Product: **Bay** · CLI: `bay` · In-session: type `/help` for the live list.

Launch essentials: `/vehicles add` · `/diagnose` · `/service` · `/garage` · `/taste` · `/obd connect mock` · `/report ownership` · `/quick`

## Taste & learning

| Command | Purpose |
|---------|---------|
| `/accept` | Mark last answer good (Enter also accepts) |
| `/reject [reason]` | Mark last answer bad |
| `/edit` | Edit last answer in `$EDITOR` |
| `/taste` | Taste summary |
| `/learn` | Re-analyze all signals |
| `/forget <text>` | Remove a preference/skill |
| `/skill …` | Manage skills |

## Vehicles & garage

| Command | Purpose |
|---------|---------|
| `/vehicles` | List / add / switch / edit |
| `/active` | Show active vehicle |
| `/garage` | Multi-vehicle overview |
| `/compare <a> <b>` | Compare two vehicles |
| `/insights` | Garage insights |
| `/history` | Service history |
| `/due [garage]` | Overdue / due soon |

## Service intelligence

| Command | Purpose |
|---------|---------|
| `/diagnose <symptoms>` | Structured diagnosis (+ live OBD if connected) |
| `/service <job>` | Service/repair plan → `/approve` |
| `/prep <job>` | Parts/tools staging |
| `/log …` | Log completed work |
| `/inspect [pre-purchase\|periodic]` | Inspection checklist / PPI |
| `/schedule` | Maintenance schedule |
| `/parts [part]` | Parts research (plans) |

## Live OBD

| Command | Purpose |
|---------|---------|
| `/obd connect [mock\|serial] [scenario]` | Connect provider (mock is default) |
| `/obd status` | Connection + live values |
| `/obd snapshot` | Capture + save (+ service history) |
| `/obd dtc` / `/obd dtc clear` | Read / clear codes |
| `/obd monitor [n]` | Sample live table |
| `/obd trends` | Local repeated-code / temp notes |
| `/obd disconnect` | Disconnect |

See [obd.md](./obd.md).

## Automation

| Command | Purpose |
|---------|---------|
| `/watchdogs list` | Show watchdogs + on/off |
| `/watchdogs enable\|disable <id>` | Toggle a check |
| `/watchdogs run` | Run enabled checks now |
| `/watchdogs briefing` | Short high-signal summary |
| `/watchdogs dismiss <id> [days]` | Snooze / dismiss an alert |
| `/watchdogs clear-dismissals` | Reset dismissals |
| `/watchdogs history` | Recent alert history |

See [automation.md](./automation.md).

## Speed / garage interaction

| Command | Purpose |
|---------|---------|
| `/mode garage\|normal\|show` | Hands-busy shorter output / restore normal |
| `/quick` (`/q`) | Rapid action menu |
| `/aliases` | List short command aliases |
| `/pretrip` | Due + walk-around checklist |
| `/interpret` | Quick OBD snapshot + DTC summary |
| `/lv` | Switch to last vehicle |
| `/snap` | Alias → `/obd snapshot` |

Config: `interaction.mode`, `interaction.verbosity`, `interaction.aliases`, `interaction.input`, `interaction.voiceEnabled`.

Start with garage mode: `bay chat --garage`. See [interaction.md](./interaction.md).

## Ownership & reports

| Command | Purpose |
|---------|---------|
| `/ownership` `/costs` | Cost/mi, health, predictions |
| `/health [garage]` | Quick health snapshot |
| `/report <kind>` | Professional Markdown report |
| `/decide buy\|keep\|sell` | Decision support (not advice) |
| `/mods …` | Local declarative extensions |

## Memory & knowledge

| Command | Purpose |
|---------|---------|
| `/memory …` | Long-term facts (pin/prune/…) |
| `/knowledge …` | Local manuals/notes search |

## Planning & export

| Command | Purpose |
|---------|---------|
| `/plan <goal>` | Create a plan |
| `/approve` | Execute approved plan |
| `/revise <feedback>` | Revise pending plan |
| `/export …` | Export last buffers |
| `/report …` | Dated reports in `exports/reports/` |

## System

| Command | Purpose |
|---------|---------|
| `/help` | This overview |
| `/version` `/about` | Version and product info |
| `/status` `/info` | Health snapshot |
| `/doctor` | Data integrity check |
| `/backup` `/rebuild` | Backup / rebuild indexes |
| `/config` | Settings |
| `/safety` | Safety & limitations |
| `/clear` | Clear conversation |
| `/exit` | Quit |
