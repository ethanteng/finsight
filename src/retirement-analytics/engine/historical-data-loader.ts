/**
 * Historical Data Loader
 * Loads unified market returns from data/historical_market_returns.csv
 * No API calls. Fully deterministic and offline.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface HistoricalReturns {
  dates: Date[];
  usEquityReturns: number[];
  intlEquityReturns: number[];
  bondReturns: number[];
  cashReturns: number[];
  inflationRates: number[];
}

const DEFAULT_CSV_PATH = path.join(__dirname, '../../../data/historical_market_returns.csv');

/**
 * Load historical returns from the unified CSV.
 * Returns arrays aligned by index (returns[i] and inflationRates[i] refer to the same month).
 */
export function loadHistoricalReturns(csvPath: string = DEFAULT_CSV_PATH): HistoricalReturns {
  const resolved = path.resolve(csvPath);
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
  const intlEquityReturns: number[] = [];
  const bondReturns: number[] = [];
  const cashReturns: number[] = [];
  const inflationRates: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 6) continue;

    const [dateStr, usStr, intlStr, bondsStr, cashStr, inflationStr] = parts;
    const [yearStr, monthStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr || '1', 10) - 1;

    dates.push(new Date(year, month, 1));
    usEquityReturns.push(parseFloat(usStr) || 0);
    intlEquityReturns.push(parseFloat(intlStr) || 0);
    bondReturns.push(parseFloat(bondsStr) || 0);
    cashReturns.push(parseFloat(cashStr) || 0);
    inflationRates.push(parseFloat(inflationStr) || 0);
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

  return {
    dates,
    usEquityReturns,
    intlEquityReturns,
    bondReturns,
    cashReturns,
    inflationRates,
  };
}
