# Coast FIRE results email

> The retirement calculator has the same feature, built on the same shared
> pieces. See `docs/RETIREMENT_RESULTS_EMAIL.md`; everything about tokens,
> handover, and what must not fail the visitor applies identically there.

The `/coast-fire-calculator` page is the acquisition wedge for the Coast FIRE
beachhead experiment. It answers the free question — "have I reached Coast
FIRE?" — in the browser, with no account and no email. This document covers the
two steps past that: the plain-language reading printed under the number, and
turning an anonymous calculator visitor into a known prospect by emailing them
their own result — which now offers them an account rather than just an inbox
copy.

## The flow

1. A visitor submits the seven inputs. The number is calculated and rendered in
   the browser, as before.
2. An email capture appears under the result card. It appears only after a
   submitted run: the page opens with a default scenario already answered, and
   collecting an address against figures nobody entered would email someone a
   stranger's retirement.
3. `POST /api/coast-fire/email-results` receives the seven inputs and an email
   address. It recomputes the result server-side, stores a `CoastFireLead` row
   with a random token, and sends the message through Resend.
4. After the response, the address is added to MailerLite, in the Coast FIRE
   group.
5. The email's call to action — "Finish creating your account" — links to
   `/coast-fire/continue?ref=<token>`.
6. That route handler runs server-side, moves the token into a short-lived
   first-party cookie scoped to `/getstarted`, and redirects to a clean
   `/getstarted?source=coast-fire-calculator`.
7. `/getstarted` reads the cookie, exchanges it through
   `GET /api/coast-fire/signup-context/:token`, clears the cookie, and renders
   the Coast FIRE variant of the signup page: its own copy, the Coast FIRE
   number the email stated, what they have saved, and their retirement age,
   with their email prefilled.

8. Registering with that token in hand skips the emailed verification code,
   opens `/app` on the session registration returns rather than sending them to
   the sign-in form, and writes the run as the account's first decision. See
   **Saving a run to an account** below.

The page's own "Stress-test my Coast FIRE plan" button reaches the same
tailored page through sessionStorage rather than a token, so both entry points
continue the same decision.

## The reading under the number

Submitting a scenario also posts the same seven inputs to
`POST /api/coast-fire/interpretation`, which re-runs the formula server-side and
asks a model to say what the figures mean. The division is the one
`docs/SCENARIO_MODELING.md` draws for the authenticated product: the formula
produces every number, the model only describes them.

`src/services/coast-fire-interpretation.ts` builds a fact block — every figure
this run produced, plus a handful of published rates from named series — and
`src/services/calculator-interpretation.ts` checks the draft against it. Any
number that is not one of those facts, at the precision the draft wrote it to,
rejects the draft; it is sent back once naming the offending tokens, and then
dropped. A dropped reading renders as nothing at all, which is why the endpoint
answers `204` rather than an error.

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

The capture asks "Save these results to your free account", and the email links
into signup with the address prefilled. Two things happen when someone
registers with that token:

- **The verification code is skipped.** A lead token is 48 random characters
  that only ever left this system inside a message to the lead's own address, so
  presenting one *and* registering that address demonstrates exactly what the
  code demonstrates. `resolveCalculatorLead` is resolved on the server, before
  the account exists, from the token alone — a client cannot declare itself
  verified — and the addresses must match. Every other registration still
  verifies by code.
- **The run becomes the account's first decision.** `buildCoastFireQuestion`
  states the scenario back in the first person; `buildCoastFireAnswer` states
  the verdict from the *stored* figures, never a fresh run, for the same reason
  the signup context does.
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

The figures are also *stored*, and an emailed scenario shows the stored copy
rather than recomputing. The token lives for 90 days; if the formula changed
inside that window, a recomputed headline would disagree with the message still
sitting in the recipient's inbox. A same-tab click-through has nothing stored
and nothing that could have drifted, so it derives from the seven inputs.

`src/services/coast-fire.ts` is a deliberate second copy of
`frontend/src/lib/coast-fire.ts` — the two are separate TypeScript projects and
cannot import each other. Both suites pin the same worked example
(`$369,128` from the default scenario), so a change to one formula fails the
other side's tests.

## Both parts of the message

Every send includes an HTML part and a plain-text part with the same content:
the status, the number, the funded ratio, the retirement target, the
no-contribution projection, the return-sensitivity comparison, what was
entered, and the limitations. A text-first client shows the results, not a
"view this in a browser" stub.

The HTML uses the shared email shell in `src/email/templates.ts`, so the
message carries the same deep green, lime, and cream as the rest of Ask Linc's
mail, and the result card mirrors the one on the page.

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

## Recalculating after sending

The capture form is keyed on the submitted scenario, so changing the inputs and
recalculating remounts it. Without that, a visitor who emailed one scenario and
then recalculated would see the new result claiming its figures had been sent,
and a response still in flight for the old scenario could confirm the new one.

## What must not fail the visitor

The visitor asked for their results. Neither the lead row nor the mailing list
is allowed to stand between them and that:

- A failed database write costs personalization only. The email still sends,
  with its CTA pointing at plain `/getstarted`.
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
