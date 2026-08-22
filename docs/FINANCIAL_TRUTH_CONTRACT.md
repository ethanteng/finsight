# Ask Linc financial truth contract

Status: **accepted target for the authenticated app**

Executable source: `src/domain/financial-truth.ts`

Version: `1.0`

This contract defines what user-facing financial numbers mean. Provider adapters, persistence, snapshots, API responses, the frontend, retirement analytics, and LLM context must consume these meanings instead of defining local variants.

## 1. Account identity and source ownership

An account is identified by this immutable tuple:

`(ownerId, source, sourceConnectionId, sourceAccountId)`

- `source` is `plaid`, `snaptrade`, or `manual`.
- `sourceConnectionId` is the Plaid Item/access-token record ID, SnapTrade connection ID, or the user's manual-account namespace.
- `sourceAccountId` is the provider's stable account ID or the manual account's database ID.
- Names, masks, institutions, types, subtypes, and balances are attributes—not identity.
- A refresh for one connection may only read or update accounts belonging to that connection.
- Cross-provider deduplication may create an explicit link between identities, but similarity of names or balances must never merge them automatically.

The `Account.accessTokenId` relationship persists Plaid connection ownership. Legacy accounts with one unambiguous connection are backfilled by migration; ambiguous legacy rows remain unscoped until a successful provider sync repairs them.

## 2. Transaction semantics

Raw provider amounts and canonical cash-flow amounts are different facts and must be stored separately.

- `sourceAmount`: untouched provider value for reconciliation.
- `cashFlowAmount`: user perspective; positive is money received, negative is money paid.
- `type`: the canonical classification that controls aggregation.
- Pending transactions are excluded from historical actuals.

Income and expense totals are determined by `type`, never by amount sign alone:

| Type | Income | Expenses | Notes |
|---|---:|---:|---|
| `income` | Included | — | Wages, interest, dividends, earned distributions |
| `expense` | — | Included | Ordinary spending |
| `fee` | — | Included | Included in spending |
| `refund` | — | Subtracted | Reduces spending in its category |
| transfers | — | — | Movement between accounts is not income or spending |
| `buy` / `sell` | — | — | Portfolio activity is not operating cash flow |
| `deposit` / `withdrawal` | — | — | Movement of existing cash, absent a more specific classification |
| `adjustment` | — | — | Excluded until explicitly resolved |

Canonical sign/type disagreements are errors; they must not be silently corrected during aggregation. All amounts in one aggregation must already be converted to one reporting currency.

Reporting periods use an inclusive start and exclusive end. Date-only values are interpreted as UTC; timestamp strings must include `Z` or an explicit offset. Monthly averages divide by every UTC calendar month in the requested window, including months with no activity.

Cached transaction summaries use the canonical classification and cash-flow adapter. Unclassified transactions and currencies that have not been converted are reported explicitly and omitted from totals rather than guessed.

## 3. Core metric formulas

All asset and liability inputs are non-negative magnitudes in the snapshot's reporting currency.

- `totalCash`: cash accounts only; an overdraft is debt, not negative cash.
- `totalInvestments`: for each provider-held investment account, the greater of the balance its institution reports and the market value of its deduplicated holdings, plus manual investment assets. Never the sum of both -- adding an account balance to the holdings it already contains double-counts the account.
- `homeValue`: the active user override or provider midpoint. `null` means unknown. A low/high range bound is not a substitute for the point estimate.
- `totalAssets = totalCash + totalInvestments + known homeValue + otherAssets`.
- `totalDebt`: positive outstanding principal, including credit, loans, mortgages, and overdrafts.
- `totalLiabilities = totalDebt + otherLiabilities`.
- `netWorth = totalAssets - totalLiabilities`.
- `operatingCashFlow = incomeTotal - expenseTotal`.

An account balance and its holdings are two views of one account, and they disagree in both
directions. Some plans -- employer 401(k)s especially -- itemize only part of the account, so a
holdings-only total silently drops whatever the feed does not list. Conversely a holdings sum
slightly above the balance is pricing skew between two feeds read at different moments, not extra
value. Taking the greater of the two keeps the account's full value without ever counting anything
twice.

