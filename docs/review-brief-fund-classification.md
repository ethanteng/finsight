# Review brief: classifying "Unknown" / "Unclassified" investment holdings

**For an independent adversarial review.** The goal is to find where we asserted a number we
had no evidence for, or where a heuristic silently produces a confidently wrong answer.
Please argue against the approach rather than confirming it.

Merged as `ethanteng/finsight#142` (branch `claude/finances-balance-discrepancy-wgk9w1`).
Predecessors: #138, #139.

---

## 1. How we got here

A user-visible discrepancy started it: a 401(k) showed **$804,827.90** on the Finances screen
and **$1,178,623.72** on Accounts & context. Root cause: the canonical snapshot derived
investment account value from *itemized holdings only*, and the plan administrator itemizes
roughly 68% of that account. ~$386,603 was missing from net worth (#138).

Retirement analytics read the same partial holdings, so it projected on ~$432,498 (18.8%)
less than the real portfolio (#139 — which reports the excluded amount rather than modeling it).

#142 then addressed what happens to the holdings we *do* receive. Two allocation buckets were
displayed side by side — "Unclassified" and "Unknown" — which read as synonyms but mean close
to opposites:

| | `Not itemized` (was "Unclassified") | `Unrecognized holdings` (was "Unknown") |
|---|---|---|
| What we have | A dollar amount only | Real positions: ticker, quantity, price |
| What's missing | Any position at all | Just the asset-class label |
| Who can fix it | Only the provider | Better security metadata |

They were renamed, not merged. Investigating the second bucket turned up three classification
bugs, all with one root cause: **the mapper trusted provider metadata that names a fund's legal
wrapper rather than what it holds.**

### Why misclassification is amplified rather than contained

`portfolio-mapper.ts:282-289` renormalizes the mapped weights to sum to 1.0. An unmapped
holding is therefore **not excluded** — its dollars are silently redistributed pro-rata across
whatever else the portfolio holds. This is pre-existing behavior and is the reason we treated
unmapped holdings as urgent rather than cosmetic. **Worth reviewing on its own merits:** is
renormalization the right default, or should unmapped value be excluded and disclosed the way
#139 handles un-itemized value?

---

## 2. The specific worry to review

Target-date funds are modeled with an **invented glidepath**. This is the assumption we are
least confident in and the one most likely to be wrong in a way nobody notices.

### What the code does

`src/services/target-date-fund.ts:48-51`

```ts
const EQUITY_SHARE_AT_TARGET = 0.5;   // 50% equity at the target year
const EQUITY_SHARE_PER_YEAR  = 0.02;  // +2pp for each year still to run
const MIN_EQUITY_SHARE       = 0.3;   // floor, well after the target
const MAX_EQUITY_SHARE       = 0.9;   // ceiling, far from the target
```

```ts
equityShare = clamp(0.5 + 0.02 * (targetYear - asOfYear), 0.3, 0.9)
bondShare   = 1 - equityShare
```

Equity inside the fund is then split 70/30 US/international
(`portfolio-mapper.ts:24,122-124`), and the entire bond sleeve is modeled as **nominal bonds**.

### What this produces on the live portfolio (asOfYear 2026)

Target-date funds are **$408,007 of $1,868,491 — 21.8% of the modeled basis.**

| Target year | Modeled equity | Value | % of portfolio |
|---|---|---|---|
| 2025 | 48% | $24,158 | 1.3% |
| 2030 | 58% | $24,139 | 1.3% |
| 2035 | 68% | $56,394 | 3.0% |
| **2040** | **78%** | **$254,957** | **13.6%** |
| 2050 | 90% (clamped) | $48,360 | 2.6% |

The 2040 bucket carries most of the exposure, so the review should concentrate there.

### Sensitivity

Portfolio equity weight is 86.0%. Shifting *every* target-date equity share:

| Glidepath error | Portfolio equity | Delta |
|---|---|---|
| −20pp | 81.6% | −4.4pp |
| −10pp | 83.8% | −2.2pp |
| +10pp | 88.2% | +2.2pp |
| +20pp | 90.4% | +4.4pp |

So a 10pp glidepath error moves portfolio equity ~2.2pp. Modest at the aggregate, but it feeds
sequence-risk and depletion-horizon simulations where the effect may not be linear.

---

## 3. Assumption inventory

Every item below is a value we chose. **None of the numeric constants in A1–A3 was validated
against an external source.**

### A1. The glidepath curve — *highest priority*

- **Claimed justification (in the code comment):** "A linear approximation of the glidepaths
  the large providers publish."
- **Actual basis: none.** No published glidepath, prospectus, or fact sheet was consulted. The
  comment asserts grounding the work does not have. **This is the single most important thing
  to check.**
- **Known ways it could be wrong:**
  - **Linearity.** Real glidepaths are piecewise and curved, typically flattening near and
    after the target. A straight line will be furthest off in the middle distance — which is
    exactly where our largest holding (2040, 14 years out) sits.
  - **"To" vs "through".** Our curve keeps de-risking past the target down to the 30% floor,
    which implicitly models every fund as a *through*-retirement glidepath. A *to*-retirement
    fund stops de-risking at the target. Getting this backwards misstates the 2025 and 2030
    funds in opposite directions.
  - **One curve, three fund families.** The portfolio holds State Street Target Retirement,
    BlackRock LifePath (`BTC LPATH IDX 2040 N`), and UC Pathway. These publish materially
    different glidepaths; we apply one curve to all of them.
  - **Clamp endpoints.** The 90% ceiling binds for 2050 (formula wants 98%) and the 30% floor
    binds beyond ~2036. Both endpoints are guesses.

### A2. 70/30 US/international split inside target-date equity

`portfolio-mapper.ts:24` — `TARGET_DATE_US_EQUITY_SHARE = 0.7`

- Not validated. Several large target-date series run closer to 60/40 US/international within
  their equity sleeve, which would make this 10pp too domestic.
- **The same 70/30 is reused** as the default for *any* equity holding whose geography can't be
  read from its name (`portfolio-mapper.ts:174,204,261`). These are two different questions —
  "how does a target-date fund allocate globally" and "what should we assume when we don't
  know" — given the same number. Please check whether that is principled or coincidence.

### A3. The bond sleeve is modeled as 100% nominal bonds

- Real target-date funds hold TIPS, international bonds, and sometimes real assets. Collapsing
  all of it to nominal bonds likely **overstates the modeled portfolio's inflation
  sensitivity**, which matters because the withdrawal policy is CPI-linked.

### A4. Name-based classification of institutional funds

`asset-classification.ts` — added because employer-plan share classes arrive with no usable
type and tickers too long to look like symbols (`SSISLX`, `SPUSA061004C00000000`, `SSPMCI`,
`WLLCGR`, `WLLCVL`, ~$217K).

- Substring signal lists for equity (`large cap`, `s&p`, `russell`, `msci`, `nasdaq`, …), cash,
  and geography.
- **Two ordering constraints are load-bearing and fragile:**
  - Cash and bond signals must be checked *before* equity, or "Government Cash Reserves" is
    swept into equity and a bond index fund is caught by an index-family word.
  - International geography must be checked *before* US, because "Total International Stock
    Index" contains a US market word (`total … stock`).
- Please look for signal words that are ambiguous across asset classes (`msci` and `s&p` both
  index bonds as well as equities).

### A5. Target-year extraction

`target-date-fund.ts:79-133` — requires **both** an explicit signal phrase and a plausible
`20xx`; picks the year closest to the signal, tie → after. A bare year is never enough (a
Treasury named `UST 3.875% 04/30/2030` must not become a 2030 glidepath — there is a test).

- `\bpathway\b` is the weakest signal and exists for one holding (`UC PATHWAY 2040`).

### A6. Weight renormalization

`portfolio-mapper.ts:282-289` — see §1. Pre-existing, not introduced here, but it determines
the blast radius of every classification error.

### A7. Mapping confidence is a count of inferences

`portfolio-mapper.ts:295` — `unmappedCount > 0 || inferredCount > holdings.length * 0.3` → `low`.

- Weighted by neither dollars nor inference quality. The 30% threshold is arbitrary. A
  portfolio modeled almost entirely on name inference can still report `medium`.
- Known and deliberately deferred as a product decision, not defended as correct.

### A8. The fixed-income veto is asymmetric

A provider type of "fixed income" now overrides a target-date name signal, so
`Pathway Capital 2030 Senior Notes` (typed Fixed Income) is no longer modeled at 58% equity.
An **equity**-typed fund with a signal word is still read as a glidepath:

```
equity | Career Pathway Fund 2025 -> eq=48% bond=52%
```

Left deliberately: widening the veto to any declared type risks reinstating the severe bug (a
real target-date fund typed `equity` modeled at 100% equity). Requiring the year adjacent to
the signal was tested and rejected — it drops `UC Pathway Fund 2040`, the real product name.

---

## 4. What was actually verified, and what was not

**Verified against the live portfolio and tests:**

- Every commit replayed through the real mapper with **per-holding** before/after diffs, not
  aggregate weights. This caught a regression where 8 individual stocks (Wells Fargo, Zoom,
  Illumina, …) silently moved from 100% US to the 70/30 split — invisible in the aggregates.
- The ETF/Mutual Fund wrapper fix moved **zero** holdings and zero weight; its only effect was
  lifting confidence `low`→`medium` by removing false inference attribution.
- Treasuries misread as target-date: **0**.
- 1483 unit tests pass; type-check and lint clean.

**Not verified — these are unvalidated priors:**

- The glidepath curve (A1), the 70/30 equity split (A2), and the nominal-bond sleeve (A3)
  were never checked against a prospectus, fact sheet, or published glidepath.
- No back-test of modeled vs actual returns for any of these funds.

**Mitigation that exists:** the split is recorded as an *inference*, surfaced to the user as a
stated assumption grouped by target year ("2 targeting 2040 at 78% equity"), and forces
mapping confidence to at best `medium`. A wrong-but-disclosed assumption is not the same as a
wrong-and-hidden one — but disclosure is not correctness.

---

## 5. Questions we want answered

1. **Is the linear glidepath defensible at all**, or should a recognized target-date fund be
   treated as unmodellable and excluded-with-disclosure the way #139 handles un-itemized value?
   Which is more honest given we hold no prospectus?
2. **What do the actual glidepaths for State Street Target Retirement, BlackRock LifePath, and
   UC Pathway say at 2026** for the 2025/2030/2035/2040/2050 vintages? How far off is
   `0.5 + 0.02 × yearsToTarget`, and in which direction?
3. **Is our curve modeling "to" or "through" retirement**, and does that match these funds?
4. Should the bond sleeve be split (TIPS / nominal / international) rather than collapsed to
   nominal, given a CPI-linked withdrawal policy?
5. Is 70/30 the right US/international split, and is it right to reuse the same constant for
   the unrelated "geography unknown" case?
6. **Is renormalization (A6) the right default**, or does it convert every classification error
   into a silent reallocation?
7. Are there ambiguous signal words in A4 that could misclassify across asset classes?
8. Anywhere else a code comment claims grounding the work does not have — A1's comment is one
   we already found; are there others?

---

## 6. Files to read

| File | Why |
|---|---|
| `src/services/target-date-fund.ts` | Glidepath constants, recognition, year extraction |
| `src/retirement-analytics/engine/portfolio-mapper.ts` | Mapping order, 70/30 splits, renormalization, confidence |
| `src/retirement-analytics/engine/asset-classification.ts` | Name signals, geography inference, container types |
| `src/services/investment-coverage.ts` | How #139 discloses value it refuses to model |
| `src/services/canonical-financial-snapshot.ts` | The residual bucket and `Not itemized` |
| `src/__tests__/unit/target-date-fund.test.ts` | What behavior is pinned |
| `docs/FINANCIAL_TRUTH_CONTRACT.md` | The rule this is all supposed to satisfy |
