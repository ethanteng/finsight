# Coast FIRE results email

> The retirement calculator has the same feature, built on the same shared
> pieces. See `docs/RETIREMENT_RESULTS_EMAIL.md`; everything about tokens,
> handover, and what must not fail the visitor applies identically there.

The `/coast-fire-calculator` page is the acquisition wedge for the Coast FIRE
beachhead experiment. It computes the free question — "have I reached Coast
FIRE?" — in the browser, but answers it in Ask Linc: the visitor gives an
email address, chooses a password, and sees the result as their account's first
decision. See **The answer opens in Ask Linc**. The goal is that more people
experience the value inside the product, not in a calculator outside it. This
document covers that hand-off, the email that brings back anyone who leaves
before the password, and the plain-language reading the page still shows on
the rare run it cannot hand off.

## The flow

1. A visitor submits the seven inputs. The number is calculated in the browser
   but not rendered: a locked card stands in for it.
2. The email capture appears beside the locked card. It appears only after a
   submitted run: the page opens with empty personal figures and no result, so
   there is nothing to save until the visitor asks for an answer — and
   collecting an address against figures nobody entered would attach their
   address to our assumptions, not theirs.
3. `POST /api/coast-fire/email-results` receives the seven inputs and an email
   address. It recomputes the result server-side, stores a `CoastFireLead` row
   with a random token, and sends the "result ready" email through Resend. That
   email states no figures; see **The email**.
4. It then stamps `tokenDisclosedAt` on that row and returns the token as
   `ref`. The page writes the `/getstarted`-scoped cookie the emailed route
   would have written, stores the run in sessionStorage beside it, and
   navigates to `/getstarted?source=coast-fire-calculator&entry=results_page`.
   If no `ref` comes back, the page shows the result itself instead; see
   **When there is no run to hand off**.
5. After the response, the address is added to MailerLite, in the Coast FIRE
   group.
6. `/getstarted` renders the Coast FIRE variant of the signup page with the
   email prefilled: "Choose a password to see it", what they saved, their
   retirement age and spending — and no result. Arriving straight from the
   page skips the token exchange, because the stored context already carries
   the same token, and is reported as `calculator_results_page_cta_opened`.
7. Registering with that token writes the run as the account's first decision,
   skips the verification code, skips the sign-in form, and opens `/app` on the
   session registration returns. `/app` waits for the decision and opens it.
   See **Saving a run to an account**.
8. The email's call to action, "See my result in Ask Linc", links to
   `/coast-fire/continue?ref=<token>`. This is what someone who left the signup
   page comes back to, and the only route for a visitor whose browser refused
   the cookie. That route handler moves the token into a short-lived
   first-party cookie scoped to `/getstarted` and redirects to a clean
   `/getstarted?source=coast-fire-calculator`, which exchanges it through
   `GET /api/coast-fire/signup-context/:token` and continues from step 6.

The page's own "Stress-test my Coast FIRE plan" button carries no run while
the result is held back. It reaches signup like any other no-card visitor.

## The answer opens in Ask Linc

Neither calculator shows its answer. A submitted run renders
`CalculatorLockedResult` in place of the result card: an illustrative card,
blurred, with fixed figures that are never the visitor's own, and "Your result
is ready" on top. The capture beside it asks for an email address, and its
button reads "See my result in Ask Linc".

Nothing that restates the answer runs on the page: not the figures, not the
model reading (`/interpretation` is not called, which also saves a model call
per anonymous run), not the return comparison or the retirement charts, and
not the page's own signup CTA. The signup page states no result either. The
first place the visitor sees their answer is the first decision in their
account.

Every run is held back, including a second run in the same tab: there is no
tab-wide unlock. `lib/calculator-email-memory.ts` remembers the address in
session storage so a later form on either calculator is prefilled.

**It is a nudge, not a control**, like the run limit. The Coast FIRE formula
runs in the browser, and the retirement model's response reaches the browser
before the page hides it. Anyone who opens devtools can read the answer. What
the page guarantees is only that its rendered content does not contain it.

A retirement `rates` answer is not held back. It has no run to save, because
the email endpoint refuses a run with no portfolio or spending level. It says
nothing about the visitor's own plan, and its job is to ask for the two
numbers that produce a plan result, which is held back.

### When there is no run to hand off

The endpoint returns no `ref` when the lead row did not store, or when the
disclosure stamp did not. There is then no run for registration to seed, and
sending the visitor to signup would open an empty workspace under a page that
promised their result. So the page shows the result itself, with a line saying
it could not set up the account link, and the reading under it as before.

The capture is keyed on each run rather than on its inputs, so an identical
re-run is held back again rather than inheriting the previous run's revealed
state. A send still in flight when the visitor re-runs is ignored when it
returns.

## Three runs, then the save

The Calculate button locks after three completed runs, and a line under it
points at the capture instead. Shared with `/retirement-calculator` through
`lib/calculator-run-limit.ts`, including the `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT`
setting that moves the number; the reasoning, and why it is a nudge rather than
a control, is in `docs/RETIREMENT_QUICKPLAN.md`.

## The reading under the number

