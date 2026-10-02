# Cash flow and forecast (beta)

The Cash flow page (`/cash-flow`) shows cash in and cash out by week, month, quarter, year or a custom range, forecasts the months ahead, and lets the user add planned events. Ask Linc reads the same figures through the `cash_flow_forecast` data pack. The page is open to every signed-in user and is labelled Beta.

## What cash in and cash out mean

Cash in is canonical income and cash out is canonical spending, across cash accounts and credit cards. Net is what the user kept. The definitions are the truth contract's (`docs/FINANCIAL_TRUTH_CONTRACT.md`), applied to a narrower set of accounts:

- A card purchase is spending on the day it is made. A card payment is a transfer and counts as neither, so card spending is never late and never counted twice.
- Transfers between the user's own accounts, trades and adjustments are neither income nor spending.
- Investment accounts are out of scope: their dividends and interest mostly stay invested and never reach spending money.
- Loan and mortgage accounts are out of scope. The payment that matters is already the expense on the checking account that sent it, so the loan-side leg would count it twice.

Because of the narrower account set, these totals are not the Finances page's average monthly income and expenses, which also include investment income. The page says which accounts it covers.

A card payment moves money between the user's accounts, so it changes balances but never savings. Card payoff therefore lives in the cash-position view and the credit cards panel, described below. Its one effect on savings is the interest it saves.

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

A forecast needs at least 28 days of history for any side read from transactions. Without them the history is still shown and the forecast is reported as unavailable, with the reason. When both income and spending are overridden, the forecast needs no history at all.

Months before the connected history begins are unknown, not zero:

- Periods there have no figures.
- A highlight window that history only partly reaches is not totalled, and one with no history behind it reports nothing observed rather than $0.
- The default range starts on the first day of history, so its first period may be clipped to a date range. A custom range that reaches back before the history keeps its per-period rows, marked partial, but withholds its totals.

Plaid's Recurring Transactions add-on is deliberately not used. It is billed separately, and recognising streams here keeps the forecast explainable: the page lists every stream with its cadence, amount and next date.

## Planned events

Planned events are stored in `planned_cash_flow_events`, are scoped to the user, and are capped at 100 per user. The cap is enforced under a per-user advisory lock, so simultaneous creates cannot pass it.

Each event is `income`, `expense` or `card_payment`, has a start date, and recurs once, weekly, every two weeks, monthly, quarterly or annually, with an optional end date. Income and expenses carry a positive amount.

A card payment names one of the user's connected credit cards (`accountId`, checked against the user's own accounts) and a `paymentMode`. It happens once or monthly:

| | Once | Every month |
|---|---|---|
| `full` | Clears everything the card owes that day | Pays each statement in full, so no interest accrues |
| `fixed` | An extra payment on top of the usual one | Replaces the usual payment, up to the statement |

A `full` payment has no amount of its own; the balance sizes it.

A monthly event that starts on the 31st falls on the last day of shorter months and returns to the 31st afterwards.

These are the user's own plans. A hypothetical asked about in chat ("what if I got a $10k bonus?") is never written here.

## Credit cards

`src/cash-flow/cards.ts` projects each card month by month across the forecast window:

- **Statement:** what the card owed at the end of the previous month.
- **Regular payment:** goes out on the card's due day. It is the user's usual pace, or a monthly plan if one is running, and never more than the statement. One-time plans come on top of it.
- **Interest:** the purchase APR over 12, applied to the part of the statement left unpaid. Paying in full keeps the grace period.

No payment is more than the card owes on its day, so a card never shows a credit: a payoff clears what is owed that day, and purchases after it are owed again. Months are accounted whole, through the month the forecast window ends in, so a payment due just after the window still decides what that month carries; only payments and interest dated inside the window reach the cash position.

Statement dates, daily balances, and the interest new purchases attract once a balance is carried are simplified away, and the interest is disclosed as an estimate.

The usual pace comes from the card's last 90 days:

- **Paid in full:** payments were made and no interest was charged.
- **Average payment:** payments were made but interest was still charged, so the card carries a balance. The pace is the average payment, never below the minimum.
- **Minimum payment:** no payments were seen but the provider gives a minimum.
- **Unknown:** no payments seen and no minimum. Such a card is projected only under a monthly plan, which sets what it is paid, and then counts only the payments the user plans; a one-time plan alone says nothing about the months after it. A card with no reported balance is not projected.

The APR, minimum and due day come from Plaid Liabilities. A card whose APR the provider does not share still projects its balance, with interest reported as unknown rather than zero.

When the model projects a card's interest (APR known, a balance and a pace), that card's historical interest charges (`BANK_FEES_INTEREST_CHARGE`) are taken out of what the savings forecast learns. The projected interest is added back as the `cardInterest` component. So a payoff plan's interest saving reaches the savings forecast, and the interest is counted once. Without an APR, the charges stay in the history and are carried forward like any other spending.

