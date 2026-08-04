# Automation & watchdogs

Phase 11 adds **local, user-controlled** proactive checks. There is **no always-on daemon** and **no cloud notifications** — checks run when you start a session or invoke commands.

## Controls

```text
/watchdogs list
/watchdogs enable overdue_maintenance
/watchdogs disable known_issues
/watchdogs run
/watchdogs briefing
/watchdogs dismiss <alert-id> [days]
/watchdogs clear-dismissals
/watchdogs history
```

Config (quiet defaults):

```text
/config set automation.briefingOnStart true
/config set automation.assertiveness quiet   # quiet | normal | assertive
/config set automation.maxBriefingAlerts 3
```

## Built-in watchdogs

| Id | Default | What it watches |
|----|---------|-----------------|
| `overdue_maintenance` | ON | Overdue schedule/history items |
| `service_due_soon` | ON | Near-horizon due-soon items |
| `repeated_dtc` | ON | Same DTC in local OBD history |
| `live_range_anomaly` | ON | Connected OBD out-of-range hints |
| `garage_attention` | ON | Multi-vehicle health/overdue rollup |
| `taste_service_sooner` | ON | Reliability/OEM taste + due items |
| `known_issues` | off | Logged known issues |
| `local_knowledge_flags` | off | Local docs mentioning recall/TSB |

## Session start

If `automation.briefingOnStart` is true and the garage is not empty, a short **Garage briefing** may print (filtered by assertiveness + dismissals).

## Transparency

Every alert includes:

- **why** it fired
- optional **suggested commands** (never forced)
- a dismiss id

State lives in `~/.bay/automation/state.json` (inspectable / deletable; legacy `~/.codebase` still works if that root is active).

## Safety

Suggestions only. High-risk topics still go through `/safety` rules. Live OBD ranges are assistive, not OEM specs.
