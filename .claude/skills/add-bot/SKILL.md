# Add Bot Skill

## Checklist for Adding a New Bot

When adding a new bot to the system, complete every step in order:

### 1. Validate Wallet Address
- Use `ethers.isAddress()` in `src/utils/wallet.ts` to validate the watched wallet
- Reject invalid addresses before any database write
- Check for duplicates — no two bots should watch the same wallet address

### 2. Add to `src/bots/bot-config.ts`
- Add the bot definition to the hardcoded bot registry
- Required fields: `name`, `walletId`, `niche`, `sizeScale`, `speed`
- Ensure the `niche` value is one of the `Niche` type literals: `'crypto' | 'sports' | 'politics' | 'entertainment' | 'science' | 'other'`

### 3. Create PnL Ledger Entry
- Insert an initial `PnLRecord` row via Prisma with zeroed values:
  ```typescript
  {
    botId: bot.id,
    date: new Date().toISOString().split('T')[0],
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalTrades: 0,
    winRate: 0
  }
  ```
- This ensures the dashboard has data to display immediately

### 4. Add Niche Color to Dashboard Constants
- Update `dashboard/src/lib/constants.ts` (or create if it doesn't exist)
- Each niche needs a color mapping for the dashboard UI:
  ```typescript
  export const NICHE_COLORS: Record<Niche, string> = {
    crypto: '#F7931A',
    sports: '#10B981',
    politics: '#3B82F6',
    entertainment: '#A855F7',
    science: '#06B6D4',
    other: '#6B7280',
  };
  ```
- If adding a new niche, add its color here and update the `Niche` type in `src/types/index.ts`

### 5. Write Unit Test
- Add a test in `src/__tests__/` that verifies:
  - Bot creation succeeds with valid wallet address
  - Bot creation fails with invalid wallet address
  - Bot creation fails with duplicate wallet address
  - PnL ledger entry is created with zeroed values
  - Bot appears in the bot manager's active list

### 6. Verify
- Run `npx vitest run --reporter=verbose` to confirm all tests pass
- Run `npx tsc --noEmit` to confirm no type errors
- Check that the dashboard can fetch the new bot via the `/api/bots` endpoint