The report gives each card's outcome at the usual pace and with the user's plans:

- the month it stops carrying a balance;
- interest over 12 months and over the projection;
- the balance in 12 months;
- the interest the plans save.

"Without planned events" figures use every card's usual pace. The plans' effect on a window therefore includes the interest they change.

## Cash position

`src/cash-flow/position.ts` simulates every day of the forecast window, starting from the balances the providers last reported.

- **Cash** (checking, savings and other cash accounts) moves with:
  - all income;
  - spending made from cash accounts;
  - planned income and expenses (assumed to go through cash);
  - transfers;
  - the card payments the card model schedules.
- **Card balances** move with purchases, payments and projected interest.

Both come from the same forecast as the savings view: each recurring stream belongs to the account of its latest occurrence, and typical spending is split by account in proportion to the history.

Transfers on cash accounts are learned the same way as spending: recurring streams plus a typical rate, with one-offs left out.

- A transfer between two connected cash accounts nets to nothing.
- A card payment from a cash account is matched to the payment the card received: the same amount, within five days. Only a matched payment to a card the model projects is left to the card model.
- An unmatched card payment, which paid something not connected, stays an outflow.
- A card whose payments mostly do not match a connected cash account is treated as paid from elsewhere, and its payments do not leave the projected cash.

The cash position is unavailable when:

- there is no forecast;
- there are no cash accounts;
- any cash account has no reported balance. A partial sum would be wrong, not smaller, because income keeps landing in the account it cannot see.

The report gives balances at each period's end, the lowest point, and fixed milestones: the end of this month and next, and 3, 6 and 12 months out.

Card balances cover only the cards the model projects. The report lists the cards it leaves out and why (`cardsLeftOut`: no reported balance, or no pace to project), and the page names them beside the chart, so a partial total is never shown as all card debt.

## API

All routes are under `/api/cash-flow` and use `requireAuth`:

- `GET /?granularity=week|month|quarter|year&horizonMonths=1..12` returns the report. Optional `from` and `to` set a custom range, inclusive on both ends and at most about three years long. If the user has no snapshot yet, the route returns 204.
- `GET /events`, `POST /events`, `PUT /events/:id` and `DELETE /events/:id` manage planned events. Updates and deletes match on both the event id and the user, so another user's event reads as not found. A card payment must name one of the user's own connected credit cards.

## Ask Linc

The `cash_flow_forecast` pack runs the same engine through `loadCashFlowModel`, so an answer quotes exactly what the page shows.

Grounding checks every number by value, and the model may not add or net facts. So `src/openai/cash-flow-forecast-context.ts` publishes every figure an answer could need as its own fact, for this month, next month, this and next quarter, this year, and the next 3, 6 and 12 months:

- **Observed so far.** These are snapshot facts.
- **Still expected.** These are forecast facts.
- **Projected total.** A forecast fact with a `sum(inputs)` formula over the two above, which the fact validator rechecks.
- **Planned-event effect, and the projection without it.** Published only for windows the events fall in.

Recurring item amounts, typical monthly spending, planned events (as `user_input`) and the one-offs left out are facts too.

Credit cards and the cash position are facts as well:

- **Each card:** balance and purchase APR (snapshot facts). The usual payment. At the usual pace and with the user's plans: interest over 12 months, balance in 12 months, and months until it stops carrying a balance (in `months`).
- **Interest a plan saves:** a forecast fact with an `abs(input[0] - input[1])` formula over the two interest figures, which the validator rechecks.
- **Cash:** cash now, cash at each milestone, and the lowest point in the next 12 months.
- **Card debt:** owed now and at each milestone, labelled as covering the cards the forecast projects. It is published only when the forecast projects at least one card, and the details name any card it leaves out.

The shared caveat says how card interest is estimated.

Projections carry the `forecast` provenance kind and a caveat that says what they are built from. The reasoning prompt tells the model to present them as expected, never as observed or guaranteed.

The pack's details give dates, cadences and names, and refer to amounts by fact id rather than repeating them.

For "what should I do with the surplus?", the planner pairs this pack with cash, debt and investment data by meaning. Ask Linc can then set the projected surplus beside each card's APR, the interest a saved payoff plan would save, the projected cash low point and investments. It describes any split as proportions, because a dollar amount for each part is not a fact.

## History depth

The forecast works from the transactions the snapshot holds, so its depth decides what it can see. Recognising a stream takes repeats: about three months for a monthly bill and six for a quarterly one. Typical spending uses at most the last 90 days.

A connection with little history therefore gets a thinner forecast, never a wrong one. Months before a connection's history begins are unknown, not zero: periods there have no figures, and a window that history only partly reaches is not totalled.
