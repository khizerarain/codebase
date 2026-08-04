# Changelog

All notable changes to Codebase are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.12.0] — 2026-08-03

### Added
- Pluggable input providers: terminal, piped stdin, voice skeleton (local-first, no cloud STT)
- Garage mode (`/mode garage`, `codebase chat --garage`) with shorter checklist-oriented output
- Command aliases (`/d`, `/g`, `/snap`, `/aliases`, …) + tab completion candidates
- Rapid entry: `/quick`, `/pretrip`, `/interpret`, `/lv` (last vehicle)
- Interaction config: mode, verbosity, aliases, voice, input source
- `docs/interaction.md` speed-focused usage guide

### Changed
- Chat loop uses `InputProvider` with persistent command history
- Agent trims context/tool rounds slightly in garage mode; busy logs stay snappy

## [0.11.0] — 2026-08-03

### Added
- Local watchdog system with enable/disable, run, dismiss, and history
- Quiet-by-default garage briefing on session start
- Proactive appendix on `/garage`, `/due`, `/health`, `/status`, `/insights`
- `docs/automation.md` and automation config flags (`assertiveness`, `briefingOnStart`)

### Changed
- Garage overview points to `/watchdogs` for proactive controls

## [0.10.0] — 2026-08-03

### Added
- `VehicleDataProvider` architecture with Mock + Serial (ELM327 skeleton) providers
- `/obd` command family: connect, status, snapshot, dtc, monitor, trends, disconnect
- Local OBD snapshot/session/DTC storage under `~/.codebase/obd/`
- Diagnostics integration with live values + DTCs when connected
- `docs/obd.md` hardware-agnostic adapter notes

### Changed
- `/diagnose` can incorporate live OBD context without requiring hardware (mock-first)

## [0.9.0] — 2026-08-03

### Added
- Release hardening: `/version`, `/about`, startup diagnostics
- User docs under `docs/` (install, commands, taste, safety, mods, troubleshooting, releasing)
- GitHub issue templates and changelog foundation
- Top-level `codebase version` and `codebase doctor` CLI commands

### Changed
- README rewritten for real-user install and workflows
- Long-session prompt packing truncates bulky tool payloads
- Package metadata and `files` list production-ready for distribution

### Fixed
- Clearer provider misconfiguration messages on first run

## [0.8.0] — 2026-08-03

### Added
- Ownership intelligence (`/ownership`, `/costs`, `/health`)
- Professional reports (`/report …`) under `exports/reports/`
- Declarative local mods (`/mods`) — JSON/Markdown only
- Decision support (`/decide`, richer `/inspect pre-purchase`)

## [0.7.0] — 2026-08-03

### Added
- Unified local data layer and relevance-scored context assembly
- `/doctor`, `/backup`, `/rebuild`, `/status`, `/attention`
- Memory pin/prune and verbose timing mode

## [0.6.0] — 2026-08-03

### Added
- Structured `/diagnose`, `/service`, `/prep`, `/log`, `/due`, `/inspect`
- Service history–aware maintenance predictions

## [0.5.0] — earlier

### Added
- Garage intelligence, knowledge base, long-term memory, advanced skills
- Safety risk levels, onboarding, export system, `/config`

## [0.3.0] — earlier

### Added
- Planning mode, rich vehicles, domain tools

## [0.1.0] — earlier

### Added
- Core CLI agent, taste signals, TasteEngine, skills from Accept/Reject/Edit

[0.11.0]: https://github.com/khizerarain/codebase/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/khizerarain/codebase/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/khizerarain/codebase/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/khizerarain/codebase/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/khizerarain/codebase/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/khizerarain/codebase/releases/tag/v0.6.0
