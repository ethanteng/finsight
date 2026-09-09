# No-card trial signup funnel tracking

This document defines the production analytics contract for the no-card
`/getstarted` flow. The implementation sends fixed event names to both the GTM
data layer and Contentsquare. GTM must forward the data-layer events to GA4;
the frontend does not call GA4 directly.

## Funnel contract

Use this order in a GA4 funnel exploration, filtering every step to
`signup_flow = free_trial` where the event supplies that parameter:

1. `start_free_click` — a marketing CTA sends the visitor to `/getstarted`.
2. `trial_signup_viewed` — the no-card signup page renders.
3. `trial_signup_started` — the first non-empty edit to email or password in
   that page view. It fires once and carries no field name or value.
4. `trial_signup_submit` — each browser-valid submit attempt, before the
   application validates password requirements or calls `/auth/register`.
5. One of:
   - `trial_signup_validation_error`, with
     `validation_reason = password_requirements`;
   - `trial_signup_registration_error`, with `error_category` from the strict
     allowlist below; or
   - `sign_up`, the existing account-created boundary, with
     `method = email` and `signup_flow = free_trial`.
6. `trial_verify_viewed` — `/verify-email` renders as a confirmed continuation
   of the free-trial flow.
7. `trial_verify_submit` — each verification-code submit attempt.
8. Either `trial_verify_error` with a safe `error_category`, or
   `trial_verify_success` after a successful backend response.
9. `trial_login_viewed` — `/login` renders as the same continuation.
10. `trial_login_submit` — each login attempt.
11. Either `trial_login_error` with a safe `error_category`, or
    `trial_login_success` after authentication, access verification, and local
    session persistence succeed.

`sign_up` keeps its existing semantics and remains the only account-created
event. None of the new submit events should be treated as a registration.

## Attribution and privacy

`/getstarted` stores a versioned `free_trial` marker in sessionStorage for at
most two hours. Registration then routes to
`/verify-email?signup_flow=free_trial`, and successful verification (or “Skip
for now”) routes to `/login?signup_flow=free_trial`. Verification and login are
classified as trial steps only when the fixed URL marker and recent same-tab
state both exist. State is cleared after authenticated login. Ordinary verify
and login visits therefore remain unclassified.

Analytics payloads contain only:

- `event` — one of the fixed names above;
- `source_page` — pathname only, never the query string;
- `signup_flow = free_trial`;
- `validation_reason = password_requirements` on the one validation event;
- `error_category = server_rejected | network_error | unknown` on error
  events; and
- the existing safe CTA/sign-up parameters.

Email addresses, passwords, verification codes, auth tokens, raw server error
text, retirement inputs, and other financial values must never be added. The
typed frontend helpers normalize any unexpected error-category input to
`unknown`. The calculator-to-signup scenario remains in a separately validated
and masked sessionStorage record and is not part of this analytics state.

Page-view and first-edit refs prevent duplicate events from React rerenders.
Submit and outcome events intentionally fire for each attempt. Do not add
unload or beacon events: signup-page bounce is computed as sessions containing
`trial_signup_viewed` with no later `trial_signup_started` or
`trial_signup_submit`.

## GTM configuration

Container: `GTM-PL362L36`. GA4 measurement ID: `G-0QBF34C7VK`.

Production status: GTM version 17, **No-card trial signup funnel**, was
published on September 9, 2026 with the variables, triggers, and tags below.
The rules are inert until the corresponding frontend events are deployed.

Create or reuse Data Layer Variables (Version 2) for:

- `DLV - source_page` → `source_page`
- `DLV - signup_flow` → `signup_flow`
- `DLV - validation_reason` → `validation_reason`
- `DLV - error_category` → `error_category`

Forward each frontend event exactly once. Splitting the tags below prevents a
previous error or validation value from leaking into a later success through
GTM's persistent data model.

### Base funnel tag

- Trigger name: `CE - trial signup funnel boundaries`
- Trigger type: Custom Event, regex enabled
- Event regex:
  `^trial_(signup_(viewed|started|submit)|verify_(viewed|submit|success)|login_(viewed|submit|success))$`
- Tag name: `GA4 - trial signup funnel boundaries`
- Event name: `{{Event}}`
- Event parameters: `source_page`, `signup_flow`

### Error tag

- Trigger name: `CE - trial signup funnel errors`
- Trigger type: Custom Event, regex enabled
- Event regex:
  `^trial_(signup_registration_error|verify_error|login_error)$`
- Tag name: `GA4 - trial signup funnel errors`
- Event name: `{{Event}}`
- Event parameters: `source_page`, `signup_flow`, `error_category`

### Validation tag

- Trigger name: `CE - trial signup validation error`
- Trigger type: Custom Event
- Event name: `trial_signup_validation_error`
- Tag name: `GA4 - trial signup validation error`
- GA4 event name: `{{Event}}`
- Event parameters: `source_page`, `signup_flow`, `validation_reason`

Do not change the existing `start_free_click` or `sign_up` tags, and do not
change any existing Contentsquare override ID. Preview the container and verify
one GA4 tag per data-layer event before publishing any future revision.

GA4 property 519498279 has event-scoped custom dimensions for `signup_flow`,
`source_page`, `error_category`, and `validation_reason`. `signup_flow` was
already present; the other three were registered on September 9, 2026.
Parameter collection does not depend on custom-dimension registration, but GA4
exploration filtering and breakdowns do.

## Recommended GA4 reports

Build a closed funnel in the exact event order above for strict same-path
completion, and an open funnel for diagnosing where visitors re-enter. Report
these separately rather than combining all errors:

- signup start rate: `trial_signup_started / trial_signup_viewed`;
- signup submit rate: `trial_signup_submit / trial_signup_started`;
- client validation rate: sessions with `trial_signup_validation_error` per
  signup-submit session;
- registration failure rate: sessions with
  `trial_signup_registration_error` per signup-submit session;
- account-created rate: `sign_up (signup_flow=free_trial)` per signup-viewed
  session;
- verification attempt and failure rates, using `trial_verify_*` only;
- verification-to-login return rate:
  `trial_login_viewed / trial_verify_success`;
- login failure rate: sessions with `trial_login_error` per login-submit
  session; and
- end-to-end completion: `trial_login_success / trial_signup_viewed`.

Event counts can exceed users or sessions because submit and error events fire
for every attempt. Use session- or user-based funnel steps for conversion rates,
and event counts to diagnose repeated retries. GA4's native funnel can span
sessions depending on exploration settings; use the BigQuery export when an
exact completed-session definition is required.
