# Retirement quick plan (`/retirement-calculator`)

Status: **landing-page experiment**

A public, unauthenticated page that runs the real retirement engine against six
numbers a visitor types in. It is a test of one hypothesis: that a
decision-specific calculation from Ask Linc's own infrastructure converts better
than a chat box with no data behind it.

There is deliberately **no chat input anywhere on the page**. A visitor enters a
plan and gets the deterministic engine's output — charts, scenarios, and the
list of everything the model had to assume on their behalf.

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
| Route | `src/routes/retirement-quickplan.ts` (mounted at `/api/retirement-quickplan`) |
| Tests | `src/__tests__/unit/retirement-quickplan.test.ts`, `src/__tests__/unit/retirement-quickplan-route.test.ts`, `frontend/src/__tests__/retirement-landing.test.tsx` |

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

Hero, form, result (verdict → sustainable-spending chart → scenarios →
methodology and the assumptions disclosure), then the connected-accounts panel,
the cross-sell, and the always-present crawlable body.

The methodology block sits directly under the scenarios because it explains the
numbers immediately above it. Three pieces that used to sit between or around
them are gone: the dark limitations section, the numbered "how this calculator
works" explainer (it walked through a form the visitor can already see), and the
hero's "no chat box" line. Everything the page removed was copy about the
product; nothing the engine computed was dropped except the limitations list
above.

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
