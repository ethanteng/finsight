#!/usr/bin/env npx ts-node
/**
 * Build the deterministic monthly return dataset used by retirement analysis.
 *
 * Series:
 * - US equity: Kenneth French broad US market return (Mkt-RF + RF)
 * - International equity: Kenneth French EAFE-plus-Canada market return
 * - Bonds: Shiller synthetic 10-year US government-bond total return
 * - TIPS: 10-year constant-maturity real bond total return, derived from the
 *   FRED DFII10 real yield and indexed by the same CPI (2003-02 onward)
 * - Cash: Kenneth French one-month Treasury-bill return (RF)
 * - Inflation: monthly change in Shiller CPI
 *
 * Source snapshots are refreshed separately with `npm run refresh:market-datasets`.
 * Runtime analysis never calls these external sites.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const DATASET_DIR = path.join(__dirname, '../src/datasets');
const SHILLER_PATH = path.join(DATASET_DIR, 'ie_data.xls');
const FRENCH_US_PATH = path.join(DATASET_DIR, 'F-F_Research_Data_Factors.csv');
const FRENCH_INTERNATIONAL_PATH = path.join(DATASET_DIR, 'F-F_International_Indices.dat');
const FRED_TIPS_REAL_YIELD_PATH = path.join(DATASET_DIR, 'DFII10.csv');
const SOURCE_MANIFEST_PATH = path.join(DATASET_DIR, 'source-manifest.json');
const OUTPUT_PATH = path.join(__dirname, '../data/historical_market_returns.csv');
const OUTPUT_METADATA_PATH = path.join(__dirname, '../data/historical_market_returns.metadata.json');

const SHILLER_DATA_ROW = 8;
const SHILLER_COL = { DATE: 0, CPI: 4, BOND_RETURNS: 17 };

export interface ShillerMonthlyRow {
  date: string;
  bonds: number;
  inflation: number;
}

export interface FrenchUsMonthlyRow {
  date: string;
  usEquity: number;
  cash: number;
}

export interface UnifiedMonthlyRow {
  date: string;
  usEquity: number;
  internationalEquity: number | null;
  bonds: number;
  tips: number | null;
  cash: number;
  inflation: number;
}

/**
 * Maturity of the synthetic TIPS bond, in years.
 *
 * Ten, to match the nominal bond series rather than to match any TIPS index.
 * The engine represents TIPS by the nominal series wherever real yields do not
 * reach, and a splice between a 10-year bond and a 7-year index would put a
 * duration step at the join that no market event produced. Matching the
 * nominal sleeve makes the substitution a change of one variable.
 *
 * The consequence is a series more rate-sensitive than a TIPS fund: measured
 * against the published index this reads -17.9% for 2022 where the index reads
 * -11.9%, and -12.4% for 2013 against -8.6%. Overstating the drawdown lowers a
 * projected success rate, so the error runs the safe way.
 */
const TIPS_MATURITY_YEARS = 10;

interface SourceManifestEntry {
  provider: string;
  file: string;
  documentationUrl: string;
  downloadUrl: string;
  retrievedAt: string;
  sourceVintage: string;
  firstObservation: string;
  lastObservation: string;
  sha256: string;
}

interface SourceManifest {
  schemaVersion: number;
  sources: Record<string, SourceManifestEntry>;
}

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
  sources: Record<string, SourceManifestEntry>;
  methodology: {
    rollingWindows: string;
    internationalAvailability: string;
    tipsAvailability: string;
  };
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function monthOrdinal(date: string): number {
  const [year, month] = date.split('-').map(Number);
  return year * 12 + month - 1;
}

function assertContiguous(dates: string[], label: string): void {
  const seen = new Set<string>();
  for (let index = 0; index < dates.length; index++) {
    const date = dates[index];
    if (seen.has(date)) throw new Error(`${label} contains duplicate month ${date}`);
    seen.add(date);
    if (index > 0 && monthOrdinal(date) !== monthOrdinal(dates[index - 1]) + 1) {
      throw new Error(`${label} is not contiguous between ${dates[index - 1]} and ${date}`);
    }
  }
}

