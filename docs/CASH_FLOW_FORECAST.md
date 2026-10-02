# Cash flow and forecast (beta)

The Cash flow page (`/cash-flow`) shows cash in and cash out by week, month, quarter, year or a custom range, forecasts the months ahead, and lets the user add planned events. Ask Linc reads the same figures through the `cash_flow_forecast` data pack. The page is open to every signed-in user and is labelled Beta.

## What cash in and cash out mean

Cash in is canonical income and cash out is canonical spending, across cash accounts and credit cards. Net is what the user kept. The definitions are the truth contract's (`docs/FINANCIAL_TRUTH_CONTRACT.md`), applied to a narrower set of accounts:

- A card purchase is spending on the day it is made. A card payment is a transfer and counts as neither, so card spending is never late and never counted twice.
- Transfers between the user's own accounts, trades and adjustments are neither income nor spending.
- Investment accounts are out of scope: their dividends and interest mostly stay invested and never reach spending money.
- Loan and mortgage accounts are out of scope. The payment that matters is already the expense on the checking account that sent it, so the loan-side leg would count it twice.

Because of the narrower account set, these totals are not the history averages beside the expected month on the Finances page, which come from the canonical transaction summary and also include investment income. The page says which accounts it covers.

A card payment moves money between the user's accounts, so it changes balances but never savings. Card payoff therefore lives in the cash-position view and the credit cards panel, described below. Its one effect on savings is the interest it saves.

## The forecast

`src/cash-flow/` is pure and deterministic, with no database or provider access. Every figure is computed there, and the page and the model only present them.

A forecast has three disclosed parts:

1. **Recurring** (`recurring.ts`): payees that repeat weekly, every two weeks, twice a month, monthly or quarterly, found in the user's history and projected on their schedule.
   - A payment that lands early or late still belongs to its own cycle.
   - One due shortly before the forecast starts and not yet posted is still expected on the first forecast day. One overdue past its grace period is treated as missed.
   - A stream that stopped is listed as lapsed and not projected.
   - Repeats are recognized by payee: a key from the merchant name, or else the bank description, with ACH boilerplate and every word containing a digit dropped (an ACH id like `ID:ABC123XYZ`, an order or confirmation number). Those words change with every payment, so keeping their letters would split one payee into many, as it did for payroll whose reference code changes each time. A name made only of such words (1Password, 7-Eleven) keeps its letters.
   - Every two weeks or twice a month: semimonthly pay returns to the same two days of the month, while biweekly pay drifts through it.
     - A few months of biweekly paydays drift so little that they pass for two days of the month: the 17th, 31st, 14th, 28th, 11th and 25th look like "the 14th and the 28th".
     - Read that way, they would be projected on the wrong days and two paydays short a year.
     - So dates that keep to a two-week step, each within two days of it, are biweekly however they fall in the month.
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

## The expected month

`expectedMonthly(model)` is what the forecast expects in a typical month, before planned events. It is the app's expected monthly income and expenses: the Finances page shows it, and Ask Linc plans with it.

- **Income:** every regular income still running, at its monthly rate (biweekly pay is 26 paychecks a year, not two a month), plus the typical rate.
- **Spending:** every regular bill still running at its monthly rate, plus the typical rate, plus the interest projected cards run up at the usual pace, averaged over the next 12 months.
- **Left out:** one-offs and everything the user left out of the forecast. A stopped item the user kept is counted.
- **Planned events:** not counted, card payoff plans included, because they are dated and specific rather than typical.
- **Overrides:** it is exactly the month a Finances override replaces, so a side with an override is the override to the cent. While the forecast is unavailable, a side read from transactions has no figure, and an override still does.

The Finances page shows the expected month as Monthly Income and Monthly Expenses, from `GET /api/cash-flow/expected-monthly`. Beside each figure it shows what happened, averaged over the calendar months the snapshot covers in full. That history leaves out the month the connection's history starts partway through and the month in progress, because dividing a few days' total by a whole month understates every average. With an override set, the page also shows what the forecast would expect from the transactions alone.

