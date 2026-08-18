/**
 * Historical Data Loader
 * Loads unified market returns from data/historical_market_returns.csv
 * No API calls. Fully deterministic and offline.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface HistoricalReturns {
  dates: Date[];
  usEquityReturns: number[];
  intlEquityReturns: Array<number | null>;
  bondReturns: number[];
  cashReturns: number[];
  inflationRates: number[];
  metadata?: HistoricalDatasetMetadata;
}

const DEFAULT_CSV_PATH = path.join(__dirname, '../../../data/historical_market_returns.csv');
const DEFAULT_METADATA_PATH = path.join(__dirname, '../../../data/historical_market_returns.metadata.json');

export interface HistoricalDatasetMetadata {
  schemaVersion: number;
  firstMonth: string;
  lastMonth: string;
  rowCount: number;
  generatedFromSourceRetrieval: string;
  series: Record<string, {
    source: string;
    description: string;
    firstMonth: string;
    lastMonth: string;
  }>;
  sources: Record<string, {
    provider: string;
    documentationUrl: string;
    sourceVintage: string;
    firstObservation: string;
    lastObservation: string;
    sha256: string;
  }>;
  methodology: {
    rollingWindows: string;
    internationalAvailability: string;
  };
}

let defaultDatasetCache: HistoricalReturns | null = null;

function monthOrdinal(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function loadMetadata(): HistoricalDatasetMetadata {
  if (!fs.existsSync(DEFAULT_METADATA_PATH)) {
    throw new Error(`Historical market metadata file not found: ${DEFAULT_METADATA_PATH}`);
  }
  const metadata = JSON.parse(fs.readFileSync(DEFAULT_METADATA_PATH, 'utf8')) as HistoricalDatasetMetadata;
  if (metadata.schemaVersion !== 2) {
    throw new Error(`Unsupported historical market metadata schema: ${metadata.schemaVersion}`);
  }
  return metadata;
}

let datasetVersionCache: string | null = null;

function fileDigest(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(path.resolve(filePath))).digest('hex');
}

/**
 * Fingerprint of the returns actually used, for cache invalidation.
 *
 * Deliberately hashes the generated files rather than the upstream source
 * snapshots: a builder correction or an edit to the checked-in dataset changes
 * the returns without touching the three downloaded sources, and callers that
 * key a stored analysis on this string must recompute in that case too. The
 * metadata file carries the source hashes, so those remain covered.
 */
export function getHistoricalDatasetVersion(): string {
  if (datasetVersionCache) return datasetVersionCache;
  // Validates the dataset and its metadata before either is fingerprinted.
  const metadata = loadHistoricalReturns().metadata;
  if (!metadata) throw new Error('Historical dataset metadata is unavailable');
  datasetVersionCache =
    `v${metadata.schemaVersion}` +
    `|returns:${fileDigest(DEFAULT_CSV_PATH)}` +
    `|metadata:${fileDigest(DEFAULT_METADATA_PATH)}`;
  return datasetVersionCache;
}

/**
 * Load historical returns from the unified CSV.
 * Returns arrays aligned by index (returns[i] and inflationRates[i] refer to the same month).
 */
export function loadHistoricalReturns(csvPath: string = DEFAULT_CSV_PATH): HistoricalReturns {
  const resolved = path.resolve(csvPath);
  if (resolved === path.resolve(DEFAULT_CSV_PATH) && defaultDatasetCache) {
    return defaultDatasetCache;
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Historical market returns file not found: ${resolved}. Run 'npm run build:market-dataset' to generate it.`
    );
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length < 2) {
    throw new Error(`Historical market returns file is empty or invalid: ${resolved}`);
  }

  const header = lines[0];
  if (header !== 'date,us_equity,intl_equity,bonds,cash,inflation') {
    throw new Error(`Unexpected CSV header. Expected: date,us_equity,intl_equity,bonds,cash,inflation. Got: ${header}`);
  }

  const dates: Date[] = [];
  const usEquityReturns: number[] = [];
  const intlEquityReturns: Array<number | null> = [];
  const bondReturns: number[] = [];
  const cashReturns: number[] = [];
  const inflationRates: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length !== 6) {
      throw new Error(`Invalid historical return row ${i + 1}: ${lines[i]}`);
    }

    const [dateStr, usStr, intlStr, bondsStr, cashStr, inflationStr] = parts;
    const [yearStr, monthStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr || '1', 10) - 1;

    const requiredRawValues = [usStr, bondsStr, cashStr, inflationStr];
    const requiredValues = requiredRawValues.map(Number);
    const internationalValue = intlStr === 'NA' ? null : Number(intlStr);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dateStr) || !Number.isInteger(year) || month < 0 || month > 11 ||
        requiredRawValues.some(value => value.trim() === '') || intlStr.trim() === '' ||
        requiredValues.some(value => !Number.isFinite(value) || value <= -1) ||
        (internationalValue !== null && (!Number.isFinite(internationalValue) || internationalValue <= -1))) {
      throw new Error(`Invalid historical return row ${i + 1}: ${lines[i]}`);
    }
    const date = new Date(Date.UTC(year, month, 1));
    const previousDate = dates[dates.length - 1];
    if (previousDate && monthOrdinal(date) !== monthOrdinal(previousDate) + 1) {
      throw new Error(`Historical return dates are not contiguous at row ${i + 1}: ${lines[i]}`);
    }
    dates.push(date);
    usEquityReturns.push(requiredValues[0]);
    intlEquityReturns.push(internationalValue);
    bondReturns.push(requiredValues[1]);
    cashReturns.push(requiredValues[2]);
    inflationRates.push(requiredValues[3]);
  }

  const n = dates.length;
  if (
    usEquityReturns.length !== n ||
    intlEquityReturns.length !== n ||
    bondReturns.length !== n ||
    cashReturns.length !== n ||
    inflationRates.length !== n
  ) {
    throw new Error('Array length mismatch in historical returns');
  }

  const metadata = resolved === path.resolve(DEFAULT_CSV_PATH) ? loadMetadata() : undefined;
  if (metadata && (
    metadata.rowCount !== n ||
    metadata.firstMonth !== lines[1].slice(0, 7) ||
    metadata.lastMonth !== lines[lines.length - 1].slice(0, 7)
  )) {
    throw new Error('Historical market metadata does not match the generated return file');
  }

  const result = {
    dates,
    usEquityReturns,
    intlEquityReturns,
    bondReturns,
    cashReturns,
    inflationRates,
    metadata,
  };
  if (resolved === path.resolve(DEFAULT_CSV_PATH)) defaultDatasetCache = result;
  return result;
}