The reported balance is authoritative for what an account is worth; holdings are authoritative for
how that value is composed. Value the balance carries and no holding explains is included in
`totalInvestments` and attributed to a `Not itemized` asset class, so allocation always reconciles
to the total. Where that residual exceeds the greater of 1 unit of the reporting currency or 0.5% of
the balance, the snapshot records an `account:<id>:holdings-coverage` observation. That observation
is not `required`: nothing is missing from net worth, only from the allocation's detail.

Consumers that model a portfolio position by position -- retirement analysis above all -- see only
the itemized holdings, never the residual or a manual account's balance. That value is real but has
no known asset class, and modeling it would mean assuming a return it may not earn, so the same rule
applies: it is excluded and reported rather than guessed. Such an analysis must publish what it
modeled (`modeledValue`), what it left out (`unmodeledValue`), and the dollar-weighted share it
covered (`valueCoverage`) -- distinct from holdings-count completeness, which stays high while a
fifth of the money is absent. Coverage below 95% caps the analysis's confidence, and every figure
computed on the modeled subset carries the exclusion as a caveat on its canonical fact, so a
qualified number cannot be quoted unqualified, with the caveat naming the direction of the error.
Support metrics (portfolio value, years of expenses, survival, depletion) are floors. The requested
withdrawal rate is overstated, because the excluded value sits in its denominator. Country and sector
exposure and portfolio fee drag describe the itemized holdings only, since the excluded value has no
positions -- their labels do not say so, so the caveat must. Retirement asset-allocation shares use the
same itemized-value denominator and leave unresolved classes absent rather than renormalizing them.
sustainable withdrawal rates carry no caveat: withdrawal survival is scale-invariant, so those
percentages do not move with the excluded value. The modeled basis is measured the way the consuming
engine sums holdings, not the way the canonical portfolio does, so a stated basis always matches what
was actually simulated.

