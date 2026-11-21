# Account value history

Every account's detail view on the Finances page opens on a chart of that account's value over time: its balance, what it owes, or what it is worth. No provider gives Linc a history of balances, so each series is built from what Linc does have, and each comes from exactly one source. The chart says which under the line, because the two mean different things.

## Where each series comes from

| Account | Series | Starts |
| --- | --- | --- |
| Connected cash account (checking, savings) | Rebuilt from its posted transactions | The earliest posted transaction in the snapshot's transaction window |
| Connected credit card | Rebuilt from its posted transactions | Same |
| Investment, retirement, loan, mortgage | Values Linc recorded | The first day Linc recorded the account |
| A balance entered by hand | Values Linc recorded (each change the user made) | The first recorded change |

The builder is `buildAccountValueHistory` in `src/services/account-value-history.ts`, served by `GET /api/finances/accounts/:id/history` (`src/auth/finances-routes.ts`) and drawn by `AccountValueChart` (`frontend/src/components/finances/AccountValueChart.tsx`).

### Rebuilt from transactions

A cash account's or card's balance changes only when a transaction posts, so its past balances follow exactly from the balance the institution reported and the transactions since. Working back a day at a time: a cash account held what left it that day more the day before, and a card owed a charge's amount less. The arithmetic uses the provider's own amount (`source_amount`, positive when money leaves the account), not the sign-normalized `amount`, and runs in whole cents so a year of days does not drift.

- **Pending transactions are left out**, as the reported balance leaves them out.
- **The line ends on the provider's observation day**, or on the latest posted transaction if that is later.
- **It starts at the earliest posted transaction.** Before that the balance is unknown, not zero, so nothing is drawn.
- **It refuses rather than guesses.** A transaction in another currency, or one with no usable date or amount, cannot be walked back through, and the account falls back to its recorded values. So does an account with nothing posted.

Pending, missed or later-removed transactions would make the rebuilt line differ from what the bank showed on a given day; that is why the caption names it as rebuilt.

### Recorded values

An investment account's value moves with the market with no transaction at all, and a loan accrues interest the transactions do not show, so neither can be rebuilt. Instead, every daily history observation (`FinancialSummaryHistory`, written by `FinancialHistoryService.saveHistoricalSnapshot` after each snapshot rebuild) stores every account's value in `accountValues`, keyed by the account id the Finances page uses:

```json
{ "<account id>": { "value": 22126.88, "observedAt": "2026-11-21T14:02:11.000Z" } }
```

- **`value` is the figure the Finances page shows for the account** (`meta.accountDisplayBalances`): an investment account's holdings-reconciled value, and what a loan or card owes as a positive amount. A cash account keeps its sign, so an overdraft plots below zero rather than as a positive debt.
- **`observedAt` is when the provider reported the account** (`lastSyncedAt`), never when Linc read it. A point is dated by it, so an account the provider has not refreshed adds no new day to the chart instead of repeating an old value as if it were observed again, and an account no provider confirmed (no `observedAt`) adds no point at all. This is the same rule the account's "Updated" line follows.
- **A day's row is rewritten when any account moves**, even when the totals do not (a transfer between two cash accounts), and not when the stored values differ only in key order.
- **The latest computation wins a day**, and the snapshot on screen wins its own day, so the chart always ends on the figure the page shows even if writing that day's history row failed.

Rows written before `accountValues` existed carry none, so a recorded series starts when this shipped and fills in a point a day after that. Until there are two points the chart says how much has been recorded instead of drawing a line through one.

## What the chart shows

- The latest value, and how it moved over the range shown, from its first point to its last. For a debt, "Down $300" (owing less) reads as the good direction rather than "−$300". The change is not a return: an investment account's change includes what was put in or taken out.
- Range buttons (1M, 3M, 6M, 1Y, All), offered only where the history reaches past the range and the range still holds two points.
- A zero line when a cash balance went negative.

## What it does not do

- **It does not estimate an investment account's past** from today's holdings and historical prices. Holdings change through buys, sells, reinvested dividends and transfers that providers report unevenly, and a figure built that way would look like the account's history without being it.
- **It does not blend sources.** A cash account rebuilt from transactions does not splice in recorded values, which can disagree with the rebuilt line by whatever the transaction feed missed.
- **It does not follow an account across a re-link.** A re-linked account can get a new id from the provider, and its recorded history starts again under the new one.
