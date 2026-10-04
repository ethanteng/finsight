# Coast FIRE results email

> The retirement calculator has the same feature, built on the same shared
> pieces. See `docs/RETIREMENT_RESULTS_EMAIL.md`; everything about tokens,
> handover, and what must not fail the visitor applies identically there.

The `/coast-fire-calculator` page is the acquisition wedge for the Coast FIRE
beachhead experiment. It computes the free question — "have I reached Coast
FIRE?" — in the browser, but answers it in Ask Linc: the visitor gives an
email address, chooses a password, and sees the result as their account's first
decision. See **The answer opens in Ask Linc**. The goal is that more people
experience the value inside the product, not in a calculator outside it. The
page never shows the answer itself, in any case. This document covers that
hand-off, the sign-in path for an address that already has an account, and
the email that brings back anyone who leaves before the password.

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
   `ref`. The page stores the run in sessionStorage and takes it to one of
   three places (see **Where the run goes**): `/app` for a visitor already
   signed in, sign-in for an address that already has an account, and
   otherwise `/getstarted?source=coast-fire-calculator&entry=results_page`,
   writing the `/getstarted`-scoped cookie the emailed route would have
   written. If the lead could not be stored, the endpoint answers 503 and the
   form asks the visitor to try again.
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

Neither calculator shows its answer, in any case. A submitted run renders
`CalculatorLockedResult` in place of the result card: an illustrative card,
blurred, with fixed figures that are never the visitor's own, and "Your result
is ready" on top. The capture beside it asks for an email address, and its
button reads "See my result in Ask Linc".

Nothing that restates the answer runs on the page: not the figures, not the
model reading, not the return comparison or the retirement charts, and not the
page's own signup CTA, which carries no run. The signup and sign-in pages state
no result either. The first place the visitor sees their answer is a decision
in their account.

Every run is held back, including a second run in the same tab.
`lib/calculator-email-memory.ts` remembers the address in session storage so a
later form on either calculator is prefilled.

**It is a nudge, not a control**, like the run limit. The Coast FIRE formula
runs in the browser, and the retirement model's response reaches the browser
before the page hides it. Anyone who opens devtools can read the answer. What
the page guarantees is only that its rendered content does not contain it.

A retirement `rates` answer is shown, with its reading. It has no run to save,
because the email endpoint refuses a run with no portfolio or spending level.
It says nothing about the visitor's own plan, and its job is to ask for the
two numbers that produce a plan result, which is held back.

### Where the run goes

`chooseCalculatorHandoff` (`lib/calculator-lead-attach.ts`) decides, once the
lead is stored:

- **Already signed in:** the run is attached to that account
  (`POST /auth/calculator-lead`) and the page opens `/app`, which lands on it
  as the newest decision. The form is prefilled with the session's own address
  (`GET /auth/verify`), because attaching needs the lead to name this account.
  If it does not — the visitor typed some other address — nothing attaches and
  the run follows the address they typed, below.
- **An address that already has an account:** `email-results` says so
  (`existingAccount: true`, from `services/calculator-account-lookup.ts`; a
  failed lookup counts as a new address, because signup's 409 links a real
  account to sign-in with the run and sign-in has nothing for a new visitor
  to open). Such an address cannot
  register, so the page goes to `/login?source=coast-fire-calculator`. The
  sign-in form finds the run in the stored signup context, prefills the
  address, says the result is waiting, and after signing in attaches the run
  and opens `/app` on it. That response tells a caller whether an address has
  an account, which `/auth/register`'s 409 already does.
- **Anyone else:** signup, where a password opens the run as the account's
  first decision.

Attaching (`attachCalculatorLeadToAccount`) makes the same address check
registration makes, against the signed-in account, so a token for someone
else's address writes nothing into this one. It is awaited, unlike seeding at
registration: an existing account already has history, so `/app` cannot wait
for an empty history to fill. It is idempotent per run: both it and seeding
write the lead's token to `Conversation.calculatorLeadToken`, which is unique
per account, so signing in twice or attaching from two tabs at once writes the
run once. The key is the token rather than the decision's wording, because two
runs can read the same — the retirement question names neither the asset mix
nor the planning horizon.

