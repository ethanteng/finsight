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
 * What the Treasury issued, reduced to the distinctions that change how the
 * engine models a position.
 *
 * `bill` and `frn` are kept apart from `nominal` because their return profile
 * is the cash sleeve's, not the ten-year series': a bill matures inside a year
 * and a floating-rate note resets off the 13-week bill, so neither carries the
 * duration the nominal series would impute to it.
 */
export type TreasurySecurityKind = 'bill' | 'nominal' | 'tips' | 'frn';

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
   * Resolve one CUSIP, or null when the Treasury has no auction record for it.
   *
   * Null is also what a caller gets when the service is unreachable. That is
   * deliberate: this provider adds evidence, and its absence must leave the
   * classifier exactly where it stood before rather than failing an analysis.
   */
  async getTreasurySecurity(cusip: string): Promise<TreasurySecurity | null> {
    const normalized = normalizeCusip(cusip);
    if (!normalized) return null;

    const cacheKey = `treasury_cusip_${normalized}`;
    const cached = await cacheService.get<TreasurySecurity | 'miss'>(cacheKey);
    if (cached) return cached === 'miss' ? null : cached;

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
      return null;
    }

    const row = originalIssue(rows);
    if (!row) {
      await cacheService.set(cacheKey, 'miss', MISS_TTL_MS);
      return null;
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
    return security;
  }

  /**
   * Resolve many CUSIPs, one request each, sequentially.
   *
   * Sequential because the endpoint takes a single equality filter and a
   * portfolio holds tens of Treasury lines, not thousands; issuing them in
   * parallel would buy little and risks tripping rate limits on a free public
   * service. Cached CUSIPs cost no request at all.
   */
  async getTreasurySecurityBatch(
    cusips: readonly string[],
  ): Promise<Map<string, TreasurySecurity>> {
    const resolved = new Map<string, TreasurySecurity>();
    const unique = new Set(
      cusips.map(normalizeCusip).filter((cusip): cusip is string => cusip !== null),
    );
    for (const cusip of unique) {
      const security = await this.getTreasurySecurity(cusip);
      if (security) resolved.set(cusip, security);
    }
    return resolved;
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
