# Product quality milestones

This release measures acquisition quality after the calculator signup gate. Existing signup
conversions remain the bidding goal. The new events are observation-only until delivery,
attribution and later retention/payment quality have been validated.

## Definitions (version 1)

Only accounts with a signup-time `UserAcquisition` record participate. Operator accounts in
`ADMIN_EMAILS` and browsers marked internal are excluded. Historical users are not backfilled
or described as having zero engagement. Historical signup sources can nevertheless be
inferred read-only from an initial calculator seed for cohort filtering (see
[cohort source recovery](COHORT_REPORTS.md#acquisition-and-quality)); this never opts an old
account into milestone measurement or dispatches historical conversions. A unique `(userId, kind, definitionVersion)` prevents
multiple tabs, repeated views and provider reconnects from creating another first milestone.

| Kind | Requirement |
| --- | --- |
| `first_result_viewed` | A nonempty calculator-seeded conversation belonging to the authenticated user enters the visible viewport after loading completes. A calculation, handoff click, email, or background tab is insufficient. |
| `first_meaningful_answer` | A user-origin answer enters the visible viewport. Its persisted deterministic validation must pass; replaced placeholders, shipped ungrounded drafts and secondary-review caveats are excluded. Seeds and errors do not qualify. |
| `first_account_linked` | Provider-confirmed account evidence: Plaid returns accounts after token exchange; SnapTrade returns an account with an enabled verified authorization; or an existing Public credential verifies. Opening a connect dialog or registering with SnapTrade is insufficient. |
| `returned_engaged_7d` | After the first meaningful answer, a newly created successful answer is viewed in a later 24-hour period relative to signup, before signup + 7 days. Reopening yesterday's answer does not qualify. |

Successful answer validation is a conservative proxy for value, not a claim that every answer
is useful or correct. The existing engagement heatmap still counts user-origin questions;
the separate quality card counts these stricter viewed-answer milestones.

## Acquisition and privacy

Signup stores the original calculator lead's allowlisted acquisition metadata. Client signup
parameters are used only when there is no resolved lead. Later visits never overwrite it.
Queries/fragments are stripped from landing/referrer paths. Acquisition rows and milestones
cascade on user deletion; provider disconnection does not delete the first-link milestone.

The first-party record retains the real occurrence time and attribution identifiers for
analysis and a possible future consent-aware server import. Conversion dispatch contains only
a public destination, random milestone transaction ID and query-free page context. It does
not include email, user ID, question text, balances or calculator inputs. Existing Google tag
consent controls are retained; no new tag container, consent override or credentials are added.

## Google Ads actions created 2026-10-06

Account 772-829-3480, installed Ask Linc tag `AW-17866479691`. All four actions: **Secondary**,
**One**, **30-day click window**, **$0 fixed value**, no account-default or campaign bidding goal.
They are manual events grouped under the UI's Page view category, not automatic URL/page-load
conversions. Seeing Inactive before the application emits an event is expected.

| Action | Public destination |
| --- | --- |
| Ask Linc \| First result viewed | `AW-17866479691/gd1kCPm8t5MdEMuws8dC` |
| Ask Linc \| First meaningful answer | `AW-17866479691/YFILCPy8t5MdEMuws8dC` |
| Ask Linc \| First account linked | `AW-17866479691/rJnvCP-8t5MdEMuws8dC` |
| Ask Linc \| Returned engaged in 7 days | `AW-17866479691/6Y2hCIK9t5MdEMuws8dC` |

Destinations are public constants in `frontend/src/lib/product-milestones.ts`, so deployment
needs no new secret or environment setting. Optional `NEXT_PUBLIC_ADS_FIRST_RESULT_VIEWED`,
`NEXT_PUBLIC_ADS_FIRST_MEANINGFUL_ANSWER`, `NEXT_PUBLIC_ADS_FIRST_ACCOUNT_LINKED`, and
`NEXT_PUBLIC_ADS_RETURNED_ENGAGED_7D` override them; an explicitly empty value disables that
action. Dispatch is restricted to the existing production analytics host allowlist.

## Delivery and limits

The browser requests recent unattempted milestones for authenticated paid-acquired users,
then queues the conversion on the existing Google tag. Each attempt uses the same transaction
ID. A tag callback sets `adDispatchAttemptedAt`; that means an attempt, not Google acceptance
or attributed conversion. Reload/focus/online and a short poll recover interrupted requests.

This is a browser-tag implementation, not a server/offline import. It still depends on tag
availability, consent and Google's browser click matching. Google reports dispatch time;
first-party reports use occurrence time. The browser bridge only sends milestones less than
24 hours old to avoid replaying stale events as new. Blocked/missed events remain first-party
records. Do not equate “dispatch attempted” with “matched in Ads,” or claim stored click IDs
are already used in an offline upload. A later server import should use Google's current
Data Manager path and separate validation; do not run a second import against the same
milestone without deliberate deduplication.

## Rollout and validation

1. Apply `20261006170000_product_milestones` before deploying backend/frontend. The existing
   guarded main-branch workflow already runs migrations before both deployments. No historical
   rows are modified or backfilled. A frontend that arrives before the backend fails quietly.
2. Keep Coast FIRE at $20/day, Maximize Conversions, signup primary. Do not add these secondary
   actions to a custom bidding goal: custom goals can make secondary actions bid-eligible.
3. Check a new instrumented signup through both calculator flows: original campaign preserved;
   result-view milestone only once after visible app delivery; typed successful follow-up
   creates the answer milestone; repeated views do not add rows. Validate provider links with
   actual provider confirmations and confirm disconnects retain the first-link record.
4. Use `/admin` filters: signup source Coast FIRE calculator, channel Google Ads, campaign
   `coast_fire`. Check measured coverage, quality counts and mature seven-day denominators.
5. In Google Ads segment **All conversions** by conversion action. Check recent diagnostics,
   duplicates, click matching and lag against first-party records before changing bidding.
   Do not deliberately fabricate clicks or conversions to populate production reports.
6. A live attributed-conversion check requires real eligible post-release traffic and Google
   reporting time. Local tests/builds cannot certify that Google received or attributed it.

Existing Stripe first-positive-payment cohort logic and purchase emission are unchanged.
The inspected Google Ads purchase actions were already Removed; this release does not restore
old purchase imports or create another one. Paid quality remains available in first-party
cohorts while that separate Ads setup is reviewed.