The page never falls back to showing the result. If the lead could not be
stored, there is nothing any account could open, so `email-results` answers 503
without sending anything and the form asks the visitor to retry. If signup
still meets an existing address (arriving from the emailed link, say), it
answers 409 and the signup page links to sign-in with the run.

The capture is keyed on each run rather than on its inputs, so an identical
re-run gets a fresh form. A send still in flight when the visitor re-runs is
ignored when it returns.

### Follow-ups in Ask Linc

The visitor's next question is about this run, and they have linked nothing. Ask Linc answers it from their figures rather than asking them to link an account first: the `coast_fire` calculator for Coast FIRE, and the `stated_retirement_plan` calculator for a retirement-calculator plan. Linking is offered at the end of the answer as what would make it better. See "Before anything is linked" in `docs/SCENARIO_MODELING.md`.

## Three runs, then the save

The Calculate button locks after three completed runs, and a line under it
points at the capture instead. Shared with `/retirement-calculator` through
`lib/calculator-run-limit.ts`, including the `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT`
setting that moves the number; the reasoning, and why it is a nudge rather than
a control, is in `docs/RETIREMENT_QUICKPLAN.md`.

## No reading on this page

The Coast FIRE page shows no result, so it no longer asks a model to describe
one, and the `POST /api/coast-fire/interpretation` endpoint that did so has
been removed. The answer the visitor sees in Ask Linc is the deterministic
first decision. The only calculator reading left is the retirement page's
published-rates mode; see `docs/RETIREMENT_QUICKPLAN.md`.

## Saving a run to an account

The capture takes the visitor to signup with their address prefilled, and the
email links back to the same place. Three things happen when someone registers
with that token:

- **The verification code is skipped, for any resolved lead.** A code between
  the password and the answer is where the visitor leaves, and the calculators
  exist to get them in front of that answer in Ask Linc. When the signup page
  sends `acceptsFirstDecisionHandoff: true`, `/auth/register` creates no code
  row and sends no code mail, and reports `firstDecisionPending: true` so the
  client opens `/app` rather than `/verify-email`. A page from before that
  field reads only `emailVerified`, so it still gets a code for a disclosed
  lead; that is what makes the deploy order free.

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
creates: **for this Ask Linc handoff, deploy the backend (and the
`Conversation.calculatorLeadToken` migration) first, or with the frontend,
never after.** An older backend returns no `ref` for an existing account and
has no attach route; a newer page that never reveals the answer would then
strand that visitor. The older “frontend first” rule still applies only to the
verification-code skip — see that doc.

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
minutes and is only sent on `/getstarted` (or on `/login`, for a sign-in link),
and redirects to an address with no token in it. The page it lands on spends
the cookie and deletes it. `to=sign-in` is the only destination the link can
choose, and both destinations are constants. A blocked cookie
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
account, and the account is the point. It goes to every new address.

An address that already has an account gets the same message, worded for
sign-in ("Sign in to your Ask Linc account and your result opens there as a new
decision"), and its link carries `&to=sign-in`. `/coast-fire/continue` then
redirects to `/login?source=coast-fire-calculator` instead of signup, with the
handover cookie scoped to `/login`. The sign-in form spends that cookie, fills
in the address from `GET /api/coast-fire/signup-context/:token`, and attaches
the run after sign-in. No email carries the answer, whoever it goes to. Nothing
is mailed when the lead did not store.

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

The visitor asked for their result, and it opens in Ask Linc. The mailing list
is not allowed to stand between them and that:

- A failed database write means no run for any account to open, so it is the
  one case the visitor is asked to retry (503). Nothing is mailed for it: a
  retry would send another.
- A 200 with no `ref` means the lead stored and the ready email went out, but
  the disclosure stamp did not, so the token must not sit in the page. The form
  points at the inbox rather than inviting another lead; the emailed link still
  opens the run.
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