On the rare run the page shows itself (see **When there is no run to hand
off**), it also posts the same seven inputs to
`POST /api/coast-fire/interpretation`, which re-runs the formula server-side and
asks a model to say what the figures mean. The division is the one
`docs/SCENARIO_MODELING.md` draws for the authenticated product: the formula
produces every number, the model only describes them.

`src/services/coast-fire-interpretation.ts` builds a fact block — every figure
this run produced, plus a handful of published rates from named series — and
`src/services/calculator-interpretation.ts` checks the draft against it. That
check now only reports: a number that is not one of those facts, at the
precision the draft wrote it to, is logged as `shipped with unverified figures`
and the reading is shown anyway. The prompt is the only thing asking the model
to stay inside the block. See "Why nothing is withheld" in
`docs/RETIREMENT_QUICKPLAN.md`, which both pages share.

A reading is still dropped when the model returns nothing usable — a provider
error, a stall, or a response that never parses. That renders as nothing at
all, which is why the endpoint answers `204` rather than an error.

Three things are specific to this page rather than inherited from the quick
plan:

- **"Reached" is not permission to stop saving.** A green badge reads as one,
  and the prompt forbids prescribing anything — stopping contributions,
  changing jobs, spending more — in either direction.
- **There is no probability here.** The quick plan tests a plan against
  hundreds of real historical stretches and can report how many lasted. This
  compounds one assumed return for a fixed number of years. The prompt forbids
  "chance", "likely", and "on track to".
- **The return and the withdrawal rate are the visitor's assumptions**, not our
  estimates, and the fact labels say so.

The rate labels are stored without digits (`thirty-year Treasury yield`, not
`30-year`) and the as-of date is given to the month. Everything a fact shows the
model is a number the model may then write, so a label reading "30-year" would
license a bare `30` — and a draft could then state a horizon this scenario never
ran.

This is the one part of the page that is not computed in the browser. The form's
note and the "is it free?" FAQ entry both say so: the number appears with no
network round trip, and the reading beneath it sends the seven inputs and
nothing else.

## Saving a run to an account

The capture takes the visitor to signup with their address prefilled, and the
email links back to the same place. Three things happen when someone registers
with that token:

- **The verification code is skipped, for any resolved lead.** A code between
  the password and the answer is where the visitor leaves, and the calculators
  exist to get them in front of that answer in Ask Linc. `/auth/register`
  creates no code row and sends no code mail, and reports
  `firstDecisionPending: true` so the client opens `/app` rather than
  `/verify-email`.

  This is a choice about friction, not about proof, and the account records the
  difference. A token that only ever left this system inside a message to the
  lead's own address demonstrates control of that inbox, so such a signup is
  stored with `emailVerified: true`. The token handed back to the page in step
  4 demonstrates nothing — anyone can type somebody else's address into the
  calculator — so the row is stamped `tokenDisclosedAt` before the token is
  returned, and a signup with a stamped lead is stored with `emailVerified:
  false`. Nothing server-side gates on `emailVerified`, and the verify page has
  always offered "Skip for now", so the code was never what guarded the
  workspace. The owner of an address someone else registered can take the
  account back by resetting the password from their own inbox.

  `resolveCalculatorLead` is resolved on the server, before the account exists,
  from the token alone — a client cannot declare itself verified or skip the
  code by sending a flag — and the addresses must match.
- **The run becomes the account's first decision.** `buildCoastFireQuestion`
  states the scenario back in the first person; `buildCoastFireAnswer` states
  the verdict from the *stored* figures, never a fresh run, for the same reason
  the signup context does. `/app` waits for that write (see
  `lib/pending-first-decision.ts`) rather than rendering an empty workspace.
- **The sign-in form is skipped with it.** `/auth/register` already returns a
  usable session, so re-collecting the password set one field earlier proves
  nothing. `/app` re-verifies the token and the subscription on mount, so the
  check still happens — just not as a form.

Both calculators mint tokens from the same 48-character space, so the token
itself says which table holds it: `resolveCalculatorLead` tries the retirement
leads and then the Coast FIRE leads. The client is never asked which calculator
it came from. Seeding runs after the response and unawaited, and returns a
reason rather than throwing — it may never fail a registration.

See `docs/RETIREMENT_QUICKPLAN.md` for the deploy-ordering constraint this
creates: **the frontend must ship first, or with the backend, never after.**

## Why a token, and why it is not in the URL either

The link could carry the figures directly. It does not, for the same reason the
retirement calculator's handoff does not: page URLs are collected by analytics,
kept in browser history, and sent in referrer headers, so a dollar amount in one
leaks well past the person it belongs to. The token is 24 random bytes, is not
derived from the address or the figures, expires after 90 days, and resolves to
a response marked `no-store`. An unknown token and an expired one get the same
bare 404, so the endpoint cannot be used to test whether a token was ever real.

The token itself gets the same treatment, because it is a bearer credential for
that scenario and that address. Google Tag Manager loads in `<head>` on every
page and a GA4 pageview records the full URL, so a token sitting in the address
of a rendered page would be handed to analytics and to every other tag in the
container. `/coast-fire/continue` therefore does the handover before any page
exists: it reads the token server-side, sets it as a cookie that lives ten
minutes and is only sent on `/getstarted`, and redirects to an address with no
token in it. The signup page spends the cookie and deletes it. A blocked cookie
costs the personalization, not the signup.

