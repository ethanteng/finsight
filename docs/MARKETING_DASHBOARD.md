# Marketing performance dashboard

The authenticated dashboard lives at `/admin/marketing`. It uses the existing
`ADMIN_EMAILS`/JWT admin boundary through `GET /admin/marketing`.

## Source of truth

- GTM container `GTM-PL362L36`, production version 17, forwards the exact
  no-card funnel in `TRIAL_SIGNUP_FUNNEL_TRACKING.md` to GA4 property
  `519498279` (`G-0QBF34C7VK`). Version 16 forwards the calculator interaction
  events in `CALCULATOR_ABANDONMENT_TRACKING.md`.
- GA4 BigQuery session data is the only source used for strict funnel and
  intent-cohort rates. The dashboard will not infer them from page visits.
- PostgreSQL supplies live first-party account, verification, latest-login,
  subscription, and conversation state. These are shown as a reality check,
  not joined to marketing attribution because the user records do not store a
  GA4 pseudonymous id or original acquisition fields.
- Contentsquare project `530048` and the asklinc.com Ubersuggest project have a
  connector-verified snapshot captured September 9, 2026. It is explicitly
  labeled as a snapshot. Runtime credentials for those products are not
  currently available to the app.

`trial_login_success` is displayed as **Trial path completed**. It is the end
of the newly instrumented no-card signup path; there is no separate
`trial_completed` browser event. Current first-party trial/subscription state
is displayed separately so those meanings cannot be conflated.

## Enabling live GA4 data

Add these backend-only environment variables on Render:

```text
GA4_BIGQUERY_SERVICE_ACCOUNT_JSON={...single-line service account JSON...}
GA4_BIGQUERY_PROJECT_ID=gen-lang-client-0360308471
GA4_BIGQUERY_DATASET_ID=analytics_519498279
GA4_BIGQUERY_LOCATION=US
GA4_FIRST_FULL_TRACKING_DATE=YYYY-MM-DD
GA4_REPORTING_LAG_DAYS=3
```

Grant the service account only the permissions needed to run query jobs and
read the GA4 export dataset. Never add this JSON to the frontend or a
`NEXT_PUBLIC_` variable. Set `GA4_FIRST_FULL_TRACKING_DATE` only after every
new event has been observed without sensitive parameters in GA4 and the first
complete daily export exists. Until then, the dashboard shows **Collecting**
instead of zeros.

The adapter fetches at most 100,000 sessions for the selected current and
comparison windows. If the cap is reached, the UI emits a warning and the
range should be narrowed. The strict funnel requires every earlier step in
order within the same session; raw downstream reach is retained separately to
surface re-entry and missing-upstream instrumentation.

## Intent rules

Rules are ordered in `src/marketing-analytics/intent-rules.ts`. The current
priority is:

1. retirement/calculator;
2. competitor/comparison;
3. paid brand;
4. paid nonbrand;
5. savings/net worth;
6. generic AI financial planning;
7. brand/direct;
8. blog/informational SEO; and
9. Unknown.

The first match wins. Raw source, medium, campaign, landing page, keyword,
creative/ad id, and referrer remain on the normalized session record for
auditing. Unknown is mandatory and last.

## Known gaps

- Search Console query impressions, clicks, CTR and average position are not
  connected. Ubersuggest volume/ranking data remains separate.
- Google Ads spend and creative reporting are not connected, so CAC is blank.
- Contentsquare error/frustration APIs are not included in the current account
  entitlement; page activity, bounce, exit, scroll, interaction and LCP remain
  available in the verified snapshot.
- Historical no-card funnel events cannot be backfilled. A pre-September 9
  absence is not abandonment.
