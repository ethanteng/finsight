# Calculator signup reporting after PR #264

## Separate the three routes

| Entry | What happened | GA4 arrival event |
| --- | --- | --- |
| `results_page` | Save results sends an email copy and immediately continues to signup | `calculator_results_page_cta_opened` |
| `results_email` | Visitor returns through the emailed results link | `calculator_results_email_cta_opened` |
| `calculator_cta` | Visitor clicks the separate actual-finances / Start free CTA | `start_free_click` |

The direct save redirect must not be counted as an email open or manufactured
`start_free_click`. Existing `sign_up` and `trial_signup_completed` already carry
`signup_origin` and the new `signup_entry=results_page` value. GA4's existing
event-scoped signup-entry dimension accepts this value; no new dimension or
BigQuery table/schema migration is needed.

`sign_up` with `signup_flow=free_trial` still means account creation.
`trial_signup_completed` still means app handoff, not proof of app load or email
verification. A token disclosed to a calculator page does not prove inbox
ownership, even if the visitor later opens that token's email. PR #264's
server-side disclosure check remains authoritative; this analytics change does
not bypass it or relabel every `results_email` signup as `email_link` verified.

## GTM version 26 published September 17, 2026

Container `GTM-PL362L36`, starting live version 25, workspace 26 initially clean.
Published **Calculator flow: direct-save arrivals and run limits**, with exactly
four modified items and no additions/deletions. The console confirmed
[version 26 is live](https://tagmanager.google.com/#/versions/accounts/6333208997/containers/240217360/versions/26).

- Existing tag 92 is renamed **GA4 - calculator results signup arrivals** and
  uses event name `{{Event}}`. It retains measurement `G-0QBF34C7VK` and mappings
  for `source_page`, `content_type`, `calculator_type`, `signup_origin`, and
  `signup_entry`.
- Existing trigger 89 is renamed **CE - calculator results signup arrivals**;
  regex becomes `^calculator_results_(email|page)_cta_opened$`. This preserves the
  email event's exact name and meaning and forwards the distinct page event once.
- Existing tag 68, **GA4 - calculator interactions**, additionally forwards
  `calculator_type` via the existing Version-2 DLV.
- Its trigger 67 becomes
  `^(retirement_(calculator_started|calculator_field_edited|model_clicked|model_requested|validation_error|api_error|request_error)|calculator_run_limit_reached)$`.
- No duplicate tag, direct `gtag` call, or Ads conversion is added. Error-specific
  parameters in tag 68 are only meaningful on error events; ignore any persistent
  GTM values on the new limit event.

Publication is confirmed; live event receipt must be checked separately. Do not claim the new
limit event exists in production before the frontend change is deployed. The
`results_page` arrival producer is already in PR #264.

Both new events are diagnostics, not additional primary Ads conversions. Keep
the native **30-day trial account created** primary, Count One, scoped by GTM
to `sign_up` + `free_trial`. Email delivery remains secondary. Keep campaigns
paused until the separately agreed budget and end-to-end signup checks are done.

## Run-limit measurement

`calculator_run_limit_reached` fires once per calculator page mount when the
three-run lock is visible, including a lock restored from sessionStorage.
Payload: fixed calculator type, content type, pathname only. No form values,
email, token, credentials, or result figures. Contentsquare receives only the
fixed event name, preserving the existing collector's privacy controls.

The limit is per calculator per browser tab, not per GA4 session. Retirement
rates-only answers and failed requests do not consume the limit. Both calculators
share the helper but have separate storage keys. Four-plus GA4 runs can still
occur from earlier traffic, multiple tabs, or blocked storage; the report keeps
that bucket rather than censoring it.

Results-email events now offer a GTM dispatch callback with a 500 ms independent
fallback, and the direct redirect awaits that bounded opportunity. Blocked
analytics cannot prevent signup. A callback confirms tag execution, not server
receipt; validate delivery separately. See Google's [custom-event trigger](https://support.google.com/tagmanager/answer/7679219)
and [data-layer documentation](https://developers.google.com/tag-platform/tag-manager/datalayer).

## Reports

- `/admin/marketing`: separate direct-save arrivals, created-account sessions and
  app-handoff sessions alongside email returns. The existing Signup paths table
  handles `results_page` and retains device/origin/entry splits. These are observed
  outcomes, not a conversion rate from emails sent during the same window.
- Repeat usage adds sessions shown the limit and calculator-attributed accounts
  created after the first observed limit event in the same session, by device.
  Restored-lock sessions count even without a run in the current GA4 session.
  This is ordering evidence, not proof that the limit caused signup.
- `/admin/retirement-calculator` and marketing's first-party details replace
  “Opened signup link” with **Signup-context restores**. `continuedAt` can now
  represent either direct or email token exchange. The continuation denominator
  is stored requests, not delivered emails.
- **Page handoffs prepared** uses PR #264's `tokenDisclosedAt`. It means the server
  prepared a direct handoff, not that navigation succeeded. It cannot distinguish
  subsequent email use of the same token. No additional database migration.
- The maintained backend BigQuery adapter reads the existing export and adds
  calculator-specific page-arrival, account-creation, handoff and limit aggregates.
  It creates no warehouse tables, export jobs, or new billing configuration.
- `analytics-session-reports.sql` adds route/device and limit outcomes while
  preserving literal Start free reports. Known locked sessions are separated
  from voluntary edit-without-run abandonment. The source SQL must be copied into
  any independently saved console report; changing this file alone does not
  update a saved BigQuery query.
- A separate console query, **Ask Linc — calculator signup routes and limits**,
  was saved and successfully executed on September 17 in project
  `gen-lang-client-0360308471` (region `us-central1`). Its maintained source is
  `calculator-signup-routes.sql`. It reports observed sessions and event counts
  by calculator, entry route and device; it does not calculate conversion rates
  or require the strict-funnel coverage date. The first run returned 11 historic
  groups, with no new direct-page or limit rows yet. Missing rows are not verified
  zeros. The pre-existing **Ask Linc — session conversion report (pending data)**
  was left unchanged, including its coverage assertion. No scheduled jobs, export
  settings, billing settings or table schemas were changed.

## Rollout / verification

1. PR #264's disclosure migration must precede its backend. Generate the local
   Prisma client after pulling that schema; this does not migrate production.
2. GTM version 26 is published. Deploy this frontend/backend update, and
   verify both calculators' new events in Tag Assistant and GA4.
3. Test direct saves, emailed returns (including disclosed-token verification),
   separate plan CTAs, unavailable cookie/storage cases, and locked reloads on
   mobile and desktop. Use an approved QA inbox; do not create real accounts or
   send mail to an invented address. Confirm one account-created event and one
   handoff, with correct route and verification method.
4. BigQuery daily export follows its existing schedule. New event parameters are
   exported without registering new custom dimensions. Inspect a complete daily
   export before setting coverage dates; retain the existing handoff-coverage
   gate. Do not use a merge/publish date as evidence of a full observed day.
5. Mark the flow/limit rollout boundary in comparisons. New-event zeros before
   deployment are missing instrumentation, not evidence that nobody converted.
   Events missed between PR #264 and GTM publication cannot be backfilled.

## Verification at handoff

- Frontend: 679 tests in 74 suites, TypeScript and targeted ESLint passed.
- Backend: 70 targeted marketing/lead-report tests in 8 suites, TypeScript and
  targeted ESLint passed. Local Prisma client generated; no production migration.
- BigQuery saved query executed successfully against the current daily export.
- No test signup, email send, or production account was created. End-to-end
  receipt and route verification remain post-deployment checks using an approved
  QA inbox. New run-limit telemetry is not live until this code is deployed.
- No GA4 key event or Google Ads setting was changed in this follow-up. The
  existing free-trial account-created conversion remains the intended primary;
  the new arrival and limit events should not be imported as primary conversions.
  Final browser reinspection of GA4/Ads timed out after the GTM/BigQuery saves;
  campaign and goal state was not freshly reconfirmed during this follow-up.
