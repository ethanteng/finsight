# Marketing performance dashboard

The authenticated dashboard lives at `/admin/marketing`. It uses the existing
`ADMIN_EMAILS`/JWT admin boundary through `GET /admin/marketing`.

## Source of truth

- GTM container `GTM-PL362L36`, production version 17, forwards the exact
  no-card funnel in `TRIAL_SIGNUP_FUNNEL_TRACKING.md` to GA4 property
  `519498279` (`G-0QBF34C7VK`). Version 16 forwards the calculator interaction
  events in `CALCULATOR_ABANDONMENT_TRACKING.md`.
- GA4 BigQuery session data is the only source used for acquisition, strict
  funnel, behavior breakdowns, and intent-cohort rates. Acquisition uses
  session-scoped source/medium/campaign fields; a blank HTTP referrer is never
  substituted as `Direct` or `unattributed`.
- PostgreSQL supplies live first-party account, verification, latest-login,
  subscription, and conversation state. These are shown as a reality check,
  not joined to marketing attribution because the user records do not store a
  GA4 pseudonymous id or original acquisition fields.
- Contentsquare project `530048` and the asklinc.com Ubersuggest project have a
  connector-verified snapshot captured September 9, 2026. It is explicitly
  labeled as a snapshot. Its headline population is corrected from 944 raw
  sessions to 569 after excluding 291 automated sessions and 84
  owner-confirmed internal sessions. Historical acquisition, page, device, and
  visitor-type breakdowns are withheld because they cannot be exactly rebuilt
  from the aggregate snapshot after those exclusions.

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
GA4_ALLOWED_HOSTNAMES=asklinc.com,www.asklinc.com
```

`GA4_FIRST_FULL_TRACKING_DATE` is the first reporting-calendar day when the
frontend events and GTM forwarding were live for the entire day. It is not the
GTM publish timestamp, the BigQuery connection date, or a value that advances
each day. For example, if the frontend event bridge went live partway through
September 9, use `2026-09-10`; if it went live partway through September 12,
use `2026-09-13`. Leave it unset until that day's complete daily export has
been inspected. The configured value is the dashboard's single source of truth
for funnel filtering, comparison coverage, warnings, and the visible coverage
badge.

Grant the service account only the permissions needed to run query jobs and
read the GA4 export dataset. Never add this JSON to the frontend or a
`NEXT_PUBLIC_` variable. Set `GA4_FIRST_FULL_TRACKING_DATE` only after every
new event has been observed without sensitive parameters in GA4 and the first
complete daily export exists. Invalid or impossible date values are reported
as configuration errors. Until then, the dashboard shows **Collecting**
instead of zeros.

The adapter fetches at most 100,000 sessions for the selected current and
comparison windows. If the cap is reached, the UI emits a warning and the
range should be narrowed. The strict funnel requires every earlier step in
order within the same session; raw downstream reach is retained separately to
surface re-entry and missing-upstream instrumentation.

## Traffic quality

Every live GA4 session is classified as `human`, `bot`, `internal`,
`synthetic`, or `unknown` before headline metrics, funnels, acquisition,
landing pages, devices, visitor types, and intent cohorts are calculated.

The default reporting population includes `human` and deliberately retains
ambiguous `unknown` sessions. It excludes:

- GA4 `traffic_type` values for internal, developer, or test traffic;
- GA4 debug-mode sessions;
- any session containing an `/admin` page;
- known crawler/render browser names;
- the verified unknown-device, one-page, zero-engagement automation signature;
- hostnames outside `GA4_ALLOWED_HOSTNAMES`.

The dashboard shows raw, included, and excluded counts, classification totals,
and exclusion-reason totals. Admins can inspect a classification or include
excluded traffic without changing the default KPI population. Engagement is
shown as average, median, and p75 so a long-lived tab cannot silently dominate
the only duration statistic.

After a browser successfully loads `/admin/marketing`, the frontend stores a
local internal-browser marker. Future full page loads on that browser do not
load GTM or Contentsquare, and custom client events also stop immediately.
Clearing site storage removes the marker; visiting the authenticated marketing
dashboard restores it. This prevents the owner's ordinary browsing from
recreating the confirmed internal-session distortion without using a broad
Firefox or geography exclusion.

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
  entitlement. Historical page activity, bounce, exit, scroll, interaction,
  and LCP aggregates are not shown in `/admin/marketing` because the available
  snapshot cannot apply the verified traffic-quality exclusions exactly.
- Historical no-card funnel events cannot be backfilled. A pre-September 9
  absence is not abandonment.
