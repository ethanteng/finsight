# Retirement quick plan (`/retirement-calculator`)

Status: **landing-page experiment**

A public, unauthenticated page that runs the real retirement engine against six
numbers a visitor types in. It is a test of one hypothesis: that a
decision-specific calculation from Ask Linc's own infrastructure converts better
than a chat box with no data behind it.

There is deliberately **no chat input anywhere on the page**. A visitor enters a
plan and gets the deterministic engine's output — charts, scenarios, and the
list of everything the model had to assume on their behalf.

One block on the page is written by a language model rather than computed: the
"What this result means" panel, which reads the engine's own figures back in
plain language and may state no number the engine did not produce. See
[The interpretation panel](#the-interpretation-panel).

## Pieces

| Piece | Path |
|---|---|
| Page | `frontend/src/app/retirement-calculator/page.tsx` |
| Client component | `frontend/src/components/marketing/RetirementQuickPlan.tsx` |
| Styles | `frontend/src/components/marketing/retirement-quickplan.css` |
| Ad-variant helpers | `frontend/src/lib/retirement-landing.ts` |
| Service | `src/services/retirement-quickplan.ts` |
| First decision on signup | `src/services/calculator-first-decision.ts` |
| Interpretation | `src/services/retirement-quickplan-interpretation.ts` |
| Market conditions | `src/services/calculator-market-conditions.ts` |
| Route | `src/routes/retirement-quickplan.ts` (mounted at `/api/retirement-quickplan`) |
| Tests | `src/__tests__/unit/retirement-quickplan.test.ts`, `src/__tests__/unit/retirement-quickplan-route.test.ts`, `src/__tests__/unit/retirement-quickplan-interpretation.test.ts`, `src/__tests__/unit/calculator-market-conditions.test.ts`, `frontend/src/__tests__/retirement-landing.test.tsx`, `frontend/src/__tests__/retirement-interpretation.test.tsx` |

## What it runs

`runRetirementQuickPlan` calls `analyzeRetirementPortfolio` — the same entry
point `src/openai/context-service.ts` uses for authenticated answers — four
times: the plan as entered, the same plan retiring two and five years later, and
the same plan spending 10% less. Nothing about the calculation is special-cased
for the landing page.

Inputs are the six numbers the page asks for (current age, retirement age,
investable assets, annual spending, annual contributions, Social Security),
plus a claiming age and one of three asset-mix presets.

## Deliberate choices

**No provider lookups.** The synthetic portfolio carries no ticker symbols, so
the classifier resolves it from declared type and name alone. A request touches
no database and no external API; the historical returns are a checked-in CSV.
A request is pure CPU.

**US-only presets.** Every preset is US stocks, US government bonds and cash,
with no international sleeve. This once existed because an international sleeve
truncated the tested record to 1975 onward; the engine no longer does that (see
`ShortSeriesPolicy`), so the reason is now that the sleeve would add nothing.
Before 1975 the engine represents international with the US market return,
which is what these presets already hold, so the visitor would get a disclosure
in exchange for no extra information about a portfolio they have not described.
Connecting real accounts is what gets real international holdings modeled
against their own series — which is the difference the page is selling.

**Social Security is modeled, not netted.** `RetirementAnalysisInput` gained an
optional `retirementIncome` stream, wired through `simulateWithdrawals` as an
`incomeOffset`. It reduces the portfolio withdrawal from its own start age,
indexed by each sequence's CPI, floored at zero — so a visitor who retires at 60
and claims at 67 correctly funds those seven years entirely from the portfolio,
which is exactly the stretch sequence risk punishes. Netting the benefit across
the whole retirement would have hidden that. Existing callers pass nothing and
are unaffected.

**Metrics the page does not show.** The engine's `metrics.withdrawalRate` and
`yearsOfExpenses` describe gross spending against the portfolio and are not the
net draw once an income offset starts, so the page derives its own first-year
figures. `stressTest.worstSequences.byDrawdown` measures the portfolio path
*including withdrawals*, so a depleted sequence reports a ~100% "drawdown"; on a
page with no room to explain that it would read as a market crash, so the
service drops it.

**The endpoint still returns `limitations`; the page no longer renders them.**
They had a full-width dark section under the charts, which came out when the
result was reordered so the methodology follows the scenarios directly. What
the list asserted is now said where it lands: the assumptions disclosure names
every assumption the run made, and the saved first decision closes with the
same point in the reader's own terms. The field stays on the response: it is
part of the API contract and is still covered by `buildLimitations` tests, and
a caller other than this page may want it.

## Page order

Hero, form, result (verdict → jump link → "What this result means" →
sustainable-spending chart → scenarios → methodology and the assumptions
disclosure), then the cross-sell, and the always-present crawlable body — now
just the FAQ ("Retirement FAQs") and the cluster links ("Read more about
retirement").

The methodology block sits directly under the scenarios because it explains the
numbers immediately above it. Four pieces that used to sit between or around
them are gone: the dark limitations section, the numbered "how this calculator
works" explainer (it walked through a form the visitor can already see), the
"what the model actually tests" list, and the hero's "no chat box" line.

Everything removed was copy about the product; nothing the engine computes was
dropped except the limitations list above. **One consequence worth knowing:**
the always-present sourcing note — Kenneth R. French and Robert J. Shiller, plus
the link to `/trust` — left with the "what the model actually tests" block. The
same sourcing is still in the assumptions disclosure, which a visitor only
reaches by running the model, so the page no longer credits its data sources to
someone who reads it without running anything.

## The closing CTA

One kicker, one line, one sentence, the button, and `TRIAL_CTA_MICROCOPY` —
with the button sized past the site's hero button, since everything above it on
this page is an argument for pressing it, and full-width under 900px —
the same card-free-trial promise every other CTA on the site makes, imported
rather than retyped so the page cannot drift from it. The headline changes with
state: "This analysis used six numbers" once a visitor has run one — which only
means something to someone holding that result — and "Get answers based on your
actual finances" before that, for a visitor who has run nothing and needs the
offer stated plainly.

After a successful run, the button is a continuation rather than a generic
trial prompt: "Run this with my actual finances." Its click writes the complete,
server-validated calculator inputs to versioned `sessionStorage` with a two-hour
expiry, then navigates to `/getstarted?source=retirement-calculator`. Only that
non-sensitive source marker enters the URL; the financial values never enter
page-location analytics, referrers, server logs, or browser history.

`/getstarted` requires both the source marker and a recent valid session value
before it adopts the retirement-specific headline and scenario summary. A bare
`/getstarted`, a copied contextual URL in another session, malformed storage,
or expired storage gets the existing generic trial experience. The handoff
summary and the calculator's live result are marked `data-cs-mask`, because
their rendered DOM contains visitor-entered and derived financial values that
must not appear in Contentsquare replay even though the click events remain
measurable. The CTA keeps its existing tracking location and Contentsquare
override id so the funnel remains comparable to its earlier copy.

## Paid-search variants

Google Ads runs a separate ad group per retirement age, so the ad's final URL
carries the age it was bought on:

```
https://asklinc.com/retirement-calculator?retirement_age=62
```

That age becomes the page's `<h1>` and `<title>` (`Can I retire at 62?`) and
prefills the Retirement age field. With no parameter the page asks the open
question — `When can I retire?` — and leaves the field blank; a prefilled age
nobody chose would either contradict the headline or quietly become everyone
else's default answer. `utm_retirement_age` is accepted as an alias, because a
campaign built with the utm_ prefix would otherwise fail silently into the
generic headline.

Anything outside the model's own accepted range (30-95), or anything that is
not a plain integer, is treated as absent rather than echoed into the page.

Two consequences worth knowing:

- The page is server-rendered per request rather than statically generated.
  That is deliberate: the headline has to be right in the first paint, both for
  the visitor and for ad-relevance scoring.
- Every variant declares the same canonical URL, so ad traffic does not split
  the page's ranking across parameter permutations.

## The interpretation panel

`POST /api/retirement-quickplan/interpretation` returns the model's reading of
a run: a headline, two or three paragraphs, and a short list of watch-outs.
The page renders it under the verdict.

**It is a second request, on purpose.** The deterministic result is the page's
answer and paints in a few hundred milliseconds; this takes a model round trip.
Fusing them would trade the thing that converts for the thing that decorates
it, and would let a provider outage take the answer down with the paragraph.

**The plan is re-run here, never read out of the body.** Same rule as the
results email: prose under our branding may only describe figures we computed.
The run is served from the plan cache, since the page has just asked for it.
The page posts *the body it submitted*, not `result.inputs` — a run with a
blank box is simulated against a notional portfolio, and posting the normalized
inputs back would re-run it as a verdict about money nobody entered.

### What the model may say

Everything it is allowed to state is assembled in `buildPlanFacts`, which
produces both the prompt's fact lines and the grounding allowlist from one
array — so a fact the model is shown is exactly a fact it may repeat, and there
is no second list to drift.

`groundInterpretation` then checks every number in the draft against that list.
**The check reports; it does not gate.** A draft that quotes a figure the
engine never produced is logged and shown anyway — see "Why nothing is
withheld" below. What follows describes what the check *reads*, which is what
decides whether a warning is written, not whether a visitor sees a paragraph.

The tolerance scales to the precision written: `$3.3M` is any value within
$50,000 of 3,300,000, while `$3,326,192` is within half a dollar. Trailing
zeros count as a claim about precision too (`$140,000` is rounded to ten
thousands), down to a floor of two significant figures — so `$3M` cannot stand
for $3.36M. Percentage tokens are checked only against percentage facts, so a
rate cannot be satisfied by an unrelated dollar amount sharing its digits, and
trailing zeros never widen a rate.

Signs are part of the figure. Reading `-5%` as `5%` would let a draft state the
opposite of a fact and pass, since the positive figure is usually in the list —
5% is the cash weight, $48,000 the contributions. A hyphen that follows a digit
stays a hyphen, so `30-year` and `1926-1985` are not read as negatives, and an
en dash is never a sign.

Everything the prompt shows the model is something it will quote, so the digits
inside those strings are licensed too: the asset-mix weights, the year delta in
a variant's "2 more years of work", the `10%` of "Spend 10% less", and the
`30-year` and as-of date in a published rate's label. Without that the log fills with
warnings about the model restating the fact block — on exactly the plans where
it did what it was told.

### Why nothing is withheld

A draft used to be retried once with the offending tokens named and then
dropped if it still quoted a figure the engine had not produced. It no longer
is. Both calculator pages are free and unauthenticated, and the product call
was that a visitor seeing no reading at all is the worse outcome — so the draft
is shown and the mismatch is written to the log and to Sentry as
`shipped with unverified figures`, naming the tokens.

**What this costs.** The prompt is now the only thing asking the model to stay
inside the fact block. Nothing downstream stops a reading that states a figure
no run produced — an invented probability, a calendar year, a complement it
worked out — from reaching a public page under our own branding. The rate is
visible in the logs and nowhere else.

**What still returns null**: a provider error, a stall past the budget, and a
response that never parses as the object asked for. Only the last of those is
retried, once, inside the same two-attempt ceiling — there is nothing to show
without it. A null returns 204 and the page renders nothing.

One gap worth knowing about the check itself: it is by value, not by fact, so a
draft can attach a true figure to the wrong label. That was true when it gated
too.

Two figures are deliberately withheld. A blank portfolio or a blank spending
level is simulated against a notional figure so the engine has dollars to move;
`missing` names which, and that one is left out of the fact block entirely
rather than described as the visitor's.

### Today's rates

`calculator-market-conditions.ts` adds a small fixed set of published rates:
the 30-year and 10-year Treasury yields, CPI year-over-year, and the market's
ten-year breakeven inflation. They let the interpretation locate today inside
the tested record rather than describing the record alone — a starting yield is
a condition a retirement actually begins from, and the historical distribution
averages over hundreds of them.

It is a fixed set chosen here, not a data-pack selection. Pack routing exists
to answer *a question*, and this page has a form rather than a question, so
there is nothing to route on; the useful set is the same for every plan.

What is left out is deliberate:

- **No equity prices, index levels or recent performance.** The page's argument
  is that a thirty-year plan is judged against hundreds of sequences rather
  than against this year. Putting "the S&P is up nine percent" beside a
  survival rate invites exactly the update the model says not to make, and it
  would be the most attention-grabbing number on the page.
- **No web retrieval.** This endpoint is unauthenticated and carries no
  third-party text at all: every value reaching the prompt is a number from a
  named series or from our own engine, so there is nothing to fence. Brave
  results would end that property for the slowest and least reliable source
  available.
- **No unemployment, mortgage or card rates.** They arrive in the same FRED
  response and say nothing about whether this plan lasts.

Each rate is optional and independently settled behind a 2.5s timeout, so an
unconfigured or failing provider costs these sentences and nothing else. A set
where *nothing* resolved is held for one minute rather than the full hour: an
empty set is usually a cold start that ran past the deadline or an unset key,
and holding it for an hour would cost every interpretation in that hour its
rate context over one slow second. Re-checking is cheap, and with no key
configured it costs nothing at all — the fetch is skipped outright. The
set is cached for an hour; the *interpretation* cache keys on each rate's
label, source, observation date **and value**, so a revision in place — or the
10-year point falling back from Massive to FRED under the same label — is a
different key rather than cached prose quoting a yield that is no longer in the
facts.

**A reading whose figures did not check out is not cached.** It is shown to the
visitor who caused it and then forgotten. Caching it would hand one bad
generation to everyone who enters the same round numbers, and landing-page
visitors reach for round numbers — that is a larger decision than showing it
once, and the cache would make it silently. The next visitor gets a fresh
attempt.

### The wait

The whole panel is bounded at `TOTAL_BUDGET_MS` (25s) across both attempts.
Each attempt gets what is left rather than a fixed slice, and an attempt is not
started below `MIN_ATTEMPT_MS`. `maxRetries` is 0 and the timeout is passed
through `askClaude`: the Anthropic SDK defaults to ten minutes per request
*and retries a timeout*, so an unbounded call would hold an unauthenticated
request open — and the page's placeholder spinning — long past the point this
panel is worth having. A stall has to reach the same drop path as an error.

The page carries its own `AbortController` at 30s, deliberately past the
server's budget so the ordinary "no reading" outcome is the server's 204 rather
than a client-side abort. It only catches a connection that never answers.

### Why not the Ask pipeline

`runAskLincAnalysis` is built around a user with a financial snapshot. Routing
this through it — under a shared "test" account, as first proposed — would have
put every anonymous visitor's plan into one `userId`: `src/routes/ask.ts` feeds
that account's last ten conversations to the context planner, writes a
`Conversation` row per question, fires `updateProfileFromAnsweredTurn` into the
shared remembered context, and gathers that account's real accounts and
transactions. Each of those leaks one visitor's figures into the next visitor's
answer. With no account there is also nothing for pack selection to select, so
the machinery costs two or three model round trips and buys nothing.

This module instead has **no `userId`, no snapshot, no profile read or write,
and no conversation row.**

### Model slot

The `calculatorNarrative` slot (`CALCULATOR_NARRATIVE_MODEL`, shipped default
Haiku 4.5, thinking off) is admin-tunable like every other slot. It never sees
a user account, so it can be a cheaper and faster model than primary analysis
without affecting any answer in the product.

## Saving a run to a new account

The capture under the result asks for an account rather than an inbox copy:
**"Save these results to your free account."** The email it sends carries a
link labelled **"Finish creating your account"**, which lands on signup with
the address already filled in, and a password is the only thing left. Setting
it opens the workspace directly — no code screen, and no sign-in form asking
for the password one field later. The run becomes the first decision in the new
account.

**This path skips the verification code, and that is the point of the token.**
Every other registration goes to `/verify-email` and enters a mailed code. A
lead token is forty-eight random characters that only ever left this system
inside an email to the lead's own address, so presenting one *and* registering
that address demonstrates control of the inbox — the same thing the code
demonstrates, established the same way, one round trip earlier. Asking for it
twice is not more proof, just more steps.

Three things keep that honest:

**Deploy the frontend first, or with the backend — never after.** This is the
opposite of the usual order here, and it is worth stating because getting it
wrong strands people silently.

- *Frontend first* is safe. The new page sends `calculatorRef`, which an older
  backend ignores as an unknown body field, and reads `user.emailVerified`,
  which an older backend omits — so it falls through to the verification screen
  and the older backend has mailed a code. Nothing breaks.
- *Backend first* is not. The new backend stops mailing the code on this path
  while the old page still sends every signup to `/verify-email`, where they
  wait for mail that will never arrive. Nothing errors; it simply looks like a
  broken email pipeline.

`VerifyEmailForm` bounces an already-verified session into the workspace, which
covers someone landing there later — but that bounce lives in the *frontend*,
so it cannot rescue a backend-first rollout. Order is still the control.

- `resolveCalculatorLead` runs **before** the account is created, on the
  server, from the token alone. The client sends a token, never a claim; the
  response reports `user.emailVerified` and `RegisterForm` reads that answer
  rather than inferring it from what it sent.
- The address match is what turns possession of the token into proof. A lead
  sent to someone else proves nothing about the person registering, so it
  resolves to null and the code is sent as usual.
- No verification row is created on this path either. An unused code is one
  more live credential on an account that has no need of it.

Most of the path already existed for the results email. What is new is the last
step.

| Step | Where |
|---|---|
| Capture posts the six numbers | `RetirementEmailCapture.tsx` → `POST /api/retirement-quickplan/email-results` |
| Lead stored with the plan and the verdict | `services/retirement-leads.ts` |
| Email links to `/retirement/continue?ref=…` | `email/retirement-results.ts` |
| Token moved into a first-party cookie, URL cleaned | `app/retirement/continue/route.ts` |
| Token exchanged, address prefilled | `RegisterForm.tsx` → `GET /signup-context/:token` |
| Token sent with the registration | `RegisterForm.tsx` → `POST /auth/register` (`calculatorRef`) |
| Token resolved, address proved | `resolveCalculatorLead` — before the account exists |
| Run written as the first decision | `seedFirstDecisionFromLead` — after the response |
| Registration session carried into `/app` | `RegisterForm.tsx` — no re-entered password |

Three things about that last step are load-bearing:

**The figures come from the lead, not from a fresh run.** A token lives ninety
days; the engine and its dataset change inside that. Re-running would let the
saved decision disagree with the email that produced it, over a difference the
reader cannot see. Same reasoning the signup-context endpoint already follows.
It also means no engine run and no model call on the registration path.

**The address has to match the lead's.** A token is the only key to a lead, and
a lead holds somebody's retirement figures. Without the check, anyone holding a
forwarded link could register under their own address and copy that person's
plan into their own account. The comparison is case- and whitespace-insensitive,
since the two addresses arrive from different places.

**It cannot fail a registration.** It runs after the response and unawaited,
returns a reason rather than throwing, and skips an account that already has
decisions — registration can be retried, and two attempts must not leave two
copies of one run.

That ordering has a consequence now that registration opens `/app` directly:
the workspace's first `/conversations` fetch can beat the insert. The sign-in
form used to cover the gap. `RegisterForm` therefore leaves a short-lived
same-tab marker (`lib/pending-first-decision.ts`) whenever the server reports
the address already proved — which is exactly when a seed is in flight — and
`AppPageClient` reloads history a few times over ~2.8s before accepting an
empty workspace, showing that it is saving the run rather than the empty-state
copy while it waits. Only that signup waits; every other visit reads the marker
as absent and does nothing.

The wait belongs in the workspace, not in front of the redirect. Polling
`/conversations` from the signup form before navigating would hold the visitor
on a disabled button — for the full timeout whenever the seed is never coming
at all, which `already-has-decisions` and `failed` both allow.

The decision's question is synthesized, because a calculator is a form and
there is no prompt to carry over. It states the plan back in the first person
using only figures the visitor entered, so the answer under it answers
something and a follow-up has a thread to continue.

## Operational notes

- Rate limited per caller: `RETIREMENT_QUICKPLAN_RATE_LIMIT` requests per
  minute (default 20). A malformed value falls back to the default rather than
  parsing to NaN, which would make every over-limit comparison false and leave
  the endpoint unmetered.
- The caller's address is read from the *right* of `X-Forwarded-For`, not the
  left. `RETIREMENT_QUICKPLAN_TRUSTED_PROXIES` (default 1) says how many proxies
  sit in front of this process; raise it if a CDN is added ahead of Render. The
  leftmost entry is whatever the caller typed, so reading it would let anyone
  mint a fresh window per request by rotating a header — on an endpoint that
  runs several simulations per call, that is the whole limit defeated. A header
  too short for the declared chain falls back to the socket address.
- Tracked windows are capped (`MAX_TRACKED_WINDOWS`) and pruned only when the
  cap is reached, rather than sweeping the whole map on every request — a full
  scan per request is itself quadratic under the flood it exists to survive.
- Results are deterministic given the normalized inputs and the checked-in
  dataset, so they are cached in-process (bounded at 500 entries, cleared on
  restart — which is also when a new dataset would ship).
- Variants run sequentially with a `setImmediate` yield between them. Each run
  is a few hundred milliseconds of straight CPU, and fusing them into one block
  would stall every other request behind it.
- The interpretation endpoint has its own, much tighter window:
  `RETIREMENT_INTERPRETATION_RATE_LIMIT` (default 8/minute). Every accepted
  request that misses the cache is a model call we pay for on a page with no
  account behind it, so the limit sits where a visitor trying two or three
  variations never notices and a script generating text does. Readings are
  cached in-process, bounded at 300 entries.
- Analytics: the page pushes a `retirement_model_run` dataLayer event. GTM needs
  a Custom Event trigger and a GA4 tag for it, or the push goes nowhere.
- The form's asset-mix presets come from `GET /api/retirement-quickplan/options`
  at mount, with a hardcoded copy rendered first so an ad landing page never
  shows a spinner where its inputs go. The server is the authority; a preset
  changed there cannot silently drift from the form. A failed lookup, or a
  preset id this form cannot submit, leaves the fallback in place.

## Known ceiling

Every request runs up to four full historical simulations on the shared event
loop. The rate limit, the result cache and the `setImmediate` yield between
variants keep that from monopolising the process at landing-page traffic, and
each simulation is a few hundred milliseconds rather than seconds.

That is adequate for an experiment and not adequate for a promoted page. If
this graduates from a test — a real ad budget, or a link from the homepage —
the durable fix is to move the simulation off the request path: a worker thread
or a small job queue, with the endpoint returning a handle the page polls.
Doing that now would be building for traffic this page has not yet earned, so
it is written down rather than built.
