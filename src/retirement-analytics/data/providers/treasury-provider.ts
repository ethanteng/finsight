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

    const couponRate = numeric(row.int_rate);
    const security: TreasurySecurity = {
      cusip: normalized,
      kind: classifyRow(row),
      // The API reports the coupon in percent.
      couponRate: couponRate === null ? null : couponRate / 100,
      maturityDate: isoDate(row.maturity_date),
    };
    await cacheService.set(cacheKey, security, HIT_TTL_MS);
    return { security, available: true };
  }

  /**
   * Resolve many CUSIPs, one request each, sequentially.
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
   */
  async getTreasurySecurityBatch(
    cusips: readonly string[],
  ): Promise<TreasuryBatchResult> {
    const securities = new Map<string, TreasurySecurity>();
    const unique = new Set(
      cusips
        .map(normalizeCusip)
        .filter((cusip): cusip is string => cusip !== null && isTreasuryCusip(cusip)),
    );

    let degraded = false;
    let consecutiveFailures = 0;
    let allowNetwork = true;
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
      if (available) {
        consecutiveFailures = 0;
        continue;
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
    }
    return { securities, degraded };
  }

  private async fetchAuctions(cusip: string): Promise<AuctionRow[]> {
    const url = new URL(BASE_URL);
    url.searchParams.set('filter', `cusip:eq:${cusip}`);
    url.searchParams.set(
      'fields',
      'cusip,security_type,inflation_index_security,floating_rate,int_rate,maturity_date,auction_date',
    );
    url.searchParams.set('page[size]', '20');

    const response = await fetchWithBoundedRetry(url, {}, {
      ...this.requestOptions,
      requestTimeoutMs: this.requestOptions.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    });
    if (!response.ok) {
      await discardResponseBody(response);
      throw new Error(`Treasury API error for ${cusip}: HTTP ${response.status}`);
    }
    const body = await response.json();
    const data = (body as { data?: unknown })?.data;
    if (!Array.isArray(data)) {
      throw new Error(`Treasury API returned an unexpected response for ${cusip}`);
    }
    return data as AuctionRow[];
  }
}

export const treasuryProvider = new TreasuryProvider();
