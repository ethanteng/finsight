/**
 * Increment whenever classification, simulation, or published metric semantics
 * change without changing the checked-in historical return dataset.
 *
 * 5: individual Treasury lines are read from the `UST` abbreviation and placed
 *    in the nominal bond sleeve; the custodian's cash-equivalent flag is read
 *    where it previously went unused; exclusions record why they happened.
 *    Analyses cached at 4 report gaps the engine no longer has, so they must
 *    recompute rather than be trusted.
 */
export const RETIREMENT_ANALYSIS_VERSION = 5 as const;
