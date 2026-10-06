# Cohort engagement and activation

The **Engagement** and **Activation** tabs in `/admin` group accounts into daily, weekly or
monthly cohorts by when they started, then show what share of each cohort did something in
each day, week or month after that start. Clicking a cohort lists its users.

Served by `GET /admin/cohorts/engagement` and `GET /admin/cohorts/activation`
(`src/routes/admin-cohorts.ts`), computed in `src/cohort-analytics/`.

## Who is in a cohort

- **Trials** — every new account, clocked from signup. That covers no-card signups, checkout
  card trials and admin trials. Most of them carry no trial state at all: a no-card signup is
  `subscriptionStatus: inactive` with no end date, the same shape as an admin-created account,
  so signup is the only start every one of them has.
- **Paid** — clocked from the first successful charge above $0, read from the
  `invoice.payment_succeeded` / `invoice.paid` webhooks in `SubscriptionEvent`. The $0
  invoice that opens a trial does not count. An account that converts appears in both
  segments, each from the start of that stage.
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
when nobody has, the cell is blank.

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
the member's start (a paid account that linked during its trial) counts from period 1.

No column records when a user first linked, and disconnecting deletes the rows that did, so
the first link is reconstructed from what survives:

| Provider | Evidence | Date used |
|---|---|---|
| Plaid | any `AccessToken` row, including superseded and errored Items; a `plaid-connection-disconnected` history row | earliest of these |
| SnapTrade | a `SnapTradeUser` row **plus** a sign a brokerage was reached: a SnapTrade account in the snapshot, synced activity, a renamed `snaptrade-` account, or a SnapTrade removal in history | registration, the first step of connecting |
| Public | a credential that has verified; a renamed `public-` account; a Public connect or removal in history | earliest of these |

So the report undercounts anyone who linked and later removed every connection without a
provider-specific history row surviving. Recording a first-link date on the user would make
this exact going forward; it was considered and not done.
