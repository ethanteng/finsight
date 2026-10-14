# Visitor cohorts

The **Visitors** tab in `/admin` groups people who came to the site signed out by the day,
week or month of their first visit, and shows what they did before signing up or signing
in: Coast FIRE runs, retirement calculator runs, cash flow check clicks, and Buy Me a Coffee
opens.

Served by `GET /admin/cohorts/visitors` (`src/routes/admin-cohorts.ts`), computed in
`src/cohort-analytics/visitors.ts` from the GA4 BigQuery export
(`src/marketing-analytics/adapters/ga4-visitors.ts`). It uses the same service account and
dataset settings as `/admin/marketing`: `GA4_BIGQUERY_SERVICE_ACCOUNT_JSON`,
`GA4_BIGQUERY_PROJECT_ID`, `GA4_BIGQUERY_DATASET_ID`, `GA4_BIGQUERY_LOCATION`, and
`GA4_REPORTING_LAG_DAYS`.

## How fresh it is

GA4 cannot export on demand. It writes a daily table once a day, typically mid-afternoon in
the property's time zone, and, with **streaming export** on, a same-day `events_intraday_`
table within minutes of each event, which it deletes once that day's daily table lands.

Each report first lists the export dataset's tables (metadata, nothing billed). It reads the
daily tables through the newest one, and the streaming tables only for the days after it, so
no day is read twice. With streaming tables present, the data ends at the newest streamed
event, found with a query over their timestamp column alone, and **Refresh** brings in
everything streamed since: the header reads "GA4 streaming export · as of" that time.
Without them, the data ends at midnight UTC after the newest daily table, and the header
reads "GA4 daily export · not live".

Streamed days are provisional until the daily table replaces them. Late or failed events can
be missing, and streaming leaves out traffic sources for new users and new sessions, so a new
visitor's channel and campaign can read as Direct until then; UTM tags on the landing URL still
come through.

To turn streaming on: GA4 Admin → Product links → BigQuery links → the link → tick
**Streaming** beside Daily. It needs billing on the Google Cloud project (the BigQuery
sandbox gets no streaming tables) and costs $0.05 per GB, about 600,000 events.

If the service account cannot list the dataset's tables, the report falls back to the daily
export through today less `GA4_REPORTING_LAG_DAYS`, reads nothing streamed, and says so in its
footer. BigQuery Data Viewer or Metadata Viewer on the dataset lets it list them.

## Who is a visitor

GA4 is the only record of someone who has not signed up; the first-party tables keep no
visitor or session identifier. A visitor is GA4's `user_pseudo_id`: one browser's analytics
cookie, not a person. Safari keeps that cookie for 7 days, and phones, private windows and ad
blockers start new ones, so returns after the first week are a floor.

- **Cohort:** the browser's first session, bucketed on UTC dates like the account tabs.
  A browser whose first session in the window is not its first ever (`ga_session_number` above
  1) visited before the oldest cohort shown, so it is left out and counted.
- **Until it becomes an account's:** activity counts until the browser's first `sign_up`,
  `trial_login_success`, or `/app` page view. Sessions that start later are left out, and
  actions inside the session that crossed it count only before it. Account activity is in
  Engagement and Activation.
- **Outcome:** *Signed up* when `sign_up` came first. *Signed in* when the browser reached the
  app without signing up in it: an existing account. Signups stay in their cohort; dropping
  them would remove each cohort's best visitors.
- **Left out:** operator browsers (below), and sessions the marketing pages also exclude:
  automation, GA4 internal or debug traffic, and hosts outside `GA4_ALLOWED_HOSTNAMES`.

## What counts

| Column | GA4 event |
|---|---|
| Coast FIRE | `coast_fire_calculated` with `calculation_trigger=submitted` — not the example shown on arrival |
| Retirement | `retirement_model_run` |
| Cash flow check | `cash_flow_check_click`, or GA4's automatic outbound `click` to `trycoast.me` on `/cash-flow-forecast` from before that event existed; per session the larger count, so one click is not counted twice |
| Coffee | `bmc_widget_opened`: the Buy Me a Coffee panel opened from its button. Whether anyone paid happens inside Buy Me a Coffee's frame and is only in its dashboard |

Activity is dated by the session it happened in.

## Reading it

- **What they did:** the share of each cohort that did each at least once, to date, with the
  number of visitors. *Came back* is a second session. Newer cohorts have had less time. The
  bar under each share compares cohorts within that column only; the shares run from about 1%
  to 40%, so one scale across columns would hide the small ones.
- **When they came back:** the same grid as Engagement, for the action picked above it. A cell
  is the share of the cohort that did it in that period after their own first visit; *Signed
  up* is cumulative, like Activation; *Visited* is any session, so its first column is always
  everyone. Only periods that have ended count, by where the data ends (above).
- **A cohort's visitors:** click a cohort. Up to 1,000 per cohort, signups first and then the
  most active, loaded on their own request. Click a visitor for each session.
- **Filters** read each visitor's first session: the page it landed on, its channel (as the
  marketing pages group GA4 sources), its exact `utm_campaign`, and its device.

## Limits

- Daily tables can still receive late events for up to 3 days, and streamed days are
  provisional (above).
- More than 100,000 browsers in one window shows nothing rather than an undercount: show fewer
  cohorts or a shorter grain.
- A scan reads every event from the oldest cohort's start. Each scan is kept for 10 minutes, so
  changing filters reuses it; **Refresh** reads again. A scan not read yet (another cohort
  grain or count) lists the tables again first, because GA4 swaps a day's streaming table for
  its daily one without notice.

## GTM setup

Each of these needs a Custom Event trigger and a GA4 Event tag in GTM (container
GTM-PL362L36), or it never reaches GA4:

- `cash_flow_check_click`, forwarding `source_page`, `content_type` and `cta_location`.
  Without it, the column relies on GA4 enhanced measurement's outbound clicks, when that is on.
- `bmc_widget_opened`, forwarding `source_page` and `content_type`. Without it, Coffee stays at
  zero.
- `internal_browser_marked`, no parameters. Without it, an operator's browser is still left
  out once it opens `/admin`, but not when it has only signed in.

None of them can be backfilled; each counts from the day its tag is live.

## Your own browser

An operator's browser leaves itself out of analytics, as TryCoast's report sign-in does. It is
marked once it proves to be an operator's:

- signing in with an `ADMIN_EMAILS` account (`/auth/login` returns `operator: true`);
- opening `/app` while signed in as one (`/auth/verify` returns the same); or
- `/admin` loading its data.

From then on GTM, Contentsquare, Vercel Analytics, dataLayer pushes and product-milestone
reports stay off in that browser; tags already running stop at the next page load. Just before
going quiet it sends `internal_browser_marked` once, and this tab drops every browser that sent
it or opened `/admin`, including what it did before the mark.

The mark lives in the browser's local storage (`frontend/src/lib/internal-analytics.ts`), so
it is per browser and device; a private window or cleared site data loses it until the next
sign-in. The Visitors tab has a switch to count the browser again, to check tags from it with
GTM's preview, and to leave it out again. Counting again does not bring it back into this
report: GA4 already knows it as an operator's, and while it is counted the GTM loader sends
`internal_browser_marked` on every page load, so a new GA cookie (Safari's expire after 7
days) is known as an operator's too.

GA4's own reports, and the hidden `/admin/marketing` pages, still include an operator's
sessions from before the mark; the marketing pages leave out only sessions that opened
`/admin`.