## Adjusting what the forecast counts

The page lays out what the forecast is built from in two columns, "Counted in the forecast" and "Left out", and every item moves to the other column with its button (`ForecastBoard`; the engine side is `src/cash-flow/adjustments.ts`). Each change is stored in `cash_flow_forecast_adjustments`:

| Kind | Applies to | Effect |
|---|---|---|
| `exclude_payee` | A regular income or bill, or a payee behind typical spending | The payee's transactions in that direction are left out of what the forecast learns: no stream, no part of a typical rate, no one-off |
| `include_one_off` | A one-off | Counted in the typical rate after all |
| `continue_stream` | A regular item that has stopped | Projected on its cadence as if it had not |
| `exclude_transfer` | A recurring transfer in or out | Left out of what the cash position learns about transfers |

Changes affect only the forecast. Past months stay as they happened, because those transactions did happen. Something that is not really income or spending, such as a transfer to the user's own account, is a category change instead: it is made in Accounts & context and corrects the history and every other part of Ask Linc.

- **How items are named:** a payee by its direction and the ledger's counterparty key, which is what a recurring stream is grouped on; a one-off by its transaction id. A change therefore holds across refreshes for as long as the provider describes the payee the same way. If the payee disappears from the data, the change does nothing.
- **Earlier keys:** keys once kept the letters of reference words. Each transaction also carries the key it had then (`legacyCounterpartyKey`, only where it differs), and a choice matches a payee by either, so changes saved before the keys changed keep applying. The report names the choice that keeps a stopped item (`continuedBy`), since that choice may hold the earlier key.
- **Labels come from the server:** a change must name an item in the user's own data, found by `forecastAdjustmentTarget`. The server stores it under the item's own name, never a name the client sends.
- **Repeats and limits:** saving the same change twice returns the one already saved. The cap is 200 per user, checked under a per-user advisory lock (namespace 872014273) like the planned-event cap.

The columns:

- **Counted in the forecast:** money in and money out, each with its regular items and the payees behind its typical rate (`typicalPayees`, largest first, up to 25 a direction), then recurring transfers. A side the user overrode on Finances shows the override instead, since nothing learned on that side is used.
- **Left out:** one-offs, stopped items, and what the user left out. The column is always shown, empty groups included, so the user can see that nothing is left out and what would be. The one-off group states the actual thresholds the engine applied (`oneOffThresholds`: at least $1,000 and twice a typical week, by direction).

An item the user moved stays where it now belongs, marked: a counted one-off among the typical payees ("counted by you"), a kept item among the regular ones ("kept by you"). Its button undoes the change. A typical payee lists the transactions it holds only because the user counted them (`countedOneOffIds`): ones that would otherwise have been one-offs. So a counted one-off that has aged out of the basis, or whose payee now repeats, is not credited, and undoing it from that row cannot remove a change that is doing something else. A collapsed list of every change, with undo, covers any change whose item is no longer in the data.

Every item shows its category where its transactions have one, and the transactions behind it: the latest at a glance ("6 transactions · latest Sep 14, 2026: $81.20"), and on request each one's date, amount and category. The report carries up to 12 per item, latest first, with the total (`transactions`, `transactionCount`): a regular item's occurrences, the transactions a typical payee is made of in the basis, a left-out payee's transactions, a transfer's movements. A one-off is a single transaction, so it shows its date, amount and category inline.

Long lists show eight items. "Show more" adds eight at a time and "Show all" shows the rest; "Show fewer" goes back to eight and "Hide all" folds the list away.

## Planned events

Planned events are stored in `planned_cash_flow_events`, are scoped to the user, and are capped at 100 per user. The cap is enforced under a per-user advisory lock, so simultaneous creates cannot pass it.

Each event is `income`, `expense` or `card_payment`, has a start date, and recurs once, weekly, every two weeks, monthly, quarterly or annually, with an optional end date. Income and expenses carry a positive amount.

