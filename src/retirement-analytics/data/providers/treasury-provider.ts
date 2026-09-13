// US Treasury Provider
//
// Resolves a CUSIP against the Treasury's own auction records, so an individual
// Treasury line is classified from the issuer's statement of what it issued
// rather than from whatever the custodian happened to put in the name field.
//
// This exists for one fact the name cannot carry. `UST 2.375% 07/15/2036` reads
// exactly like a nominal note and may be TIPS; the auction record settles it
// with `inflation_index_security`, and the same row also distinguishes a
// floating-rate note and gives coupon and maturity. Name inference remains the
// fallback for everything this cannot resolve -- a CUSIP we do not carry, a
// security that never went to auction, an outage -- so classification never
// depends on this service being reachable.
//
// A CUSIP is not always on offer: only Plaid sends one, so every Treasury line
// held through SnapTrade arrives as a name and nothing else. The same records
// are searchable by maturity date, and the label states the coupon, so the two
// together identify the issue -- `UST 3.5% 02/15/2029` is the only security the
// Treasury has maturing that day at that rate. That path resolves the identity
// this service is then asked about; it never asserts a classification of its
// own, and abstains wherever the pair is not unique.

import { cacheService } from '../../../data/cache';
import {
  discardResponseBody,
  fetchWithBoundedRetry,
  type BoundedFetchOptions,
} from '../../../data/providers/http-retry';

const BASE_URL =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Auction facts are immutable: a CUSIP's type, coupon, and maturity are fixed
 * when the security is issued and never revised. The only reason to expire at
 * all is to let a process that cached a miss retry later, so misses are held
 * far more briefly than hits.
 */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

/** A CUSIP is 9 characters: 8 of base-36 plus a check digit. */
const CUSIP_PATTERN = /^[A-Z0-9]{8}[0-9]$/;

/**
 * CUSIP issuer numbers reserved for US government debt.
 *
 * Every security a custodian sends carries a CUSIP -- stocks and funds
 * included -- so without this the batch would ask the Treasury about an entire
 * equity portfolio. The first six characters identify the issuer, and the
 * Treasury's all begin `912`: bills at 91279x, bonds at 912810, notes at
 * 912828 and 91282x, STRIPS at 91280x / 91282x / 91283x. Agencies sit
 * elsewhere (313x), so this admits Treasuries and almost nothing else.
 *
 * Filtering here rather than at the call site because a caller cannot be
 * expected to know CUSIP issuer ranges. Erring narrow is safe: a Treasury this
 * fails to admit simply keeps the name-inferred classification it had before.
 */
const TREASURY_ISSUER_PATTERN = /^912/;

/**
 * Consecutive transport failures after which a batch stops asking.
 *
 * Each lookup costs up to two attempts at a ten-second timeout, and the batch
 * is sequential, so an unreachable service would otherwise cost twenty-odd
 * seconds per Treasury line -- minutes for a bond ladder. Optional evidence
 * must not be able to gate an analysis on wall-clock time any more than it can
 * on correctness.
 */
const CONSECUTIVE_FAILURE_LIMIT = 3;

/**
 * Rows read when searching a maturity date, and the ceiling on establishing
 * uniqueness.
 *
 * A single maturity date carries a handful of issues -- five for 2029-02-15,
 * counting every reopening -- so this is generous. It matters anyway: a
 * truncated page cannot prove that the coupon matched only one security, and
 * an unprovable match is refused rather than assumed.
 */
const MATURITY_PAGE_SIZE = 100;

/** No Treasury has ever paid this much; a larger number is not a coupon. */
const MAX_COUPON_PERCENT = 20;

/**
 * What a custodian's label says the security is, when no CUSIP came with it.
 *
 * Coupon and maturity are what identify an issue: the records are searched by
 * maturity and disambiguated by coupon. Held as a percent because that is the
 * unit `int_rate` arrives in, and comparing in the source's own units avoids a
 * conversion that could manufacture a mismatch.
 */
export interface TreasuryTerms {
  couponPercent: number;
  /** YYYY-MM-DD. */
  maturityDate: string;
}

/**
 * The issuer, named in the label.
 *
 * Required, and it is the whole defence against resolving someone else's debt
 * against Treasury records: `APPLE INC 3.35% 02/09/2027` has exactly the shape
 * this reads, and a coupon and maturity that could well collide with a
 * Treasury issue. Only a label that says whose debt it is may be looked up.
 *
 * Spelled to exclude `treasure`: `treas` is followed by a word boundary, which
 * that word does not offer.
 */
