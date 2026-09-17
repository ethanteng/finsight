# No-card signup tracking after PRs 252–259

## What is measured

The main same-session funnel is:

1. `trial_signup_viewed`
2. `trial_signup_started`
3. `trial_signup_submit`
4. `sign_up`, with `signup_flow = free_trial`: the server created an account.
5. `trial_signup_completed`: the authenticated signup is ready to hand off to `/app`.

A handoff is **not** proof that the app loaded, the user asked a question, or the email is verified.
`start_free_click` is an optional preceding step for CTA-specific conversion rates.
Direct visits and emailed calculator links must not require a CTA.
No current signup path requires another login.

The terminal event includes one fixed `completion_method`:

| Value | Evidence |
| --- | --- |
| `email_link` | Registration server confirmed the calculator email-link signup is already verified. |
| `verification_code` | Verification endpoint returned success. |
| `verification_skipped` | Visitor chose Skip for now. This is **not** a verified email. |
| `already_verified` | Profile endpoint confirmed a stale verification-page arrival is already verified; original method unknown. |

The existing `trial_verify_viewed/submit/success/error/skipped` events remain diagnostic branches,
not mandatory steps. Old `trial_login_*` events remain historical; they are not a new conversion.

## Attribution and payloads

Events are emitted before clearing the two-hour same-tab signup marker.
A verification continuation still requires both that marker and `signup_flow=free_trial` in the URL.
Ordinary login/verification traffic does not belong to the signup funnel.

Boundary events carry `source_page` (pathname only), `signup_flow=free_trial`,
`signup_flow_version=2`, `signup_origin`, and `signup_entry`.
Origins are `retirement_calculator`, `coast_fire_calculator`, or `getstarted`;
entries are `results_email`, `results_page`, `calculator_cta`, or `direct`.
PR #264's direct results-page continuation is documented in
`CALCULATOR_RESULTS_PAGE_TRACKING.md`; it is not an email CTA open.
Unknown historic attribution remains unknown.
Errors use `server_rejected | network_error | unknown`;
client validation uses `password_requirements`.

Do not send email addresses, credentials, codes, lead/auth tokens, financial inputs,
or raw server errors. Contentsquare receives fixed event names only, including the
new `trial_signup_completed`; all existing override IDs remain intact.

## GTM and GA4 contract

Container `GTM-PL362L36`; measurement `G-0QBF34C7VK`; GA4 property `519498279`.

Live configuration: GTM version **24**, “Signup v2: direct app handoff and
verification branches,” published September 16, 2026 at 11:53 PM Pacific.
Only the boundary trigger/tag and the two new data-layer variables changed.
Application deployment and end-to-end event delivery are still separate rollout checks.

Update existing `CE - trial signup funnel boundaries` (do not add a duplicate trigger/tag):

```text
^trial_(signup_(viewed|started|submit|completed)|verify_(viewed|submit|success|skipped)|login_(viewed|submit|success))$
```

Keep `GA4 - trial signup funnel boundaries` using event name `{{Event}}`.
Forward `source_page`, `signup_flow`, `signup_origin`, `signup_entry`,
`completion_method`, and `signup_flow_version` from matching Version-2 Data Layer Variables.
`completion_method` is meaningful only on `trial_signup_completed`; GTM's persistent
data model may retain it on later diagnostic events.

Keep error and validation tags separate. Keep GA4's existing `sign_up` tag.
GTM v25 scopes the existing Google Ads account-created conversion to `sign_up`
with `signup_flow=free_trial`; keep that conversion primary. Do not mark the new handoff
event as another Ads primary conversion or sum it with sign_up.

Register event-scoped GA4 custom dimensions for `completion_method` and
`signup_flow_version` (existing origin/entry dimensions are reused). Native
explorations use the five main steps above, with Device category breakdown
and signup-origin/entry comparisons; optional verification belongs in a
separate diagnostic tab. BigQuery parameters do not require custom dimensions.

Configuration verified: “Signup completion method” and “Signup flow version”
were created as event-scoped custom dimensions on September 16, 2026 Pacific.
Existing signup origin/entry definitions were retained.

The existing saved exploration “Signup & calculator — device funnels (users)”
still correctly measures page view → account creation and keeps its Device
category breakdown. Its signup tab is now named “Signup page → account created”
to avoid implying verification or app entry. It is a native user funnel, not
the exact session report supplied by the backend.

## Reporting and rollout

- `/admin/marketing`: signup paths by device and entry, with created accounts,
  handoffs and separate verification outcomes. Calculator CTA journeys still
  require result → relevant CTA → signup in order.
- Email-path handoffs use terminal-event attribution, including email opens in
  later sessions. They are outcomes observed in the window, not a closed
  cohort conversion rate from emails sent in the same window.
- Distinct sessions use GA4 user_pseudo_id + ga_session_id, not event sums.
  A skip plus the terminal event counts once. Legacy login success is accepted
  as observed historical completion; legacy verification alone is not.
- First-party lead/account email matches are associations, not proof of link use.
  Both admin pages show verified matched accounts and automatically saved results.
- Auto-created calculator conversations have an explicit origin and do not
  count as “Asked a planning question.” The additive migration recognizes old
  generated results by their deterministic question/answer signatures.
  User follow-ups still count as user questions.
- Retirement run success remains the deterministic model response; the optional
  interpretation request does not create another run. Coast FIRE only counts
  submitted results, not an empty initial form. Repeat-run reporting is unchanged.

Apply the Prisma migration before the new backend. Deploy frontend + backend
and publish GTM. Test both calculators' email links (including changed-address
fallback), ordinary /getstarted code verification, Skip, rejection/retry,
and the already-verified bounce. Verify one account-created event and one handoff,
correct method/origin/entry, and no mandatory login.

Only after observing the events in GA4 and a complete exported reporting day,
set backend `GA4_SIGNUP_HANDOFF_TRACKING_DATE=YYYY-MM-DD` to the first fully covered
America/Los_Angeles calendar day. Keep `GA4_FIRST_FULL_TRACKING_DATE` for earlier
signup instrumentation. A window must be covered by both dates for new funnel
rates. Until then counts are observed lower bounds and rates remain unavailable.
Never substitute the PR merge date or GTM publish date for verified coverage.
Events lost between the flow change and analytics deployment cannot be recovered.

The backend query is the maintained session report. The older
`docs/analytics-session-reports.sql` still measures /getstarted → account creation;
that boundary remains valid and must not be relabeled as verified signup or app entry.