function shillerMonth(value: unknown): string | null {
  if (typeof value === 'number') {
    const year = Math.floor(value);
    const month = Math.round((value - year) * 100);
    return month >= 1 && month <= 12
      ? `${year}-${String(month).padStart(2, '0')}`
      : null;
  }
  const match = String(value || '').trim().match(/^(\d{4})\.(\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, '0')}` : null;
}

export function loadShillerData(filePath = SHILLER_PATH): ShillerMonthlyRow[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets.Data;
  if (!sheet) throw new Error('Shiller Data sheet not found');

  const rows: ShillerMonthlyRow[] = [];
  let previousDate: string | null = null;
  let previousCpi: number | null = null;
  let previousBondGrossReturn: number | null = null;

  for (let row = SHILLER_DATA_ROW; ; row++) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r: row, c: SHILLER_COL.DATE })];
    if (!dateCell || dateCell.v === undefined || dateCell.v === null) break;
    const date = shillerMonth(dateCell.v);
    if (!date) continue;

    const cpi = Number(sheet[XLSX.utils.encode_cell({ r: row, c: SHILLER_COL.CPI })]?.v);
    const currentBondGrossReturn = Number(
      sheet[XLSX.utils.encode_cell({ r: row, c: SHILLER_COL.BOND_RETURNS })]?.v
    );

    if (previousDate && previousCpi !== null && previousBondGrossReturn !== null) {
      if (!Number.isFinite(cpi) || cpi <= 0) break;
      rows.push({
        date,
        // Shiller row t's bond cell is the return from t to t+1. Therefore the
        // return earned into the current month is stored on the previous row.
        bonds: previousBondGrossReturn - 1,
        inflation: cpi / previousCpi - 1,
      });
    }

    previousDate = date;
    previousCpi = Number.isFinite(cpi) && cpi > 0 ? cpi : null;
    previousBondGrossReturn = Number.isFinite(currentBondGrossReturn)
      ? currentBondGrossReturn
      : null;
  }

  assertContiguous(rows.map(row => row.date), 'Shiller monthly return data');
  return rows;
}

export function loadFrenchUsData(filePath = FRENCH_US_PATH): FrenchUsMonthlyRow[] {
  const rows: FrenchUsMonthlyRow[] = [];
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const parts = line.split(',').map(value => value.trim());
    if (!/^\d{6}$/.test(parts[0] || '') || parts.length < 5) continue;

    const mktRf = Number(parts[1]);
    const rf = Number(parts[4]);
    if (!Number.isFinite(mktRf) || !Number.isFinite(rf) || mktRf <= -99 || rf <= -99) {
      throw new Error(`Invalid Kenneth French US factor row: ${line}`);
    }
    rows.push({
      date: `${parts[0].slice(0, 4)}-${parts[0].slice(4)}`,
      // Rm-Rf and RF are simple monthly percentage returns over the same month.
      usEquity: (mktRf + rf) / 100,
      cash: rf / 100,
    });
  }
  assertContiguous(rows.map(row => row.date), 'Kenneth French US factor data');
  return rows;
}

export function loadFrenchInternationalData(filePath = FRENCH_INTERNATIONAL_PATH): Map<string, number> {
  const rows = new Map<string, number>();
  let started = false;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(\d{6})\s+(-?\d+(?:\.\d+)?)/);
    if (!match) {
      if (started) break;
      continue;
    }
    started = true;
    const marketReturn = Number(match[2]);
    if (!Number.isFinite(marketReturn) || marketReturn <= -99) {
      throw new Error(`Invalid Kenneth French international market row: ${line}`);
    }
    rows.set(`${match[1].slice(0, 4)}-${match[1].slice(4)}`, marketReturn / 100);
  }
  assertContiguous(Array.from(rows.keys()), 'Kenneth French international index data');
  return rows;
}

/**
 * Month-end real yields, as fractions, from the FRED daily series.
 *
 * Month-end rather than a monthly average because the return being built is
 * the change between two month boundaries; averaging would blur the price move
 * this measures across the month it happened in. Market holidays arrive as
 * ".", and the last quoted day of each month wins.
 */
export function loadTipsRealYields(filePath = FRED_TIPS_REAL_YIELD_PATH): Map<string, number> {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const header = (lines[0] || '').split(',').map(value => value.trim());
  const valueIndex = header.indexOf('DFII10');
  if (valueIndex < 1) throw new Error('FRED real-yield snapshot has no DFII10 column');

  const byMonth = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    const date = (parts[0] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const cell = (parts[valueIndex] || '').trim();
    // A market holiday is an empty cell, and `Number('')` is 0 -- which is
    // finite, and would be taken as a real 0% yield. When such a row ends a
    // month it invents a yield collapse and a reversal the month after: the
    // 2004-05 and 2024-03 month-ends both land on holidays, and reading them
    // as zero produced +21.8% and +20.0% months against a true range under 9%.
    if (cell === '' || !Number.isFinite(Number(cell))) continue;
    byMonth.set(date.slice(0, 7), Number(cell) / 100);
  }
  if (byMonth.size < 200) {
    throw new Error(`FRED real-yield snapshot covers only ${byMonth.size} months`);
  }
  return byMonth;
}

/**
 * One month of total return on a constant-maturity par bond, priced exactly.
 *
 * Buy a par bond yielding `startYield` with semiannual coupons, hold one
 * month, then value what is left -- nineteen-and-a-fraction coupons plus
 * principal -- at the new yield. The dirty price carries the accrued coupon,
 * so the difference from par is the whole return.
 *
 * Negative yields are priced, not rejected. Real yields were below zero for 48
 * months between 2011 and 2022, and a par bond with a negative coupon is the
 * right instrument for the job: an issued TIPS would carry the 0.125% floor
 * coupon and a premium price, but its duration -- the thing this series exists
 * to express -- is what the par-bond arithmetic gives.
 */
export function parBondMonthlyReturn(
  startYield: number,
  endYield: number,
  maturityYears = TIPS_MATURITY_YEARS,
): number {
  const couponPerPeriod = (startYield / 2) * 100;
  const ratePerPeriod = endYield / 2;
  if (ratePerPeriod <= -1) throw new Error(`Unusable bond yield: ${endYield}`);
  const periods = Math.round(maturityYears * 2);
  // A month is a third of a semiannual period.
  const elapsed = (1 / 12) / 0.5;

  let price = 0;
  for (let period = 1; period <= periods; period++) {
    price += couponPerPeriod / (1 + ratePerPeriod) ** (period - elapsed);
  }
  price += 100 / (1 + ratePerPeriod) ** (periods - elapsed);
  return price / 100 - 1;
}

/**
 * Nominal TIPS total return for each month real yields cover.
 *
 * Real return first, from the yield move, then indexed by the month's CPI
 * change: a TIPS pays a real coupon on a principal that tracks the index, so
 * its nominal return is the real return compounded with realized inflation.
 * The same CPI the `inflation` column carries is used, so the two columns
 * cannot disagree about what prices did.
 *
 * The indexation the Treasury actually applies lags CPI by about three months,
 * a refinement this leaves out. It shifts the month a given price move lands
 * in; it does not change the level, and the engine reads decade-long sequences
 * rather than single months.
 */
export function buildTipsReturns(
  realYields: Map<string, number>,
  inflationByMonth: Map<string, number>,
): Map<string, number> {
  const months = Array.from(realYields.keys()).sort();
  const returns = new Map<string, number>();
  for (let index = 1; index < months.length; index++) {
    const previous = months[index - 1];
    const current = months[index];
    // A hole in the real-yield series must not silently become a two-month
    // return attributed to one month.
    if (monthOrdinal(current) !== monthOrdinal(previous) + 1) continue;
    const inflation = inflationByMonth.get(current);
    if (inflation === undefined) continue;
    const realReturn = parBondMonthlyReturn(
      realYields.get(previous) as number,
      realYields.get(current) as number,
    );
    returns.set(current, (1 + realReturn) * (1 + inflation) - 1);
  }
  return returns;
}

function readAndVerifySourceManifest(): SourceManifest {
  const manifest = JSON.parse(fs.readFileSync(SOURCE_MANIFEST_PATH, 'utf8')) as SourceManifest;
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported market source manifest schema');
  for (const source of Object.values(manifest.sources)) {
    const resolved = path.join(__dirname, '..', source.file);
    const actualHash = sha256File(resolved);
    if (actualHash !== source.sha256) {
      throw new Error(`Source hash mismatch for ${source.file}; refresh source snapshots before building`);
    }
  }
  return manifest;
}

export function buildUnifiedRows(
  shiller = loadShillerData(),
  frenchUs = loadFrenchUsData(),
  frenchInternational = loadFrenchInternationalData(),
  tipsRealYields = loadTipsRealYields()
): UnifiedMonthlyRow[] {
  const shillerByDate = new Map(shiller.map(row => [row.date, row]));
  const tips = buildTipsReturns(
    tipsRealYields,
    new Map(shiller.map(row => [row.date, row.inflation])),
  );
  const rows = frenchUs.flatMap(row => {
    const shillerRow = shillerByDate.get(row.date);
    if (!shillerRow) return [];
    return [{
      date: row.date,
      usEquity: row.usEquity,
      internationalEquity: frenchInternational.get(row.date) ?? null,
      bonds: shillerRow.bonds,
      tips: tips.get(row.date) ?? null,
      cash: row.cash,
      inflation: shillerRow.inflation,
    }];
  });
  if (rows.length < 1_000) throw new Error(`Unified history contains only ${rows.length} months`);
  assertContiguous(rows.map(row => row.date), 'Unified historical market data');

  const internationalMonths = rows.filter(row => row.internationalEquity !== null);
  if (internationalMonths.length < 500) {
    throw new Error(`Unified history contains only ${internationalMonths.length} international months`);
  }
  const tipsMonths = rows.filter(row => row.tips !== null);
  if (tipsMonths.length < 200) {
    throw new Error(`Unified history contains only ${tipsMonths.length} TIPS months`);
  }
  // Both short series are edge-anchored: the engine proxies only outside a
  // series' own span, so an interior hole would be read as the span continuing
  // and quietly proxied nowhere.
  for (const [label, key] of [['international', 'internationalEquity'], ['TIPS', 'tips']] as const) {
    const present = rows.map(row => row[key] !== null);
    const first = present.indexOf(true);
    const last = present.lastIndexOf(true);
    if (present.slice(first, last + 1).some(value => !value)) {
      throw new Error(`Unified history has a gap inside the ${label} series`);
    }
  }
  return rows;
}

function rangeFor(rows: UnifiedMonthlyRow[], predicate: (row: UnifiedMonthlyRow) => boolean) {
  const matching = rows.filter(predicate);
  if (matching.length === 0) throw new Error('Cannot describe an empty historical series');
  return { firstMonth: matching[0].date, lastMonth: matching[matching.length - 1].date };
}

function buildMetadata(rows: UnifiedMonthlyRow[], manifest: SourceManifest): HistoricalDatasetMetadata {
  const allRange = rangeFor(rows, () => true);
  const internationalRange = rangeFor(rows, row => row.internationalEquity !== null);
  const tipsRange = rangeFor(rows, row => row.tips !== null);
  const retrievalDates = Object.values(manifest.sources)
    .map(source => source.retrievedAt)
    .sort();
  const retrievedAt = retrievalDates[retrievalDates.length - 1] || '';
  return {
    schemaVersion: 2,
    ...allRange,
    rowCount: rows.length,
    generatedFromSourceRetrieval: retrievedAt,
    series: {
      us_equity: {
        source: 'frenchUsFactors',
        description: 'Value-weighted return of the broad US market, calculated as Mkt-RF plus RF',
        ...allRange,
      },
      intl_equity: {
        source: 'frenchInternationalIndices',
        description: 'Value-weighted EAFE-plus-Canada market return in US dollars',
        ...internationalRange,
      },
      bonds: {
        source: 'shiller',
        description: 'Synthetic 10-year US government-bond total return aligned to the month earned',
        ...allRange,
      },
      tips: {
        source: 'fredTipsRealYield',
        description:
          'Synthetic 10-year constant-maturity TIPS total return: the real return implied by the ' +
          'DFII10 real yield, indexed by the same monthly CPI change the inflation column carries',
        ...tipsRange,
      },
      cash: {
        source: 'frenchUsFactors',
        description: 'One-month US Treasury-bill return (RF)',
        ...allRange,
      },
      inflation: {
        source: 'shiller',
        description: 'Monthly change in US CPI',
        ...allRange,
      },
    },
    sources: manifest.sources,
    methodology: {
      rollingWindows: 'Monthly rolling start dates overlap and are not statistically independent observations.',
      internationalAvailability:
        'Rows outside the French international index range contain NA for international equity and are excluded when that sleeve is active.',
      tipsAvailability:
        'TIPS real yields begin in 2003. Earlier rows contain NA, and the engine represents the ' +
        'sleeve with the nominal bond series there, reporting the substitution. Those months show ' +
        'no inflation protection the nominal series does not have, which understates TIPS in the ' +
        'inflationary sequences and so lowers rather than raises a projected success rate.',
    },
  };
}

export function serializeRows(rows: UnifiedMonthlyRow[]): string {
  const lines = ['date,us_equity,intl_equity,bonds,tips,cash,inflation'];
  for (const row of rows) {
    lines.push([
      row.date,
      row.usEquity.toFixed(6),
      row.internationalEquity === null ? 'NA' : row.internationalEquity.toFixed(6),
      row.bonds.toFixed(6),
      row.tips === null ? 'NA' : row.tips.toFixed(6),
      row.cash.toFixed(6),
      row.inflation.toFixed(6),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}

function geometricAnnualized(rows: UnifiedMonthlyRow[], value: (row: UnifiedMonthlyRow) => number): number {
  const logGrowth = rows.reduce((total, row) => total + Math.log1p(value(row)), 0);
  return Math.expm1((logGrowth / rows.length) * 12);
}

function sanityCheck(rows: UnifiedMonthlyRow[]): void {
  for (const row of rows) {
    const values = [row.usEquity, row.bonds, row.cash, row.inflation];
    if (row.tips !== null) values.push(row.tips);
    if (values.some(value => !Number.isFinite(value) || value <= -1)) {
      throw new Error(`Invalid unified return values for ${row.date}`);
    }
  }
  const annualizedUs = geometricAnnualized(rows, row => row.usEquity);
  const annualizedBonds = geometricAnnualized(rows, row => row.bonds);
  const annualizedCash = geometricAnnualized(rows, row => row.cash);
  const tipsRows = rows.filter(row => row.tips !== null);
  const annualizedTips = geometricAnnualized(tipsRows, row => row.tips as number);
  if (annualizedUs < 0.04 || annualizedUs > 0.15) {
    throw new Error(`US equity annualized sanity check failed: ${annualizedUs}`);
  }
  // Since 2003 TIPS have returned in the low single digits. A synthetic series
  // outside that band means the yield snapshot or the indexation is wrong, not
  // that the asset class did something remarkable.
  if (annualizedTips < 0 || annualizedTips > 0.08) {
    throw new Error(`TIPS annualized sanity check failed: ${annualizedTips}`);
  }
  // A single month outside this band is not a market event: a ten-year real
  // bond needs a move of well over a point in a month to lose a tenth of its
  // value, and no such month exists in the record. What does produce one is an
  // unreadable yield cell being taken as a number, so the check is on the
  // monthly extreme rather than only on the annualized average, which a pair
  // of equal and opposite fabrications leaves almost untouched.
  const worstTipsMonth = tipsRows.reduce(
    (worst, row) => Math.max(worst, Math.abs(row.tips as number)),
    0,
  );
  if (worstTipsMonth > 0.1) {
    const month = tipsRows.find(row => Math.abs(row.tips as number) === worstTipsMonth)?.date;
    throw new Error(
      `TIPS monthly sanity check failed: ${(worstTipsMonth * 100).toFixed(2)}% in ${month}`,
    );
  }
  console.log('Geometric annualized sanity check:');
  console.log(`  US equities: ${(annualizedUs * 100).toFixed(2)}%`);
  console.log(`  10-year government bonds: ${(annualizedBonds * 100).toFixed(2)}%`);
  console.log(
    `  10-year TIPS (${tipsRows.length} months): ${(annualizedTips * 100).toFixed(2)}%` +
    `, worst month ${(worstTipsMonth * 100).toFixed(2)}%`,
  );
  console.log(`  Treasury bills: ${(annualizedCash * 100).toFixed(2)}%`);
}

function main(): void {
  const manifest = readAndVerifySourceManifest();
  const rows = buildUnifiedRows();
  const metadata = buildMetadata(rows, manifest);
  sanityCheck(rows);
  fs.writeFileSync(OUTPUT_PATH, serializeRows(rows), 'utf8');
  fs.writeFileSync(OUTPUT_METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${rows.length} months (${metadata.firstMonth} through ${metadata.lastMonth})`);
  console.log(`International history: ${metadata.series.intl_equity.firstMonth} through ${metadata.series.intl_equity.lastMonth}`);
}

if (require.main === module) main();