const TREASURY_ISSUER_NAME_PATTERN =
  /\b(?:ust|u\.s\.t|tsy|treas(?:ury|uries|urys|\.)?|t-?(?:note|bond|bill)s?)\b/;

/**
 * Words that mark a pooled vehicle rather than an individual issue.
 *
 * A Treasury bond fund is classified from its ticker like any other fund and
 * must never be resolved to a single security. No fund name carries both a
 * coupon and a maturity, so this is a second lock on a door the shape
 * requirement has already closed -- cheap, and the cost of being wrong here is
 * an entire fund modeled as one bond.
 */
const POOLED_VEHICLE_PATTERN = /\b(?:fund|etf|index|trust|portfolio|money market|mmkt)\b/;

const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const US_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;

/**
 * Coupon spellings, in the order they must be tried.
 *
 * The fraction form comes first because it defeats the others: read
 * `3 1/2%` for a percentage and the match is `2%`, which is a different
 * security or none at all. Denominators are the street's halves through
 * thirty-seconds; a slash between any other pair of numbers is not a coupon.
 *
 * A bare whole number is deliberately not a spelling. `UST NOTE 10 02/15/2029`
 * would read as a 10% coupon when the 10 is as likely a quantity or a tenor,
 * and there is no way to tell from the string. A decimal point or a percent
 * sign is the evidence that the number is a rate.
 */
const FRACTION_COUPON_PATTERN = /\b(\d{1,2}) (\d{1,2})\/(\d{1,2})\b/;
const PERCENT_COUPON_PATTERN = /\b(\d{1,2}(?:\.\d{1,6})?) ?%/;
const DECIMAL_COUPON_PATTERN = /\b(\d{1,2}\.\d{1,6})\b/;
const FRACTION_DENOMINATORS = new Set([2, 4, 8, 16, 32]);

/** A real calendar date in ISO form, or null if those numbers name no day. */
function calendarDate(year: number, month: number, day: number): string | null {
  // Nothing issued before 2000 is still outstanding, and a two-digit year is
  // read into this century on the same reasoning.
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return utc.toISOString().slice(0, 10);
}

/** Every date in the label, in ISO form. Unreadable ones are simply not dates. */
function collectDates(text: string): string[] {
  const dates: string[] = [];
  for (const match of text.matchAll(ISO_DATE_PATTERN)) {
    const date = calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) dates.push(date);
  }
  for (const match of text.matchAll(US_DATE_PATTERN)) {
    const year = Number(match[3]);
    const date = calendarDate(year < 100 ? 2000 + year : year, Number(match[1]), Number(match[2]));
    if (date) dates.push(date);
  }
  return dates;
}

function parseCouponPercent(text: string): number | null {
  const fraction = FRACTION_COUPON_PATTERN.exec(text);
  if (fraction) {
    const [whole, numerator, denominator] = fraction.slice(1).map(Number);
    // A slash that is not a street fraction means this label is not shaped the
    // way we think it is; stop rather than fall through to another reading.
    if (!FRACTION_DENOMINATORS.has(denominator) || numerator >= denominator) return null;
    return whole + numerator / denominator;
  }
  const percent = PERCENT_COUPON_PATTERN.exec(text);
  if (percent) return Number(percent[1]);
  const decimal = DECIMAL_COUPON_PATTERN.exec(text);
  return decimal ? Number(decimal[1]) : null;
}

/**
 * Read coupon and maturity out of a custodian's label, or refuse.
 *
 * Refusing is the common case and the safe one: what this returns is looked up
 * against the issuer's records and must match a security exactly, so a misread
 * label almost always resolves to nothing. The danger is the misread that
 * happens to name a real security, which is why the issuer must be named, a
 * pooled vehicle is excluded, and an ambiguous date or coupon abstains.
 *
 * A zero coupon is refused outright. Bills carry no `int_rate` to match and
 * STRIPS never went to auction, so `UST 0% 05/15/2040` could only ever match
 * something it is not -- a floating-rate note reported at a zero base rate --
 * and that would move a long zero-coupon bond into the cash sleeve.
 */
