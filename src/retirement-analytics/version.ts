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
 */
export const RETIREMENT_ANALYSIS_VERSION = 8 as const;
