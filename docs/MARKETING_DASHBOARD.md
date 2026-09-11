# Coast FIRE go-to-market scorecard

The authenticated scorecard lives at `/admin/marketing`. It uses the existing
`ADMIN_EMAILS`/JWT admin boundary through `GET /admin/marketing`.

The page is deliberately narrow. It tests the beachhead thesis in this order:

1. explicit Coast FIRE positioning attracts qualified visits;
2. a calculator result creates demand for a plan using actual finances;
3. that intent survives the complete no-card signup path; and
4. new accounts connect financial data, ask a planning question, and pay.

Generic engagement, device, SEO, acquisition, and detailed signup diagnostics
remain available in the normalized backend report and source tools, but are not
promoted on this decision page. Calculator input quality, model outcomes,
rejections, and performance live at `/admin/retirement-calculator`.
The scorecard also repeats its headline submission, answer, answer-rate, and
rejection totals as a clearly labeled first-party product-health reference.
Those rows are immediate but contain no GA4 session or campaign identifier, so
they do not populate or substitute for the acquisition journey.

## Current state and launch contract

The existing `/retirement-calculator` is the comparison baseline. It measures:

```text
retirement-calculator session
  -> retirement_model_run
  -> start_free_click with cta_location=quickplan_cross_sell
  -> strict trial_login_success
```

The Coast FIRE experiment is live (`COAST_FIRE_EXPERIMENT.live === true` in
`src/marketing-analytics/beachhead-scorecard.ts`). It does not relabel generic
retirement traffic. A session enters the Coast FIRE cohort only through one of
these auditable signals:

- page activity under `/coast-fire*`;
- `content_type=coast_fire_calculator`; or
- “Coast FIRE” in campaign, keyword, or creative metadata.

The Coast FIRE calculator result event and plan CTA must use:

```text
event=coast_fire_calculated
# with calculation_trigger=default|submitted (never dollar amounts)

event=start_free_click
cta_location=coast_fire_plan_cta
```

GTM must forward `coast_fire_calculated` to GA4 (Custom Event trigger + GA4
Event tag mapping `coast_fire_status`, `calculation_trigger`,
`years_to_retirement`, `source_page`, and `content_type`). Version 16's
calculator-interaction allowlist does not include this event; without a new
tag, Qualified visits can move while Result shown and every stage below it stay
at zero. The existing `start_free_click` tag is enough for the plan CTA as long
as it passes through `cta_location`.

Setting `COAST_FIRE_EXPERIMENT.live` back to `false` returns the UI to
**Pre-launch baseline** (blank rather than zero) if the page is pulled. While
the flag is on, a real zero remains zero and is no longer confused with “not
launched.”

## Metric definitions

- **Qualified visits:** quality-filtered sessions in the selected journey.
- **Result shown:** sessions with that journey's result event
  (`retirement_model_run` for the retirement calculator baseline;
  `coast_fire_calculated` for Coast FIRE).
- **Actual-plan CTA:** result sessions that also fire the journey-specific CTA
  in the same session. Clicking the cross-sell before a result does not count.
- **Trial completed:** CTA sessions that contain every published signup,
  verification, and first-login step in order, ending at
  `trial_login_success`.
- **Financial data observed:** accounts created in the selected window that now
  have an active Plaid token, an external account in their financial snapshot,
  or a verified Public credential.
- **Activated:** accounts created in the selected window that have asked at
  least one Ask Linc question.
- **Paid now:** accounts created in the selected window whose current
  `subscriptionStatus` is `active`. A cohort younger than the 30-day trial has
  not matured and should not be judged on this metric.

The three downstream metrics currently cover all accounts created in the
window. They cannot honestly be attributed to Coast FIRE until original
marketing attribution is persisted with the first-party user.

## Data sources

- GTM container `GTM-PL362L36`, production version 19, forwards
  `coast_fire_calculated`. Version 17 forwards the strict no-card funnel in
  `TRIAL_SIGNUP_FUNNEL_TRACKING.md`; version 16 forwards the retirement
  calculator events in `CALCULATOR_ABANDONMENT_TRACKING.md`.
- GA4 property `519498279` (`G-0QBF34C7VK`) and its BigQuery export supply
  session acquisition, the journey-specific events, and the strict funnel.
- PostgreSQL supplies account creation, observed financial connections,
  conversations, and current subscription state.
- Contentsquare and Ubersuggest remain visible in the collapsed diagnostics as
  verified snapshots. They do not drive the beachhead scorecard.

Session reporting uses these backend-only environment variables. The service
account and project/dataset settings connect the export;
`GA4_FIRST_FULL_TRACKING_DATE` is required only for strict trial attribution:

```text
GA4_BIGQUERY_SERVICE_ACCOUNT_JSON={...single-line service account JSON...}
GA4_BIGQUERY_PROJECT_ID=gen-lang-client-0360308471
GA4_BIGQUERY_DATASET_ID=analytics_519498279
GA4_BIGQUERY_LOCATION=US
GA4_FIRST_FULL_TRACKING_DATE=YYYY-MM-DD
GA4_REPORTING_LAG_DAYS=1
GA4_ALLOWED_HOSTNAMES=asklinc.com,www.asklinc.com
```

`GA4_FIRST_FULL_TRACKING_DATE` is the first reporting-calendar day when the
complete signup event chain and GTM forwarding were live for the entire day.
It is a fixed coverage boundary, not a launch date and not a value that moves.
If tracking went live partway through September 9, use `2026-09-10` after that
complete daily export has been inspected. Until then, leave it unset; the
scorecard still reports available GA4 session, calculator-result, and plan-CTA
metrics, but reports strict trial completion as unavailable instead of zero.
The coverage date never blocks the underlying session query.

The BigQuery service account needs only query-job and dataset-read permissions.
Its JSON must never be exposed to the frontend or a `NEXT_PUBLIC_` variable.

The one-day reporting lag matches GA4's daily export cadence: yesterday's
`events_YYYYMMDD` table is normally available the following day. It favors
freshness, so the newest counts are provisional: GA4 can add late-arriving
events to a daily table for up to three days. Setting the lag to `0` is
supported, but it will not make today's activity available unless GA4 streaming
export is enabled and the query is extended to include intraday tables.

## Quality and known gaps

The scorecard uses the same default reporting population as the normalized
marketing service: human and ambiguous sessions are included; confirmed bots,
internal/debug traffic, admin sessions, preview hosts, and known automation are
excluded. Loading the authenticated marketing dashboard marks that browser as
internal for future analytics loads.

Known gaps that affect the beachhead decision:

- original campaign/cohort and a privacy-safe analytics join key are not stored
  on the user, so first-party connection, activation, and payment are not yet
  attributable to Coast FIRE;
- Coast FIRE events from before GTM version 19 cannot be backfilled;
- paid conversion matures after the 30-day trial, so the initial 4–6 week test
  needs cohort-age context; and
- Search Console and Google Ads spend are not connected. They may improve
  channel optimization later, but are not required to decide whether the
  calculator-to-plan proposition converts.
