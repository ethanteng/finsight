#!/usr/bin/env npx ts-node
/**
 * Build the deterministic monthly return dataset used by retirement analysis.
 *
 * Series:
 * - US equity: Kenneth French broad US market return (Mkt-RF + RF)
 * - International equity: Kenneth French EAFE-plus-Canada market return
 * - Bonds: Shiller synthetic 10-year US government-bond total return
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
  cash: number;
  inflation: number;
}

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
  frenchInternational = loadFrenchInternationalData()
): UnifiedMonthlyRow[] {
  const shillerByDate = new Map(shiller.map(row => [row.date, row]));
  const rows = frenchUs.flatMap(row => {
    const shillerRow = shillerByDate.get(row.date);
    if (!shillerRow) return [];
    return [{
      date: row.date,
      usEquity: row.usEquity,
      internationalEquity: frenchInternational.get(row.date) ?? null,
      bonds: shillerRow.bonds,
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
    },
  };
}

export function serializeRows(rows: UnifiedMonthlyRow[]): string {
  const lines = ['date,us_equity,intl_equity,bonds,cash,inflation'];
  for (const row of rows) {
    lines.push([
      row.date,
      row.usEquity.toFixed(6),
      row.internationalEquity === null ? 'NA' : row.internationalEquity.toFixed(6),
      row.bonds.toFixed(6),
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
    if (values.some(value => !Number.isFinite(value) || value <= -1)) {
      throw new Error(`Invalid unified return values for ${row.date}`);
    }
  }
  const annualizedUs = geometricAnnualized(rows, row => row.usEquity);
  const annualizedBonds = geometricAnnualized(rows, row => row.bonds);
  const annualizedCash = geometricAnnualized(rows, row => row.cash);
  if (annualizedUs < 0.04 || annualizedUs > 0.15) {
    throw new Error(`US equity annualized sanity check failed: ${annualizedUs}`);
  }
  console.log('Geometric annualized sanity check:');
  console.log(`  US equities: ${(annualizedUs * 100).toFixed(2)}%`);
  console.log(`  10-year government bonds: ${(annualizedBonds * 100).toFixed(2)}%`);
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
