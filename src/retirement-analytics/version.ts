/**
 * Increment whenever classification, simulation, or published metric semantics
 * change without changing the checked-in historical return dataset.
 *
 * 5: individual Treasury lines are read from the `UST` abbreviation and placed
 *    in the nominal bond sleeve; the custodian's cash-equivalent flag is read
 *    where it previously went unused; exclusions record why they happened.
 *    Analyses cached at 4 report gaps the engine no longer has, so they must
 *    recompute rather than be trusted.
 * 6: individual Treasury lines are classified from the issuer's own auction
 *    record where a CUSIP resolves, which separates TIPS from the nominal note
 *    its name is indistinguishable from, and routes bills and floating-rate
 *    notes to cash. A v5 analysis carries the name-only reading of every one.
 * 7: UC Pathway 2040 is modeled from its published fact sheet instead of being
 *    excluded for want of a registry row, and employer-plan book-value
 *    contracts -- guaranteed interest accounts, stable value funds -- read as
 *    cash rather than as securities nothing could place.
 * 8: the State Street rows no longer fold their high-yield and short-term
 *    corporate holdings into the government-bond sleeve. A v7 analysis of one
 *    of those vintages credits credit exposure with Treasury returns, which
 *    overstates the cushion during exactly the sequences a stress test exists
 *    to examine.
 * 9: a Treasury line that arrives without a CUSIP is resolved against the
 *    auction records by the coupon and maturity stated in its own name, so the
 *    TIPS-versus-nominal reading no longer depends on which custodian the
 *    position is held through. A v8 analysis carries the name-only reading of
 *    every Treasury line SnapTrade reported.
 * 10: TIPS are simulated rather than excluded. The dataset carries a 10-year
 *    constant-maturity TIPS total return derived from published real yields
 *    from 2003, and the nominal bond series represents the sleeve before that,
 *    reported as a substitution. A v9 analysis withheld every TIPS dollar from
 *    the simulation, so its coverage and its survival figures both describe a
 *    portfolio the user does not hold.
 * 11: income is a list of streams, each with its own start, optional end and
 *    inflation treatment, and the analysis reports the first-year portfolio
 *    withdrawal it measured. A v10 analysis has no such figure, and any income
 *    it modeled was a single stream assumed to rise with inflation.
 * 12: spending can be cut in a bad market, and the analysis reports what the
 *    user's cut did, or a comparison cut run beside a plan whose user has not
 *    said how much they could cut. A v11 analysis carries neither.
 * 13: fund fees -- the holdings' known expense ratios -- are taken out of
 *    every month's return, in the plan and the sustainable-spending range. A
 *    v12 analysis earned the index returns gross of every fee.
 */
export const RETIREMENT_ANALYSIS_VERSION = 13 as const;
