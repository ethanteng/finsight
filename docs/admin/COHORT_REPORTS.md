# Cohort engagement and activation

The **Engagement** and **Activation** tabs in `/admin` group accounts into daily, weekly or
monthly cohorts by when they started, then show what share of each cohort did something in
each day, week or month after that start. Clicking a cohort lists its users.

Served by `GET /admin/cohorts/engagement` and `GET /admin/cohorts/activation`
(`src/routes/admin-cohorts.ts`), computed in `src/cohort-analytics/`.

## Who is in a cohort

The **Signups / Trials / Paid** toggle picks which start clocks a cohort. An account that goes
through all three appears in each, from that start.

- **Signups** — every new account, clocked from account creation.
- **Trials** — accounts that started a Stripe trial, clocked from the trial's start. That is
  an automatic grant on no-card `/auth/register` (when Stripe is configured), **Convert to
  trial** in User Management (`/admin/user-trial`, see `ADMIN_TRIALS.md`), or a checkout card
  trial. A no-card signup whose grant failed (or a backend with no `STRIPE_SECRET_KEY`) stays
  `subscriptionStatus: inactive` with no end date until converted by hand, so it is only in
  signup cohorts until then.
  The start is `trial_start` from the logged `customer.subscription.*` webhooks, which stays
  on the subscription after the trial converts or lapses. A trial running now whose webhook
  was never logged is dated from its `Subscription` row. A finished trial with neither is
  missed.
- **Paid** — clocked from the first successful charge above $0, read from the
  `invoice.payment_succeeded` / `invoice.paid` webhooks in `SubscriptionEvent`. The $0
  invoice that opens a trial does not count.
- Accounts in `ADMIN_EMAILS` are left out and counted beside the report.
- A paying account with no logged charge cannot be placed and is counted as
  `payingWithoutRecordedCharge` rather than guessed at. A Stripe backfill of old invoices
  would close that gap.
- Deleted accounts are gone from every cohort, with their questions.

Cohorts are bucketed on UTC dates; weeks start on Monday. Periods are relative to each
member's own start: week 1 is the seven days after that member started, not a calendar week.
Months keep the day of month, clamped to shorter months.

## Reading a cell

A cell counts only members whose period has fully elapsed. A period still in progress is not
a zero: when part of the cohort has finished it, the share is of those who have (marked `*`);
when nobody has, it shows a dash.

### Engagement

Engaged in a period means averaging at least **X questions per Y** across it. When Y matches
the column length, that is simply X questions in the column. When it does not, the requirement
scales to the column and rounds up to whole questions: 3 per week in a daily column needs one
question; 1 per week in a monthly column needs 4 in February and 5 in a 31-day month.

A question is a `Conversation` row with `origin: 'user'`. Calculator results saved into a new
account (`calculator_*` origins) are not questions.

### Activation

Activation is linking at least one account: a Plaid bank, a SnapTrade brokerage, or a Public
key that has verified at least once. Manual accounts are not links. The cells are cumulative —
the share linked by the end of that period — because linking happens once. A link made before
the member's start (a trial or paid account that linked before it started) counts from period 1.

No column records when a user first linked, and disconnecting deletes the rows that did, so
the first link is reconstructed from what survives:

| Provider | Evidence | Date used |
|---|---|---|
| Plaid | any `AccessToken` row, including superseded and errored Items; a `plaid-connection-disconnected` history row | earliest of these |
| SnapTrade | a `SnapTradeUser` row **plus** a sign a brokerage was reached: a SnapTrade account in the snapshot, synced activity, a stored `snaptrade-` account row (written on sync), a SnapTrade removal in history, or any Public evidence below — a direct Public key can only be added to an account already linked to Public through SnapTrade | registration, the first step of connecting |
| Public | a credential that has verified; a stored `public-` account row; a Public connect or removal in history | earliest of these |

So the report undercounts anyone who linked and later removed every connection without a
provider-specific history row surviving. Recording a first-link date on the user would make
this exact going forward; it was considered and not done.
