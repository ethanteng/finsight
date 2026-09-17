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
plain language and may state no number the engine did not produce. It is
labelled as model-written where it sits. See
[The interpretation panel](#the-interpretation-panel).

## Pieces

| Piece | Path |
|---|---|
| Page | `frontend/src/app/retirement-calculator/page.tsx` |
| Client component | `frontend/src/components/marketing/RetirementQuickPlan.tsx` |
| Styles | `frontend/src/components/marketing/retirement-quickplan.css` |
| Ad-variant helpers | `frontend/src/lib/retirement-landing.ts` |
| Connected-accounts example | `frontend/src/components/marketing/RetirementConnectedExample.tsx` |
| Example data (generated) | `frontend/src/lib/retirement-calculator-example.generated.ts` |
| Example generator | `scripts/build-retirement-example.ts` (`npm run build:retirement-example`) |
| Example drift check | `scripts/verify-retirement-example.sh` (`npm run verify:retirement-example`) |
| Service | `src/services/retirement-quickplan.ts` |
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
They had a full-width dark section under the charts. It came out when the
result was reordered so the methodology follows the scenarios directly, on the
grounds that the connected-accounts panel below now *demonstrates* the same gap
— a real book, with the part the engine would not model priced in dollars —
where the list only asserted it. The field stays on the response: it is part of
the API contract and is still covered by `buildLimitations` tests, and a caller
other than this page may want it.

## The connected-accounts example

The page's own result is computed live from six numbers, and the CTA under it
promised something better without showing it. `RetirementConnectedExample`
is that something: the same shape of plan, run by the same engine, against a
portfolio it actually read.

It has to be static — a marketing page cannot hold someone's portfolio — but
static is not invented. `npm run build:retirement-example` runs the real
`analyzeRetirementPortfolio` against the book in
`scripts/build-retirement-example.ts` and writes
`frontend/src/lib/retirement-calculator-example.generated.ts`. The page imports
that file and nothing else. To publish a different profile — a real account's
holdings — edit the script and re-run it; never edit the generated file, since
the panel's claim that these are engine outputs is only true while it is
generated.

CI runs `npm run verify:retirement-example` on every push. It regenerates to a
temporary file and diffs, so a hand edit is reported rather than repaired, and
a change to the engine or the return dataset that moves the answer fails the
build instead of leaving the page presenting stale figures as current ones.
That check is only meaningful because the generator is deterministic: the
as-of date is pinned and there is no timestamp in the output, so the file
changes when the model's answer changes and at no other time.

The example book is deliberately awkward in the ways real feeds are: a
single-stock position with no resolvable geography, a chunk the custodian never
itemised, and two sleeves the engine has no return series for. Those produce one
of the panel's two centrepieces — the share of the money left out of the
simulation rather than guessed at, which the six-number version has no way to
disclose because it invented the whole portfolio.

**The seam is a handover, not a rule.** The section opens with a gradient that
carries the page's background down into its own, broken by the line "Now,
without the guesswork" — so the join reads as a turn in the argument rather than
a boundary between two boxes. Not "a real answer": the six-number result above
is a real calculation, and what it lacks is knowledge of the portfolio. The
flanking rules are dropped under 620px, where the phrase wraps and rules centred
against two lines read as a mis-drawn box.

**A jump link sits under the live result.** The connected-accounts section is
four blocks below the answer — past two charts and the methodology — so a
visitor who reads their result and stops never reaches the argument for
connecting anything. The link appears the moment they have an answer to compare
against. It animates (a bob on the arrow, a breathing ring on the pill) because
it competes with a chart already in view; both animations are transform and
box-shadow only, and both are off under `prefers-reduced-motion`. The anchor id
is exported as `CONNECTED_EXAMPLE_ID` and imported by both sides, because a link
to an id nothing carries fails silently.

**Its header is the page's pitch, so it is styled as one.** The section head is
an inset dark panel rather than a dark full-bleed band: the cross-sell directly
below is already full-bleed dark, and two of those in a row read as one block.
Its kicker is a lime badge rather than the small caption `.section-kicker.light`
gives it elsewhere, because it is what names the block for someone scrolling
past before they read a word of the headline; it becomes a squarer tag on
narrow screens, where it wraps to two lines and a stadium radius would read as
a mistake. The copy is deliberately non-technical and deliberately short — what
the six-number answer had to assume, why that assumption changes the answer, and
what connecting accounts replaces it with — because it is the one part of this
page addressed to someone who has not decided to care yet. The headline carries
the argument on its own; the lede under it is one sentence naming the profile,
because everything else it used to say is either in that headline or in the
cards below it. It claims the model stops guessing *what you
own*, never that nothing is assumed: the panel's own middle card prices what the
model still cannot see.

**The panel answers the question before it shows its work.** It leads with the
result at the plan's own retirement age and a band of the same plan at each age
in `RETIREMENT_AGE_LADDER` — a separate engine run apiece, identical in every
respect but the date. One rate answers "can I retire at 60?" and says nothing
about "when can I retire?", and the page is bought against both headlines, so
the band is the answer to the second. Every age is tested over the same window
(today through life expectancy), so the denominators match and the rates are
directly comparable; each rung carries its own count anyway, so the panel never
has to assume that.

The "when" sentence under the band is derived from the band rather than written
about it — the earliest age tested, the earliest that cleared nine in ten, and
the earliest where nothing ran out at all. A regeneration that moves those ages
moves the prose with them. "Nothing ran out" is stated as a fact about
overlapping stretches of one country's record, not as a guarantee.

The panel does not disclaim the comparison with the six-number result above:
both runs now cover the same record.

That used to be false, and the fix is in the engine rather than the copy. The
international series starts in 1975, and the engine used to restrict every
window to months where all active series existed — so a portfolio holding any
international at all was tested only against retirements beginning between 1975
and the early 1980s, the most favourable stretch of the record. The same plan
looked materially safer in the authenticated product than on this page, and the
difference was data availability rather than insight. `ShortSeriesPolicy` now
extends the short series with a documented proxy instead, and the panel states
which months of the window that covers.

## Page order

Hero, form, result (verdict → jump link → sustainable-spending chart →
scenarios → methodology and the assumptions disclosure), then the
connected-accounts panel, the cross-sell, and the always-present crawlable body
— now just the FAQ ("Retirement FAQs") and the cluster links ("Read more about
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
`30-year` and as-of date in a published rate's label. Without that the panel is
rejected for restating the fact block — on exactly the plans where the model
did what it was told.

A draft with an ungrounded figure is retried once, with the offending tokens
named. A response that is not the object asked for at all gets the same one
more chance, told what was wrong with the format rather than handed figures it
never wrote — inside the same two-attempt ceiling, not on top of it. A second
failure returns null, the route answers 204, and the page renders nothing — **the deterministic result is complete without this panel, so
the failure mode is a missing paragraph rather than a wrong one.** The
give-up is reported to Sentry, because the page gives no other sign it happened.

One gap worth knowing: the check is by value, not by fact, so a draft can
attach a true figure to the wrong label. Every number that reaches the page is
one this run produced; that it is the *right* one for the sentence around it is
what the prompt and the fact labels are for.

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