Income or an expense may name the cash account it lands in (`accountId`, checked against the user's own checking and savings accounts). One saved without an account lands in the primary account, described under Cash position. The form offers the choice only when there is more than one cash account, so a single-account user never ties an event to an account that may not stay primary.

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

When the model projects a card's interest (APR known, a balance and a usual pace), that card's historical interest charges (`BANK_FEES_INTEREST_CHARGE`) are taken out of what the savings forecast learns. The projected interest is added back as the `cardInterest` component. So a payoff plan's interest saving reaches the savings forecast, and the interest is counted once. Without an APR, the charges stay in the history and are carried forward like any other spending.

A card projected only from a monthly plan (no usual pace) keeps those charges in the savings forecast, so saving a plan does not change the forecast without plans. Its projection still posts interest from the APR, so the card is charged without the learned charges, whether they were learned as a recurring stream or as part of the typical rate; otherwise interest would count twice on its balance. The cash position charges each card exactly what its projection was given.

A monthly spending override from the Finances page already includes card interest, so the savings forecast adds no projected interest on top of it. The cash position takes the interest the history charged on cards that will be projected with an APR out of the override, at the rate it was charged (never more than the override itself), and each of those cards' projections posts its own interest in its place. Interest on cards that are not projected stays in the override spread. The rest of the override is split between cash and cards in the proportion the history spent, so interest is counted once there too.

The report gives each card's outcome at the usual pace and with the user's plans:

- the month it stops carrying a balance;
- interest over 12 months and over the projection;
- the balance in 12 months;
- the next payment: the first day the card is paid, and all it is paid that day (`nextPayment`);
- what the card is paid in the 12 months from the forecast start (`paymentsTwelveMonths`);
- the interest the plans save;
- how the plans compare with the usual pace (`plansMatchCurrentPace`): `exactly` when every payment goes out on the same day for the same amount, `monthly` when every month is paid, charged and left owing the same but a payment goes out on another day, and null when the plans change the card.

The credit cards panel shows each pace's next payment and its 12-month total, and says it comes from the user's cash only for a card paid from the connected accounts.

A plan can match the usual pace, and the page says so rather than showing two identical outcomes. The common case is paying in full a card already paid in full: the usual pace already pays each statement in full.

- **Panel:** an exact match doesn't change the forecast. A monthly one only moves the day each payment leaves the cash; what the user saves and owes each month is unchanged.
- **Plan form:** it warns as soon as "In full" is chosen for such a card. A one-time payoff of one only takes the money out of cash sooner, and neither changes savings, since there is no interest to stop.
- **When the warning is held back:** the card has another plan that sets a monthly amount. Paying in full takes precedence over that amount, so it can stop interest the set amount would leave behind.

"Without planned events" figures use every card's usual pace. The plans' effect on a window therefore includes the interest they change.

## Cash position

`src/cash-flow/position.ts` simulates every day of the forecast window, starting from the balances the providers last reported.

- **Cash** (checking, savings and other cash accounts) moves with:
  - all income;
  - spending made from cash accounts;
  - planned income and expenses;
  - transfers;
  - the card payments the card model schedules.
- **Card balances** move with purchases, payments and projected interest.

Both come from the same forecast as the savings view: each recurring stream belongs to the account of its latest occurrence, and typical spending is split by account in proportion to the history.

### By account

Every flow lands in one cash account, so the position can be read for any account, or any set of them, as well as for all together:

- **Income and bills:** in the account they were seen in.
- **Transfers:** each leg in its own account. A move from checking to savings leaves one and reaches the other, and nets to nothing in the whole.
- **Typical rates:** each account keeps its own share. An override sets a side's total, and the accounts keep the shares the history gave them.
- **Planned income and expenses:** in the account the user chose.
- **A card's payments:** from the account most of its matched payments came from (`paidFrom`).

What has no account of its own goes to the primary account (`primaryAccountId`), the one that received the most income over the basis, then over the whole history, then the largest checking account. That covers a planned event saved without one, income seen on a card, and a card with no matched payments yet.

The accounts' positions therefore add up exactly to the whole. The whole is computed as the sum of its accounts, and tests hold every figure to it.

A chosen set covers the cards paid from it; the whole covers every projected card, including one paid from elsewhere. A chosen account with a reported balance can be shown even when another account has none, which leaves the whole unavailable.

Transfers on cash accounts are learned the same way as spending: recurring streams plus a typical rate, with one-offs left out.

- A transfer between two connected cash accounts nets to nothing.
- A card payment from a cash account is matched to the payment the card received: the same amount, within five days. Only a matched payment to a card the model projects is left to the card model.
- An unmatched card payment, which paid something not connected, stays an outflow.
- A card whose payments mostly do not match a connected cash account is treated as paid from elsewhere, and its payments do not leave the projected cash.

The cash position is unavailable when:

- there is no forecast;
- there are no cash accounts;
- any account among those the position covers has no reported balance. A partial sum would be wrong, not smaller, because income keeps landing in the account it cannot see.

The report gives balances at each period's end, the lowest point, and fixed milestones: the end of this month and next, and 3, 6 and 12 months out. Each period also says, for its forecast part:

- what arrives (`moneyIn`: income, transfers in, planned income);
- what leaves (`moneyOut`: spending from cash, transfers out, planned expenses);
- what cash pays the cards (`cardPayments`).

Each of these is kept where the money moves, so the cash at a period's end is always the cash before, plus money in, less money out and card payments.

The report also lists every cash account (`accounts`, with the primary one marked) and the ones the figures cover (`accountIds`, all unless the request chose some). It lists what is coming up (`upcoming`): the dated amounts in the month from the forecast start, with the balance at the end of each day. Paychecks, bills, transfers, card payments and planned events are listed; everyday spending runs as a daily rate and is not.

On the page, Cash position has an account picker when there is more than one cash account. "All accounts" is the whole. Choosing an account shows just that one, and further choices add to it. The browser remembers the choice.

"See every period" follows the chart:

- **Under Cash position:** it lists money in, money out and what each period pays the cards, and the cash and card balances at its end. The card columns appear only when a card is projected, and a card paid from elsewhere is named as missing from what is paid. For the whole, money in and out include moves between the user's own accounts.
- **Under the chart:** "Coming up in the next month" lists the upcoming items with the balance after each. Under Savings it lists cash in and out. A card payment is never cash out, so when the user has planned one, the Savings view says where it shows. A plan for a card already paid in full barely moves either chart: its payments are in the cash line with or without the plan, and its only effect on savings is the interest it saves.

Card balances cover only the cards the model projects. The report lists the cards it leaves out and why (`cardsLeftOut`: no reported balance, or no pace to project), and the page names them beside the chart, so a partial total is never shown as all card debt.

## API

All routes are under `/api/cash-flow` and use `requireAuth`:

- `GET /?granularity=week|month|quarter|year&horizonMonths=1..12` returns the report. `accounts=a,b` (up to 20) chooses the cash accounts the cash position covers; ids that are not the user's cash accounts are ignored, and none left means all. Optional `from` and `to` set a custom range, inclusive on both ends and at most about three years long. If the user has no snapshot yet, the route returns 204.
- `GET /events`, `POST /events`, `PUT /events/:id` and `DELETE /events/:id` manage planned events. Updates and deletes match on both the event id and the user, so another user's event reads as not found. A card payment must name one of the user's own connected credit cards, and income or an expense that names an account one of their own cash accounts.
- `GET /expected-monthly` returns the expected month: income and spending, which side an override sets, whether the forecast is available, and, while an override replaces a side, what the transactions alone would give (`learned`). It returns 204 with no snapshot.
- `POST /adjustments` with `{kind, flow, key}` saves a change to what the forecast counts. It returns 201 when saved, 200 when the same change was already saved, 404 when the item is not in the user's data, and 409 at the cap. `DELETE /adjustments/:id` undoes a change and matches on the user like the event routes.

## Ask Linc

Every question carries the expected month, beside the observed averages over complete months. `gatherContextSnapshot` builds the model on every question for it, in parallel with the rest of the context. The facts are:

- `expected_monthly_income` and `expected_monthly_expenses`: a learned side is a forecast fact with its own caveat (what it is built from, and what it leaves out). An overridden side is the user's own figure (`user_input`).
- `expected_monthly_surplus` and `expected_savings_rate`, which the fact validator rechecks against their inputs.

The reasoning prompt tells the model to use the expected figures for anything forward-looking and the averages for what happened. Grounding accepts either one where an answer names a monthly income or expense figure. The home-affordability calculator takes its baseline month from the expected figures too, falling back to the observed average only for a side the forecast has no figure for.

The `cash_flow_forecast` pack runs the same engine through `loadCashFlowModel`, so an answer quotes exactly what the page shows, the user's adjustments included. The pack's details list those adjustments by name (`userAdjustments`), with no amounts, so an answer can say what the user chose to leave out or count.

Grounding checks every number by value, and the model may not add or net facts. So `src/openai/cash-flow-forecast-context.ts` publishes every figure an answer could need as its own fact, for this month, next month, this and next quarter, this year, and the next 3, 6 and 12 months:

- **Observed so far.** These are snapshot facts.
- **Still expected.** These are forecast facts.
- **Projected total.** A forecast fact with a `sum(inputs)` formula over the two above, which the fact validator rechecks.
- **Planned-event effect, and the projection without it.** Published only for windows the events fall in.

Recurring item amounts, typical monthly spending, planned events (as `user_input`) and the one-offs left out are facts too.

Nothing in the pack is capped: every recurring item, planned event, one-off, card and cash account is listed. The user's own data bounds each list, an item left out would be one an answer could not speak to, and the reviewer sees the same facts.

Credit cards and the cash position are facts as well:

- **Each card:** balance and purchase APR (snapshot facts). The usual payment. At the usual pace and with the user's plans: interest over 12 months, balance in 12 months, and months until it stops carrying a balance (in `months`).
- **Interest a plan saves:** a forecast fact with an `abs(input[0] - input[1])` formula over the two interest figures, which the validator rechecks.
- **Cash:** cash now, cash at each milestone, and the lowest point in the next 12 months.
- **Card debt:** owed now and at each milestone, labelled as covering the cards the forecast projects. It is published only when the forecast projects at least one card, and the details name any card it leaves out.
- **Each cash account**, when there is more than one: cash now, at each milestone, and the lowest point in the next 12 months.
  - Every account is listed: the primary account first, then the largest. The user's own accounts bound the list, and an account left out would be one an answer could not speak to.
  - The details name each account and its fact id prefix, and mark the primary one.

The shared caveat says how card interest is estimated.

Projections carry the `forecast` provenance kind and a caveat that says what they are built from. The reasoning prompt tells the model to present them as expected, never as observed or guaranteed.

The pack's details give dates, cadences and names, and refer to amounts by fact id rather than repeating them.

For "what should I do with the surplus?", the planner pairs this pack with cash, debt and investment data by meaning. Ask Linc can then set the projected surplus beside each card's APR, the interest a saved payoff plan would save, the projected cash low point and investments. It describes any split as proportions, because a dollar amount for each part is not a fact.

## History depth

The forecast works from the transactions the snapshot holds, so its depth decides what it can see. Recognising a stream takes repeats: about three months for a monthly bill and six for a quarterly one. Typical spending uses at most the last 90 days.

A connection with little history therefore gets a thinner forecast, never a wrong one. Months before a connection's history begins are unknown, not zero: periods there have no figures, and a window that history only partly reaches is not totalled.