export function parseTreasuryLabel(name: string): TreasuryTerms | null {
  const normalized = treasuryLabelKey(name);
  if (!normalized) return null;
  if (!TREASURY_ISSUER_NAME_PATTERN.test(normalized)) return null;
  if (POOLED_VEHICLE_PATTERN.test(normalized)) return null;

  // One maturity, or we cannot say which date is it. A label repeating the
  // same date twice still names one day.
  const dates = new Set(collectDates(normalized));
  if (dates.size !== 1) return null;
  const [maturityDate] = dates;

  // Dates out of the way first: `1/2` in `3 1/2` must not be read as one, and
  // `02/15/2029` must not be read as a coupon.
  const withoutDates = normalized
    .replace(ISO_DATE_PATTERN, ' ')
    .replace(US_DATE_PATTERN, ' ');
  const couponPercent = parseCouponPercent(withoutDates);
  if (couponPercent === null || !(couponPercent > 0) || couponPercent > MAX_COUPON_PERCENT) {
    return null;
  }
  return { couponPercent, maturityDate };
}

/**
 * The key a label is held under, shared by this provider and its callers.
 *
 * Whitespace and case vary between feeds for what is one security; keying on
 * the raw string would hand a caller a map it cannot find its own holdings in.
 */
export function treasuryLabelKey(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const key = name.replace(/\s+/g, ' ').trim().toLowerCase();
  return key.length > 0 ? key : null;
}

/** True when this CUSIP could be US government debt worth asking about. */
export function isTreasuryCusip(cusip: string): boolean {
  const normalized = normalizeCusip(cusip);
  return normalized !== null && TREASURY_ISSUER_PATTERN.test(normalized);
}

/**
 * What the Treasury issued, reduced to the distinctions that change how the
 * engine models a position.
 *
 * `bill` and `frn` are kept apart from `nominal` because their return profile
 * is the cash sleeve's, not the ten-year series': a bill matures inside a year
 * and a floating-rate note resets off the 13-week bill, so neither carries the
 * duration the nominal series would impute to it.
 */
export type TreasurySecurityKind = 'bill' | 'nominal' | 'tips' | 'frn';

export interface TreasuryBatchResult {
  securities: Map<string, TreasurySecurity>;
  /**
   * Normalized label -> the record it resolved to, for the lines that arrived
   * with no CUSIP to ask about.
   *
   * Kept apart from `securities` because the caller has a different question
   * for each: a holding that carries a CUSIP is looked up by it, and one that
   * does not can only be looked up by the name it came with.
   */
  byLabel: Map<string, TreasurySecurity>;
  /**
   * True when at least one lookup could not be completed.
   *
   * Distinct from a CUSIP the Treasury has no record of, and the distinction
   * decides whether the resulting analysis may be cached: a name-inferred
   * reading produced during an outage must not be persisted as the current
   * answer and reused for a week after the service recovers.
   */
  degraded: boolean;
}

export interface TreasurySecurity {
  cusip: string;
  kind: TreasurySecurityKind;
  /** Coupon rate as a fraction, or null for a bill and for a rate we could not read. */
  couponRate: number | null;
  /** YYYY-MM-DD, or null when the record carried no usable maturity. */
  maturityDate: string | null;
}

interface AuctionRow {
  cusip?: string;
  security_type?: string;
  inflation_index_security?: string;
  floating_rate?: string;
  int_rate?: string;
  maturity_date?: string;
  auction_date?: string;
}

/**
 * Cache key for one CUSIP.
 *
 * Named because both the resolver and the breaker's cache-only path read it;
 * a format change in one place would otherwise silently stop the other from
 * finding hits, which fails open as a missing sleeve rather than an error.
 */
function cacheKeyFor(cusip: string): string {
  return `treasury_cusip_${cusip}`;
}

function normalizeCusip(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return CUSIP_PATTERN.test(normalized) ? normalized : null;
}