The token does still appear in first-party server logs for that one redirect.
That is the trade: our own logs rather than a third-party tag manager.

## Why the figures are recomputed

The request body carries the seven inputs and nothing else; the result is
calculated on the server before the email is built. An email carries Ask Linc
branding into someone's inbox, so every figure in it has to be one we produced.
A `coastFireNumber` posted by a caller is ignored.

The figures are also *stored*, and the first decision is written from the
stored copy rather than a fresh run. The token lives for 90 days; if the
formula changed inside that window, a recomputed answer could disagree with
the one the lead was created with.

`src/services/coast-fire.ts` is a deliberate second copy of
`frontend/src/lib/coast-fire.ts` — the two are separate TypeScript projects and
cannot import each other. Both suites pin the same worked example
(`$369,128` from the default scenario), so a change to one formula fails the
other side's tests.

## The email

The ordinary message is `email/calculator-ready.ts`, shared by both
calculators: "Your Coast FIRE result is ready in Ask Linc", the link back into
signup, and what the visitor entered. It states no verdict and no figure the
calculator produced. Mailing the answer would let the inbox stand in for the
account, and the account is the point. It is sent only when the lead stored,
because only then does its link resolve to a run an account can be seeded from.

When the lead did not store, the route sends the full results email
(`email/coast-fire-results.ts`) instead: there is no account-side copy to
point at, and the page shows the result in that case too.

Every send includes an HTML part and a plain-text part with the same content,
so a text-first client shows the message rather than a "view this in a
browser" stub. The HTML uses the shared email shell in `src/email/templates.ts`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `MAILER_LITE_API_KEY` | — | Shared with the nightly user sync. Unset means the list step is skipped; the email still sends. |
| `MAILER_LITE_COAST_FIRE_GROUP_ID` | — | The Coast FIRE group. Unset means the address reaches the subscriber list without a group. |
| `COAST_FIRE_EMAIL_RATE_LIMIT` | 5 | Sends per caller per minute. Far below the quick plan's 20: every accepted request puts mail in an address the caller chose. |
| `COAST_FIRE_CONTEXT_RATE_LIMIT` | 30 | Token lookups per caller per minute, on its own window so a send does not spend it. |
| `COAST_FIRE_INTERPRETATION_RATE_LIMIT` | 8 | Readings per caller per minute, on its own window. Every request past the cache is a model call we pay for on a page with no account behind it. |
| `CALCULATOR_NARRATIVE_MODEL` | Haiku 4.5 | Shared with the retirement reading. See `src/openai/model-config.ts`. |
| `COAST_FIRE_TRUSTED_PROXIES` | 1 | How many proxies sit in front of this process. See `routes/fixed-window-rate-limit.ts`. |
| `RESEND_API_KEY` | — | Unset means no mail is sent and the endpoint reports success, matching the rest of the auth email path in development. |
| `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT` | 3 | Runs before the Calculate button locks, shared with the retirement calculator. **Frontend, so it is inlined at build time** — changing it needs a rebuild and redeploy, not a restart. Anything but a positive integer — unset, empty, `0`, `-1`, `2.5` — falls back to 3. There is no value meaning "no limit"; turning the nudge off belongs in code (or a very large number, which will read oddly in the lock copy). |

## Recalculating after sending

The capture form is keyed on each run, so recalculating remounts it. Without
that, a visitor who saw one run's result and then recalculated would see the
new run claiming its result was already shown, and a response still in flight
for the old run could act on the new one. The capture also ignores a send that
returns after it has been unmounted.

## What must not fail the visitor

The visitor asked for their result. Neither the lead row nor the mailing list
is allowed to stand between them and that:

- A failed database write means no run to hand off. The full results email
  still sends, with its CTA pointing at plain `/getstarted`, and the page shows
  the result.
- MailerLite runs after the response and its outcome is recorded, never
  surfaced. A rejected address does not turn a delivered email into an error.
- A failed *send* is the one case that returns an error (502), because there
  the thing that was asked for did not happen.

## Analytics

`coast_fire_results_emailed` is pushed to the dataLayer on a successful send,
carrying `coast_fire_status`, `source_page`, and `content_type` — never the
address. GTM needs a Custom Event trigger and a GA4 Event tag for it, and it
should be marked a key event in GA4 Admin: it is the first point in this funnel
where an anonymous visitor becomes a known prospect, which is what the
experiment is trying to measure.

When the CTA in that email successfully restores the stored scenario,
`calculator_results_email_cta_opened` is pushed with only fixed dimensions:
`calculator_type=coast_fire`, `signup_origin=coast_fire_calculator`, and
`signup_entry=results_email`. The same two attribution fields are retained in
sessionStorage and appended to every later no-card signup event. The backend
also writes the lead's first successful token exchange to `continuedAt`, so the
admin dashboards have a live first-party count even while GA4's daily export
is settling.