Retirement classification produces exactly one `ResolvedHoldingExposure` per itemized holding.
Portfolio weights, published composition metrics, simulation inputs, mapping confidence, coverage,
provenance assumptions, and missing-data labels are projections of that collection; none may run a
second classifier or retain an independently authored allocation. TIPS remain distinct in both the
holding record and published composition. They are excluded from historical simulation rather than
assigned nominal-bond returns: [the United States first issued TIPS in 1997](https://www.treasurydirect.gov/research-center/history-of-marketable-securities/tips/),
so observed TIPS market history cannot meet the engine's 50-year evidence floor. Target-date recognition considers every declared provider
type, and any specific fixed-income declaration vetoes a target-like name consistently in Plaid views,
canonical snapshots, and retirement analytics.

Known credit, international-bond, and real-asset holdings are likewise excluded rather than passed
through the nominal Treasury series. Recognizing one of those classes does not add it to the simulated
taxonomy; a new sleeve requires a checked-in historical total-return series that can support the
engine's evidence and horizon requirements. Qualitative characteristics that interpret historical
outcomes use the normalized mix of the value actually simulated; published composition percentages
retain the full itemized-value denominator. Those are different named bases, not independently
classified portfolios.

Two allocation buckets describe missing information and must not be merged, because they describe
opposite problems with different remedies. `Not itemized` is value an account reports that no holding
explains -- money with no security behind it, resolvable only by the provider. `Unrecognized holdings`
is a security we do hold whose asset class we could not resolve -- resolvable by better metadata.
A target-date fund is neither: it is a declared blend, recognized from its own label rather than from
a provider type. Heuristic recognition produces an identity (`provider`, `series`, and `vintage`) but
never an allocation. A separate lookup accepts only that identity and models it only when a dated
registry entry links the exact provider, series, and vintage to published holdings no later than the
snapshot's full UTC date. The registry performs no label parsing, and no formula or generic glidepath
can supply an authoritative allocation. The newest eligible entry carries
forward instead of expiring on January 1; its age is recorded, and an entry older than 366 days is
disclosed as stale, lowers mapping confidence, and hard-caps the final analysis confidence at low.
The result records the allocation date, source,
source/share-class context, and whether the entry is the exact share class or a public share-class
proxy. Unsupported sleeves are excluded rather than redistributed and are tracked as a partial
mapping, not falsely reported as a wholly unrecognized holding. A recognized fund with no matching
dated entry remains fully unmodeled. UC Pathway funds are intentionally in that state because no
public per-vintage allocation is available. Provider-name matching is deliberately narrow: an
unreviewed alias or different fund family never inherits a reviewed allocation by similarity.

Holding values are signed. A supported negative position reduces the net portfolio and simulation
basis, and its asset exposure remains negative; this can make one sleeve exceed 100% and another fall
below zero. A negative position without a complete supported mapping stops the analysis rather than
being discarded or assigned a guessed return. A non-positive net portfolio also cannot be simulated.

Employer-plan and institutional share classes are placed the same way: by reading the mandate their
names state, since their provider type says only "Mutual Fund" and their tickers are too long to
resemble a stock symbol. Geography is read from the name too, so a fund called "International Equity
Fund" is international. A global fund without sourced country weights, or a fund whose name carries
no geography, remains unmodeled; the engine does not manufacture a US/international split.

A provider type that names the wrapper rather than the exposure -- "ETF", "Mutual Fund", a collective
trust -- carries no asset class and must not be read as one. Such a holding is classified from its
name while still inside the provider-metadata path, so the provider's own country split and
geographic focus are applied where they exist, and it is not recorded as a heuristic guess. A fund
without sourced country data or an explicit geographic name remains unavailable. A provider-typed
single equity with an exchange-style U.S. ticker may use a disclosed, medium-confidence U.S.-listing
fallback when country metadata is unavailable; a wrapper alone cannot activate it, and fund-shaped
labels, mutual-fund ticker conventions, or authoritative fund metadata veto it. A ticker or U.S.
account alone never supplies fund geography.

Amounts remain unrounded during calculation; formatting and rounding are presentation concerns. Metrics in API and LLM responses must carry an explicit unit/currency rather than infer one from a label.

## 4. Snapshot time and completeness

Three concepts must remain distinct:

- `asOf`: the oldest underlying source observation used in a snapshot.
- `computedAt`: when Ask Linc calculated the snapshot.
- `status`: `current`, `stale`, `partial`, or `unavailable`.

Recomputing a snapshot does not make its inputs fresher. Required unavailable sources make a snapshot `partial`; no available sources makes it `unavailable`; otherwise any source older than its declared maximum age makes it `stale`. When missing and stale sources coexist, `partial` is the primary status and the stale-source list still preserves the stale condition. Source errors and all stale/unavailable source IDs—including optional unavailable sources—remain attached to the snapshot for the UI and LLM.

Optional sources do not make a snapshot partial when absent. If present but stale, they make the values that use them stale.

`newestExpiringSourceAsOf` derives the opposite bound — the newest source observation, meaning when anything in the snapshot last updated. The finances and dashboard views display it, because a timestamp under a set of totals reads as "when did these last move". It is presentation only: freshness is bounded by the oldest source, so `status` and the stale-source list stay derived from `asOf` and per-source maximum ages, never from this value. Both bounds exclude non-expiring sources, whose timestamps record a user edit rather than a provider observation.

## 5. Invariants for every consumer

1. The backend computes financial metrics; the frontend only formats and displays them.
2. Persisted history copies canonical snapshot values and their original `asOf`; it never reconstructs old values from today's data.
   The chart series contains at most one daily observation for the user's IANA timezone. A changed balance-sheet mutation may also create a separate `material` observation with an explicit reason. Identical recomputations and non-financial mutations such as account renames do not create event observations.
3. The LLM receives canonical values, units, provenance, and snapshot status; it does not recalculate authoritative totals from raw arrays.
4. Unknown is represented as `null`/unavailable, not zero. Zero is used only for a known zero.
5. Provider errors and partial data are never erased by a successful cache write.

Privacy and retention are not part of this version. They are deferred to an optional late-stage hardening phase.