/** The API sends absent numbers as the string "null", not as JSON null. */
function numeric(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function yesNo(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'yes';
}

function isoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * Reduce one auction record to the kind the engine models.
 *
 * Order matters. An inflation-indexed security is reported with
 * `security_type` "Note" or "Bond" -- the field names the tenor, not the
 * mandate -- so the inflation flag has to be read before the type, or every
 * TIPS issue lands in the nominal sleeve. That is the exact misclassification
 * this provider exists to prevent.
 */
function classifyRow(row: AuctionRow): TreasurySecurityKind {
  if (yesNo(row.inflation_index_security)) return 'tips';
  if (yesNo(row.floating_rate)) return 'frn';
  return row.security_type?.trim().toLowerCase() === 'bill' ? 'bill' : 'nominal';
}

/**
 * Pick the record that describes the security, not one particular sale of it.
 *
 * A reopened issue is auctioned several times under one CUSIP, and those rows
 * disagree on `security_term` -- a 10-year note reopened later is advertised as
 * "9-Year 10-Month". The facts this provider reads are identical across them,
 * so any row would serve; taking the earliest auction makes the choice
 * deterministic rather than dependent on the order the API returns.
 */
function originalIssue(rows: readonly AuctionRow[]): AuctionRow | null {
  let chosen: AuctionRow | null = null;
  let chosenDate: string | null = null;
  for (const row of rows) {
    const date = isoDate(row.auction_date);
    if (!chosen || (date !== null && (chosenDate === null || date < chosenDate))) {
      chosen = row;
      chosenDate = date;
    }
  }
  return chosen;
}

/** Cache key for one set of terms read off a label. */
function termsCacheKeyFor(terms: TreasuryTerms): string {
  return `treasury_terms_${terms.maturityDate}_${terms.couponPercent.toFixed(6)}`;
}

/**
 * True when this row pays what the label said it pays.
 *
 * Both sides are percentages the Treasury published, so the tolerance only has
 * to absorb the binary representation of a decimal like 2.375, not any real
 * disagreement. A row with no rate at all -- a bill -- matches nothing.
 */
function couponMatches(row: AuctionRow, couponPercent: number): boolean {
  const rate = numeric(row.int_rate);
  return rate !== null && Math.abs(rate - couponPercent) < 1e-6;
}

function toSecurity(row: AuctionRow, cusip: string): TreasurySecurity {
  const couponRate = numeric(row.int_rate);
  return {
    cusip,
    kind: classifyRow(row),
    // The API reports the coupon in percent.
    couponRate: couponRate === null ? null : couponRate / 100,
    maturityDate: isoDate(row.maturity_date),
  };
}

export class TreasuryProvider {
  constructor(private readonly requestOptions: BoundedFetchOptions = {}) {}

  /**
   * Resolve one CUSIP, or null when the Treasury has no auction record for it
   * and when the service is unreachable.
   *
   * Collapsing those two into null is deliberate for a single lookup: this
   * provider adds evidence, and its absence must leave the classifier exactly
   * where it stood rather than failing an analysis. A caller that needs to
   * tell them apart -- to decide whether the resulting analysis may be cached
   * -- uses `getTreasurySecurityBatch`, which reports availability.
   */
  async getTreasurySecurity(cusip: string): Promise<TreasurySecurity | null> {
    return (await this.resolve(cusip)).security;
  }

  private async resolve(
    cusip: string,
  ): Promise<{ security: TreasurySecurity | null; available: boolean }> {
    const normalized = normalizeCusip(cusip);
    // Not a CUSIP at all: nothing was attempted, and nothing is degraded.
    if (!normalized) return { security: null, available: true };

    const cacheKey = cacheKeyFor(normalized);
    const cached = await cacheService.get<TreasurySecurity | 'miss'>(cacheKey);
    if (cached) {
      return { security: cached === 'miss' ? null : cached, available: true };
    }

    let rows: AuctionRow[];
    try {
      rows = await this.fetchAuctions(normalized);
    } catch (error) {
      // Not cached: an outage must not pin a security as unresolvable for the
      // life of the process.
      console.warn(
        `⚠️ Treasury: lookup failed for ${normalized}:`,
        error instanceof Error ? error.message : String(error),
      );
      return { security: null, available: false };
    }

    const row = originalIssue(rows);
    if (!row) {
      await cacheService.set(cacheKey, 'miss', MISS_TTL_MS);
      return { security: null, available: true };
    }

    const security = toSecurity(row, normalized);
    await cacheService.set(cacheKey, security, HIT_TTL_MS);
    return { security, available: true };
  }

  /**
   * Resolve the one security matching a label's coupon and maturity, or null.
   *
   * Uniqueness is the whole safeguard, so it is established rather than
   * assumed: every issue maturing that day is read, the coupon selects among
   * them, and anything other than exactly one CUSIP surviving -- including a
   * page too full to prove there was not another -- resolves to nothing and
   * leaves the label's own reading in place.
   */
  private async resolveByTerms(
    terms: TreasuryTerms,
  ): Promise<{ security: TreasurySecurity | null; available: boolean }> {
    const cacheKey = termsCacheKeyFor(terms);
    const cached = await cacheService.get<TreasurySecurity | 'miss'>(cacheKey);
    if (cached) {
      return { security: cached === 'miss' ? null : cached, available: true };
    }

    let page: { rows: AuctionRow[]; complete: boolean };
    try {
      page = await this.fetchAuctionsByMaturity(terms.maturityDate);
    } catch (error) {
      console.warn(
        `⚠️ Treasury: lookup failed for ${terms.couponPercent}% ${terms.maturityDate}:`,
        error instanceof Error ? error.message : String(error),
      );
      return { security: null, available: false };
    }

    const matching = page.rows.filter(
      row =>
        isoDate(row.maturity_date) === terms.maturityDate &&
        couponMatches(row, terms.couponPercent) &&
        normalizeCusip(row.cusip) !== null,
    );
    const cusips = new Set(matching.map(row => normalizeCusip(row.cusip) as string));
    const row = cusips.size === 1 ? originalIssue(matching) : null;
    if (!row || !page.complete) {
      await cacheService.set(cacheKey, 'miss', MISS_TTL_MS);
      return { security: null, available: true };
    }

    const security = toSecurity(row, [...cusips][0]);
    await cacheService.set(cacheKey, security, HIT_TTL_MS);
    // The same record a CUSIP lookup for this security would have produced, so
    // a book holding it under both a named line and an identified one asks
    // once.
    await cacheService.set(cacheKeyFor(security.cusip), security, HIT_TTL_MS);
    return { security, available: true };
  }

  /**
   * Resolve a book's Treasury lines: the identified ones by CUSIP, the rest by
   * what their labels say, one request each, sequentially.
   *
   * Sequential because the endpoint takes a single equality filter and a
   * portfolio holds tens of Treasury lines, not thousands; issuing them in
   * parallel would buy little and risks tripping rate limits on a free public
   * service. Cached CUSIPs cost no request at all, and non-Treasury issuers
   * are dropped before any request is made -- without that an ordinary equity
   * portfolio, whose every security also carries a CUSIP, would be sent here
   * in full.
   *
   * Gives up on further network calls after `CONSECUTIVE_FAILURE_LIMIT`
   * transport failures in a row. Sequential lookups at two attempts and a
   * ten-second timeout each would otherwise let an unreachable service hold
   * an analysis for minutes, which gates it just as surely as an error would.
   * Once the breaker opens, remaining CUSIPs are still read from cache: a
   * prior hit is evidence we already have, and skipping it would throw away
   * a correct sleeve for lines that never needed the network on this pass.
   *
   * Labels are resolved after the CUSIPs and under the same breaker: they are
   * the same service answering the same kind of question, and a caller with a
   * ladder of unidentified lines must not be able to spend the failure budget
   * twice over.
   */
  async getTreasurySecurityBatch(
    cusips: readonly string[],
    labels: readonly string[] = [],
  ): Promise<TreasuryBatchResult> {
    const securities = new Map<string, TreasurySecurity>();
    const byLabel = new Map<string, TreasurySecurity>();
    const unique = new Set(
      cusips
        .map(normalizeCusip)
        .filter((cusip): cusip is string => cusip !== null && isTreasuryCusip(cusip)),
    );

    let degraded = false;
    let consecutiveFailures = 0;
    let allowNetwork = true;
    /** Record one lookup's outcome, and open the breaker once it is due. */
    const observe = (available: boolean): void => {
      if (available) {
        consecutiveFailures = 0;
        return;
      }
      degraded = true;
      consecutiveFailures += 1;
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        console.warn(
          `⚠️ Treasury: ${consecutiveFailures} consecutive failures; ` +
            'further lookups for this analysis are cache-only',
        );
        allowNetwork = false;
      }
    };

    for (const cusip of unique) {
      if (!allowNetwork) {
        // Breaker is open: take cache hits only. A miss here is not a new
        // transport failure -- we chose not to ask -- and `degraded` is
        // already set from the failures that opened the breaker.
        const cached = await cacheService.get<TreasurySecurity | 'miss'>(
          cacheKeyFor(cusip),
        );
        if (cached && cached !== 'miss') securities.set(cusip, cached);
        continue;
      }

      const { security, available } = await this.resolve(cusip);
      if (security) securities.set(cusip, security);
      observe(available);
    }

    // One request per distinct pair of terms, not per holding: a ladder often
    // repeats a line across accounts, and two spellings of one security are
    // one question.
    const termsByLabel = new Map<string, TreasuryTerms>();
    for (const label of labels) {
      const key = treasuryLabelKey(label);
      if (!key || termsByLabel.has(key)) continue;
      const terms = parseTreasuryLabel(label);
      if (terms) termsByLabel.set(key, terms);
    }

    const resolvedTerms = new Map<string, TreasurySecurity | null>();
    for (const [labelKey, terms] of termsByLabel) {
      const termsKey = termsCacheKeyFor(terms);
      if (!resolvedTerms.has(termsKey)) {
        if (allowNetwork) {
          const { security, available } = await this.resolveByTerms(terms);
          resolvedTerms.set(termsKey, security);
          observe(available);
        } else {
          const cached = await cacheService.get<TreasurySecurity | 'miss'>(termsKey);
          resolvedTerms.set(termsKey, cached && cached !== 'miss' ? cached : null);
        }
      }
      const security = resolvedTerms.get(termsKey);
      if (security) {
        byLabel.set(labelKey, security);
        // Also under its CUSIP: the caller may hold the same security on
        // another line that did arrive identified.
        securities.set(security.cusip, security);
      }
    }

    return { securities, byLabel, degraded };
  }

  private async fetchAuctions(cusip: string): Promise<AuctionRow[]> {
    return (await this.requestAuctions(`cusip:eq:${cusip}`, 20, cusip)).rows;
  }

  /**
   * Every auction record for one maturity date, and whether that is all of
   * them.
   *
   * `complete` is what lets a caller claim uniqueness. The API reports the
   * total it matched, so a page that did not carry all of them is reported as
   * such rather than passed off as the full set.
   */
  private async fetchAuctionsByMaturity(
    maturityDate: string,
  ): Promise<{ rows: AuctionRow[]; complete: boolean }> {
    const { rows, totalCount } = await this.requestAuctions(
      `maturity_date:eq:${maturityDate}`,
      MATURITY_PAGE_SIZE,
      maturityDate,
    );
    // Missing total-count cannot prove the page is the full match set. A short
    // page (fewer rows than we asked for) is still complete: the API has no
    // further rows to send. A full page without a total must abstain.
    const complete =
      totalCount !== null
        ? totalCount <= rows.length
        : rows.length < MATURITY_PAGE_SIZE;
    return { rows, complete };
  }

  private async requestAuctions(
    filter: string,
    pageSize: number,
    subject: string,
  ): Promise<{ rows: AuctionRow[]; totalCount: number | null }> {
    const url = new URL(BASE_URL);
    url.searchParams.set('filter', filter);
    url.searchParams.set(
      'fields',
      'cusip,security_type,inflation_index_security,floating_rate,int_rate,maturity_date,auction_date',
    );
    url.searchParams.set('page[size]', String(pageSize));

    const response = await fetchWithBoundedRetry(url, {}, {
      ...this.requestOptions,
      requestTimeoutMs: this.requestOptions.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    });
    if (!response.ok) {
      await discardResponseBody(response);
      throw new Error(`Treasury API error for ${subject}: HTTP ${response.status}`);
    }
    const body = await response.json();
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      throw new Error(`Treasury API returned an unexpected response for ${subject}`);
    }
    const reported = (body as { meta?: Record<string, unknown> })?.meta?.['total-count'];
    // Fiscal Data documents a number, but coerce numeric strings too so a
    // shape drift cannot flip us into the fail-open path below.
    const coerced =
      typeof reported === 'number'
        ? reported
        : typeof reported === 'string' && reported.trim() !== ''
          ? Number(reported)
          : NaN;
    const totalCount = Number.isFinite(coerced) ? coerced : null;
    return { rows: data as AuctionRow[], totalCount };
  }
}

export const treasuryProvider = new TreasuryProvider();
