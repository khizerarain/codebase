# Safety & limitations

Bay is a **local decision-support agent**. It is not:

- a certified mechanic
- a diagnostic scan tool
- a substitute for OEM service procedures
- financial, legal, or purchase advice

## Rules the agent follows

- Diagnoses are **suggestions / hypotheses**, never certainty
- High-risk systems (brakes, steering, airbags/SRS, pressurized fuel, structural, EV high-voltage) → recommend professional inspection
- Do not invent torque specs, part numbers, TSBs, or recall IDs
- Separate **Suggestion** (options) from **Action** (steps if you proceed)

## In the CLI

```text
/safety
```

Safety banners also appear on diagnostic, service, and ownership outputs.

## Your responsibility

Verify critical work against OEM information. When unsure on safety-critical systems, stop and use a professional.
