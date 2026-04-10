# Risk Check Skill

## Core Rules

1. **Always consult `src/risk/risk-engine.ts` before editing `src/core/copy-executor.ts`**
   - The executor must never bypass the risk engine gate
   - Every trade flows through: trade-parser → risk-engine → copy-executor
   - If you need to change execution logic, first verify risk checks still hold

2. **Never bypass `RiskLimits` interface checks**
   - `maxPositionSize` — reject or scale down any single trade exceeding this $ value
   - `nicheExposureCap` — reject if total exposure in a niche would exceed this cap
   - `maxOpenPositions` — reject if a bot already has this many open positions
   - These limits are loaded from `src/config.ts` which reads from `.env`
   - The RiskLimits interface in `src/types/index.ts` is the contract — do not work around it

3. **Run `vitest` after any change to risk or executor logic**
   - Tests live in `src/__tests__/risk-engine.test.ts` and `src/__tests__/copy-executor.test.ts`
   - Both must pass before considering the change complete
   - Command: `npx vitest run --reporter=verbose`

4. **`paperMode` must stay `true` unless `.env` explicitly sets `PAPER_MODE=false`**
   - Default in `src/config.ts` is `paperMode: true`
   - Switching to `false` requires explicit user approval (per CLAUDE.md)
   - Never hardcode `paperMode = false` anywhere in source
   - The copy-executor checks `config.paperMode` at execution time, not at startup

## Decision Flow

```
Trade arrives from parser
        │
        ▼
┌─ risk-engine.ts ──────────────┐
│ 1. Check maxPositionSize      │
│    → REJECT if exceeded       │
│    → SCALE DOWN if partially  │
│ 2. Check nicheExposureCap     │
│    → Sum all open positions   │
│      in this bot's niche      │
│    → REJECT if cap breached   │
│ 3. Check maxOpenPositions     │
│    → REJECT if at limit       │
│                               │
│ Result: APPROVED / SCALED /   │
│         REJECTED              │
└───────────────────────────────┘
        │
        ▼
  copy-executor.ts (only if APPROVED or SCALED)
```

## What to Log

Every risk decision must be logged via pino with:
- `botId`, `market`, `side`, `requestedValue`, `approvedValue`
- `decision`: `"approved"` | `"scaled"` | `"rejected"`
- `reason` (if scaled or rejected): which limit was hit
