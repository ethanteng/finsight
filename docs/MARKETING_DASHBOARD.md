# Marketing journeys and calculator health

## Reading the admin pages

Both `/admin/marketing` and `/admin/retirement-calculator` now lead with
**Where do people stop?** Pick a path, then All devices, Mobile, or Desktop.

- **Calculator paths:** landed on this calculator → got a result → saved results
  or chose to sign up → reached signup → created an account → continued to the app.
- **Signup paths:** reached `/getstarted` → started the form → submitted the form
  → created an account → continued to the app. Choose all signup visits, a
  calculator origin, or a specific Save results / email return / calculator CTA route.
- Each arrow reports the share that continued and the count/share that did not
  reach the next step. The callout chooses the largest loss **by session count**,
  not the highest percentage. It identifies where to investigate, not why people left.
- The compact device table compares end-to-end completion for the same selected path.
- Calculator health is three live totals: submitted runs, answers, and rejected
  inputs. Repeated runs are not additional visitors. Financial-input distributions,
  performance, email delivery, and account matches remain in collapsed sections.

`visitorJourneys` is an additive field in the existing authenticated marketing API.
It uses already-loaded, quality-filtered GA4 sessions; no new events, GTM changes,
BigQuery tables, Ads goals, or environment variables are needed. The calculator
admin page loads this report independently, so GA4 errors do not hide live run health.
Both pages retain the existing admin API authorization; no preview/fixture route
is deployed.

### Denominators and limits

These are nested **same-session** paths, not independent event totals. Each later
count requires every earlier boundary in order. Calculator cohorts require the
exact calculator landing path (a trailing slash is accepted). Coast FIRE results
count submitted calculations only, not the automatic default result. The
continuation step accepts that calculator's successful results-email event or
result-specific signup CTA after the result, deduplicating sessions that do both.
Signup arrivals must follow continuation with the matching calculator origin and
`results_page` or `calculator_cta` entry. Email returns are reported separately;
they are never divided by emails sent in the current date range. Account and app
handoff counts also require the form-start and form-submit boundaries, shown in
detail on the signup paths. Handoff still does not prove app load or email ownership.

The first-event timestamp model is conservative: out-of-order retries, skipped
steps, and people returning in another session may not finish a calculator path.
The all-signup path includes visits that skip the calculator. Do not interpret a
path drop-off as proof the person never created an account later.

Drop-off counts **and** rates remain unavailable unless the entire date range
meets the existing verified signup and handoff coverage gates and starts on/after
September 12 (the saved-results tracking boundary). Observed nested counts remain
visible with a warning. Unavailable/truncated GA4 reports produce no fabricated
zeroes. Zero denominators produce no percentage. Live first-party records are not
inserted into the delayed GA4 funnel.

The previous Coast FIRE scorecard, signup outcome table, repeat-run diagnostics,
downstream account metrics, and source notes are retained below the overview in
collapsed sections. The previous-period checkbox applies to these detailed
reports, not the new single-period journey.

## Detailed Coast FIRE scorecard

The authenticated scorecard lives at `/admin/marketing`. It uses the existing
`ADMIN_EMAILS`/JWT admin boundary through `GET /admin/marketing`.

The retained detailed scorecard tests the beachhead thesis in this order:

1. explicit Coast FIRE positioning attracts qualified visits;
2. a calculator result creates demand for a plan using actual finances;
3. that intent survives the complete no-card signup path; and
4. new accounts connect financial data, ask a planning question, and pay.

Generic engagement, device, SEO, acquisition, and detailed signup diagnostics
remain available in the normalized backend report and source tools, but are not
promoted within this detailed experiment scorecard. Calculator input quality, model outcomes,
rejections, and performance live at `/admin/retirement-calculator`.
The scorecard also repeats its headline submission, answer, answer-rate, and
rejection totals as a clearly labeled first-party product-health reference.
Those rows are immediate but contain no GA4 session or campaign identifier, so
they do not populate or substitute for the acquisition journey.

Each calculator also has a separate **Save results → create an account** branch.
After PR #264, saving emails a copy and immediately continues to signup;
the `results_page` route is shown separately from later `results_email` returns.
See `CALCULATOR_RESULTS_PAGE_TRACKING.md` for deployment, GTM, and run-limit semantics. It is
not inserted into the linear result-to-product-CTA journey because a recipient
can return from their inbox in another session or on another device. The branch
shows settled GA4 sessions beside live first-party lead delivery, continuation,
and normalized-email account matches. The two sources intentionally use
different cutoffs: GA4 ends on its latest settled daily-export date, while the
first-party lead window includes the current calendar day through the moment
the report is requested.

