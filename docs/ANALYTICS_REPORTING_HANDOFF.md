# Analytics reporting handoff — September 9, 2026

## Live configuration

- Contentsquare primary dashboard updated in place: https://app.contentsquare.com/#/dashboards/2193ca02-d057-4f22-83d0-2345fb793f9f?project=530048
- Saved desktop/mobile comparisons for Start free click sessions, signup-page reach, calculator-to-signup page progression, and most-visited pages.
- Start free segment uses clicked text containing `Start free`, including older `Start free trial` text. These are sessions with a click, not raw click counts or source-page attribution. The percentage card is explicitly a share of ALL site sessions, not within-device CTR.
- GA4 exploration with signup-page-to-sign_up and field-edit-to-Run-click funnels: https://analytics.google.com/analytics/web/#/analysis/a380265295p519498279/edit/HXBtWKU2Ra-DR6xfs5TmZQ
- Native funnels count users and can span sessions. The field-edit funnel includes all calculator editors, not only calculator landings.
- GTM version 16 published, forwarding seven calculator interaction/error events.
- GTM version 17, **No-card trial signup funnel**, published September 9, 2026. It adds three scoped GA4 tags, three custom-event triggers, and two safe data-layer variables for the signup, verification, and first-login funnel. Existing result, `start_free_click`, `sign_up`, Contentsquare, and Ads tags are unchanged.
- GA4 event-scoped custom dimensions are registered for `signup_flow`, `source_page`, `error_category`, and `validation_reason`.
- GA4 property 519498279 linked to existing Ask Linc Cloud project `gen-lang-client-0360308471`. Daily event export enabled in US; streaming, separate user-data export, and mobile advertising identifiers off. No billing settings or paid plans changed.
- Saved BigQuery query: https://console.cloud.google.com/bigquery?project=gen-lang-client-0360308471&ws=!1m7!1m6!12m5!1m3!1sgen-lang-client-0360308471!2sus-central1!3s19850c05-a384-40ae-91f7-c8dd3fc6ab95!2e1

## Pending activation

1. Deploy this frontend change. Earlier deployment sent interaction events to Contentsquare; this change additionally sends them to GA4 through GTM.
2. After deployment, verify one GA4 event for each no-card trial boundary described in `TRIAL_SIGNUP_FUNNEL_TRACKING.md`, including each failure branch. Confirm no user-entered values appear in event parameters.
3. Verify actual field-edit and Run-click event delivery in GA4.
4. Wait for the first daily `analytics_519498279.events_YYYYMMDD` export. No dataset was visible at setup completion.
5. Verify the property reporting timezone (query currently uses America/Los_Angeles), then set `first_full_tracking_date` to the first complete verified tracking day. Session and journey metrics remain available before that date; only strict trial attribution waits for verified full-chain coverage.
6. Run the session report after its one-day availability lag. Treat the newest counts as provisional because GA4 can add late-arriving events for up to three days; validate identity coverage, source paths and ordering ties before treating rates as reliable.

The saved query and `analytics-session-reports.sql` cover source-page click counts/rates, page-rate differences, signup dropoff, calculator landing-to-Run, any-edit-without-Run abandonment, next different tracked destination, and Run-before-CTA cohorts, all split by device. They are prepared queries, not a populated or scheduled dashboard yet. No historical field-edit data is manufactured or backfilled. All-fields-complete abandonment is not tracked.

## Verification

- Frontend: all 53 suites and 438 tests passed; TypeScript check and the optimized production build passed.
- BigQuery: corrected reserved function naming and unsupported correlated next-page subquery. Synthetic script completed successfully (23 statements), including six assertions covering landing-only cohorts, edit deduplication, invalid Run clicks, CTA-before-Run, next destination and source attribution. Synthetic fixtures were temporary query data, not production GA4 events.
- Live export schema, actual data coverage, and end-to-end frontend collection remain pending deployment/export.
