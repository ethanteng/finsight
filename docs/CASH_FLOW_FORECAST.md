# Cash flow and forecast (beta)

The Cash flow page (`/cash-flow`) shows cash in and cash out by week, month, quarter, year or a custom range, forecasts the months ahead, and lets the user add planned events. Ask Linc reads the same figures through the `cash_flow_forecast` data pack. The page is open to every signed-in user and is labelled Beta.

## What cash in and cash out mean

Cash in is canonical income and cash out is canonical spending, across cash accounts and credit cards. Net is what the user kept. The definitions are the truth contract's (`docs/FINANCIAL_TRUTH_CONTRACT.md`), applied to a narrower set of accounts:

- A card purchase is spending on the day it is made. A card payment is a transfer and counts as neither, so card spending is never late and never counted twice.
- Transfers between the user's own accounts, trades and adjustments are neither income nor spending.
- Investment accounts are out of scope: their dividends and interest mostly stay invested and never reach spending money.
- Loan and mortgage accounts are out of scope. The payment that matters is already the expense on the checking account that sent it, so the loan-side leg would count it twice.

Because of the narrower account set, these totals are not the Finances page's average monthly income and expenses, which also include investment income. The page says which accounts it covers.

Card payoff, and checking and card balances over time, belong to a cash-position view that is not built yet. A card payment moves money between the user's accounts. It changes balances but never savings, so it cannot be modelled in this view.

## The forecast

`src/cash-flow/` is pure and deterministic, with no database or provider access. Every figure is computed there, and the page and the model only present them.

A forecast has three disclosed parts:

1. **Recurring** (`recurring.ts`): payees that repeat weekly, every two weeks, twice a month, monthly or quarterly, found in the user's history and projected on their schedule.
   - A payment that lands early or late still belongs to its own cycle.
   - One due shortly before the forecast starts and not yet posted is still expected on the first forecast day. One overdue past its grace period is treated as missed.
   - A stream that stopped is listed as lapsed and not projected.
   - Annual charges are not recognised, because a year of history shows them once. They fall into typical spending as a daily rate.
2. **Typical**: everything else, as a daily rate over at most the last 90 days.
   - A large amount from a payee seen only once in that window is a one-off. It is left out of the rate and listed, because a past windfall or big purchase is not assumed to repeat.
   - A monthly income or expense override from the Finances page replaces the recurring and typical parts of that side.
3. **Planned** (`planned-events.ts`): events the user saved.

The forecast starts the day after the snapshot's compute date, in the user's own calendar. A snapshot a few days old therefore forecasts the days it has not seen instead of reporting them as empty.

A forecast needs at least 28 days of history. Without them the history is still shown and the forecast is reported as unavailable, with the reason.

Months before the connected history begins are unknown, not zero. Periods there have no figures, and a window that history only partly reaches is not totalled.

Plaid's Recurring Transactions add-on is deliberately not used. It is billed separately, and recognising streams here keeps the forecast explainable: the page lists every stream with its cadence, amount and next date.

## Planned events

Planned events are stored in `planned_cash_flow_events`, are scoped to the user, and are capped at 100 per user. Each one is `income` or `expense`, has a positive amount and a start date, and recurs once, weekly, every two weeks, monthly, quarterly or annually, with an optional end date.

A monthly event that starts on the 31st falls on the last day of shorter months and returns to the 31st afterwards.

These are the user's own plans. A hypothetical asked about in chat ("what if I got a $10k bonus?") is never written here.

## API

All routes are under `/api/cash-flow` and use `requireAuth`:

- `GET /?granularity=week|month|quarter|year&horizonMonths=1..12` returns the report. Optional `from` and `to` set a custom range, inclusive on both ends and at most about three years long. If the user has no snapshot yet, the route returns 204.
- `GET /events`, `POST /events`, `PUT /events/:id` and `DELETE /events/:id` manage planned events. Updates and deletes match on both the event id and the user, so another user's event reads as not found.

## Ask Linc

The `cash_flow_forecast` pack runs the same engine through `loadCashFlowModel`, so an answer quotes exactly what the page shows.

Grounding checks every number by value, and the model may not add or net facts. So `src/openai/cash-flow-forecast-context.ts` publishes every figure an answer could need as its own fact, for this month, next month, this and next quarter, this year, and the next 3, 6 and 12 months:

- **Observed so far.** These are snapshot facts.
- **Still expected.** These are forecast facts.
- **Projected total.** A forecast fact with a `sum(inputs)` formula over the two above, which the fact validator rechecks.
- **Planned-event effect, and the projection without it.** Published only for windows the events fall in.

Recurring item amounts, typical monthly spending, planned events (as `user_input`) and the one-offs left out are facts too.

Projections carry the `forecast` provenance kind and a caveat that says what they are built from. The reasoning prompt tells the model to present them as expected, never as observed or guaranteed.

The pack's details give dates, cadences and names, and refer to amounts by fact id rather than repeating them.

For "what should I do with the surplus?", the planner pairs this pack with cash, debt and investment data by meaning. Ask Linc can then set the projected surplus beside card APRs, cash on hand and investments. It describes any split as proportions, because a dollar amount for each part is not a fact.

## History depth

The forecast works from the transactions the snapshot holds, so its depth decides what it can see. Recognising a stream takes repeats: about three months for a monthly bill and six for a quarterly one. Typical spending uses at most the last 90 days.

A connection with little history therefore gets a thinner forecast, never a wrong one. Months before a connection's history begins are unknown, not zero: periods there have no figures, and a window that history only partly reaches is not totalled.