## Current state and launch contract

The existing `/retirement-calculator` is the comparison baseline. It measures:

```text
retirement-calculator session
  -> retirement_model_run
  -> start_free_click with cta_location=quickplan_cross_sell
  -> ordered signup through trial_signup_completed (app handoff)
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

event=coast_fire_results_emailed
# successful send only; coast_fire_status, never an address or dollar value

event=calculator_results_email_cta_opened
# emitted only after the emailed token restores the saved scenario
# calculator_type=coast_fire|retirement
# signup_origin=coast_fire_calculator|retirement_calculator
# signup_entry=results_email
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
- **Signup handoff:** CTA sessions that contain the signup steps and account
  creation in order, ending at `trial_signup_completed`. Verification by email
  link, by code, or Skip are separate branches. Login is not required. This
  boundary does not prove that the app loaded or that the email is verified.
- **Results emailed:** result sessions where a successful results-email event
  occurred later in the same session.
- **Email CTA opened:** a later session where the opaque emailed token
  successfully restored the saved scenario on `/getstarted`.
- **Email-path handoff:** `trial_signup_completed` carrying the persisted fixed
  calculator origin and `signup_entry=results_email` attribution. Legacy login
  success and observed skips remain historical evidence, deduplicated per session.
- **First-party continuation:** the first successful signup-context token
  exchange from either direct save or email, persisted as `continuedAt`; reloads
  do not move the timestamp. Denominator: stored requests, not delivered emails.
- **Matched account:** a unique lead email equal to an account created after
  that email's first lead in the reporting window. This is a useful first-party
  match, not proof when a visitor registers under a different address.
- **Financial data observed:** accounts created in the selected window that now
  have an active Plaid token, an external account in their financial snapshot,
  or a verified Public credential.
- **Activated:** accounts created in the selected window that have asked at
  least one Ask Linc question. Automatically saved calculator results are
  excluded using Conversation.origin; user follow-ups still count.
- **Signup paths by device:** observed signup views, accounts, handoffs and
  verification outcomes, split by desktop/mobile/other plus origin and entry.
  Unknown historic attribution remains visible rather than being guessed.
- **Saved results / verified matches:** first-party account state for lead-email
  matches, not inferred GA4 conversions. Available on both admin pages.
- **Paid now:** accounts created in the selected window whose current
  `subscriptionStatus` is `active`. A cohort younger than the 30-day trial has
  not matured and should not be judged on this metric.

The three downstream metrics currently cover all accounts created in the
window. They cannot honestly be attributed to Coast FIRE until original
marketing attribution is persisted with the first-party user.

## Data sources

- GTM container `GTM-PL362L36`, production version 21, forwards
  `coast_fire_results_emailed`, `retirement_results_emailed`,
  `calculator_results_email_cta_opened`, and the fixed email-path attribution
  fields on trial events to GA4. It also forwards the two successful-email
  events to their Google Ads lead conversion actions. Version 19 forwards
  `coast_fire_calculated`; version 17 forwards the strict no-card funnel in
  `TRIAL_SIGNUP_FUNNEL_TRACKING.md`; version 16 forwards the retirement
  calculator events in `CALCULATOR_ABANDONMENT_TRACKING.md`.
- GA4 property `519498279` (`G-0QBF34C7VK`) and its BigQuery export supply
  session acquisition, the journey-specific events, and the strict funnel.
- PostgreSQL supplies account creation, observed financial connections,
  conversations, current subscription state, calculator lead delivery,
  MailerLite sync, and emailed-link continuation.
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
GA4_SIGNUP_HANDOFF_TRACKING_DATE=YYYY-MM-DD
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

After PRs 252–259, `GA4_SIGNUP_HANDOFF_TRACKING_DATE` is also required for
completion and abandonment rates. Set it only after confirming a full Pacific
calendar day with the new frontend events and GTM v24 forwarding. Keep it unset
while collecting; observed counts still appear. Do not backdate it to deployment
or reuse the original September 10 signup-coverage date. See
`TRIAL_SIGNUP_FUNNEL_TRACKING.md` for event meanings and deployment order.

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
- Coast FIRE completion events from before GTM version 19 and results-email branch events from before version 20 cannot be backfilled; Google Ads lead conversion delivery starts with version 21;
- results-email GA4 events from before September 12, 2026 cannot be backfilled;
- paid conversion matures after the 30-day trial, so the initial 4–6 week test
  needs cohort-age context; and
- Search Console and Google Ads spend are not connected. They may improve
  channel optimization later, but are not required to decide whether the
  calculator-to-plan proposition converts.
