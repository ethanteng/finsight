#!/usr/bin/env npx ts-node
/**
 * Build unified historical market returns dataset from local sources.
 *
 * Transforms src/datasets/ (Shiller ie_data.xls, Kenneth French F-F_Research_Data_Factors.csv)
 * into data/historical_market_returns.csv.
 *
 * No downloads or API calls. Fully deterministic.
 *
 * Output schema: date,us_equity,intl_equity,bonds,cash,inflation
 * All values are monthly returns as decimals.
 *
 * Data sources:
 * - US equity, bonds, inflation: Shiller ie_data.xls
 * - Cash: Kenneth French RF (1-month T-bill); intl: US equity proxy (see below)
 *
 * International equity: intl_equity = us_equity. International diversification is not
 * currently modeled. Mkt-RF is US market excess return, not international.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const SHILLER_PATH = path.join(__dirname, '../src/datasets/ie_data.xls');
const FRENCH_PATH = path.join(__dirname, '../src/datasets/F-F_Research_Data_Factors.csv');
const OUTPUT_PATH = path.join(__dirname, '../data/historical_market_returns.csv');

// Shiller Data sheet: row 7 = headers, row 8+ = data
// Col 0=Date, 1=P, 2=D (trailing 12mo), 3=E, 4=CPI, 6=GS10, 17=Bond Returns (1+r)
const SHILLER_DATA_ROW = 8;
const SHILLER_COL = { DATE: 0, P: 1, D: 2, CPI: 4, GS10: 6, BOND_RETURNS: 17 };

interface MonthlyRow {
  year: number;
  month: number;
  dateStr: string;
  usEquity: number;
  bonds: number;
  inflation: number;
}

function loadShillerData(): MonthlyRow[] {
  const wb = XLSX.readFile(SHILLER_PATH);
  const sheet = wb.Sheets['Data'];
  if (!sheet) throw new Error('Shiller Data sheet not found');

  const rows: MonthlyRow[] = [];
  let prevP: number | null = null;
  let prevD: number | null = null;
  let prevCpi: number | null = null;

  for (let r = SHILLER_DATA_ROW; ; r++) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r, c: SHILLER_COL.DATE })];
    if (!dateCell || dateCell.v === undefined || dateCell.v === null) break;

    const dateVal = dateCell.v;
    let year: number;
    let month: number;
    if (typeof dateVal === 'number') {
      year = Math.floor(dateVal);
      month = Math.round((dateVal - year) * 100);
    } else {
      const parts = String(dateVal).split('.');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1] || '1', 10);
    }
    if (month < 1 || month > 12) continue;

    if (year < 1970) continue;

    const p = parseFloat(sheet[XLSX.utils.encode_cell({ r, c: SHILLER_COL.P })]?.v);
    const d = parseFloat(sheet[XLSX.utils.encode_cell({ r, c: SHILLER_COL.D })]?.v);
    const cpi = parseFloat(sheet[XLSX.utils.encode_cell({ r, c: SHILLER_COL.CPI })]?.v);
    const bondReturnsCell = sheet[XLSX.utils.encode_cell({ r, c: SHILLER_COL.BOND_RETURNS })]?.v;

    if (isNaN(p) || isNaN(cpi)) continue;
    if (prevP === null || prevCpi === null) {
      prevP = p;
      prevD = d;
      prevCpi = cpi;
      continue;
    }

    // US equity: total_return = (price_t + dividend_t/12) / price_(t-1) - 1
    // D is trailing 12-month dividend total; monthly = D/12
    const monthlyDividend = (isNaN(d) ? 0 : d) / 12;
    const priceReturn = p / prevP - 1;
    const dividendYield = monthlyDividend / prevP;
    const usEquity = priceReturn + dividendYield;

    // Inflation: CPI_t / CPI_(t-1) - 1
    const inflation = cpi / prevCpi - 1;

    // Bonds: Shiller col 17 "Bond Returns" is (1 + monthly_return); bond_return = value - 1.
    // This is a proper return series, not yield. Fallback: GS10 yield as monthly return proxy.
    let bonds: number;
    if (bondReturnsCell != null && typeof bondReturnsCell === 'number') {
      bonds = bondReturnsCell - 1;
    } else {
      const gs10 = parseFloat(sheet[XLSX.utils.encode_cell({ r, c: SHILLER_COL.GS10 })]?.v) || 5;
      bonds = Math.pow(1 + gs10 / 100, 1 / 12) - 1;
    }

    prevP = p;
    prevD = d;
    prevCpi = cpi;

    rows.push({
      year,
      month,
      dateStr: `${year}-${String(month).padStart(2, '0')}`,
      usEquity,
      bonds,
      inflation,
    });
  }

  return rows;
}

interface FrenchRow {
  year: number;
  month: number;
  dateStr: string;
  mktRf: number;
  rf: number;
}

function loadFrenchData(): FrenchRow[] {
  const content = fs.readFileSync(FRENCH_PATH, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  const rows: FrenchRow[] = [];

  for (const line of lines) {
    if (line.startsWith('The ') || line.startsWith('Copyright') || line.startsWith(',')) continue;
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length < 5) continue;

    const dateStr = parts[0];
    if (!/^\d{6}$/.test(dateStr)) continue;

    const year = parseInt(dateStr.slice(0, 4), 10);
    const month = parseInt(dateStr.slice(4, 6), 10);
    const mktRf = parseFloat(parts[1]);
    const rf = parseFloat(parts[4]);

    if (year < 1970 || isNaN(mktRf) || isNaN(rf)) continue;

    rows.push({
      year,
      month,
      dateStr: `${year}-${String(month).padStart(2, '0')}`,
      mktRf,
      rf,
    });
  }

  return rows;
}

function buildUnifiedDataset(): string {
  const shiller = loadShillerData();
  const frenchMap = new Map<string, FrenchRow>();
  for (const row of loadFrenchData()) {
    frenchMap.set(row.dateStr, row);
  }

  const lines: string[] = ['date,us_equity,intl_equity,bonds,cash,inflation'];

  for (const row of shiller) {
    const french = frenchMap.get(row.dateStr);
    // intl_equity = us_equity (international diversification not modeled; Mkt-RF is US, not intl)
    const intlEquity = row.usEquity;
    const cash = french ? french.rf / 100 : 0;

    lines.push(
      [
        row.dateStr,
        row.usEquity.toFixed(6),
        intlEquity.toFixed(6),
        row.bonds.toFixed(6),
        cash.toFixed(6),
        row.inflation.toFixed(6),
      ].join(',')
    );
  }

  return lines.join('\n');
}

function sanityCheck(csvContent: string): void {
  const lines = csvContent.split('\n').filter((l) => l && !l.startsWith('date'));
  if (lines.length === 0) throw new Error('No data rows');

  let sumUs = 0;
  let sumBonds = 0;
  let sumCash = 0;
  let count = 0;

  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 6) continue;
    const us = parseFloat(parts[1]);
    const bonds = parseFloat(parts[3]);
    const cash = parseFloat(parts[4]);
    if (!isNaN(us) && !isNaN(bonds) && !isNaN(cash)) {
      sumUs += us;
      sumBonds += bonds;
      sumCash += cash;
      count++;
    }
  }

  if (count === 0) throw new Error('Sanity check: no valid data rows (need us_equity, bonds, cash)');

  const months = count;
  const years = months / 12;

  const annUs = Math.pow(1 + sumUs / count, 12) - 1;
  const annBonds = Math.pow(1 + sumBonds / count, 12) - 1;
  const annCash = Math.pow(1 + sumCash / count, 12) - 1;

  console.log('Sanity check (annualized returns):');
  console.log('  US equities:', (annUs * 100).toFixed(2) + '%');
  console.log('  Bonds:', (annBonds * 100).toFixed(2) + '%');
  console.log('  Cash:', (annCash * 100).toFixed(2) + '%');
  console.log('  Months:', months);

  if (annUs > 0.15) {
    console.warn('  WARNING: US equities >15% - check dividend handling (D/12)');
  }
  if (annUs < 0.05) {
    console.warn('  WARNING: US equities <5% - check data');
  }
}

function main(): void {
  console.log('Building historical market returns dataset...');
  console.log('  Shiller:', SHILLER_PATH);
  console.log('  French:', FRENCH_PATH);

  const csv = buildUnifiedDataset();
  sanityCheck(csv);

  fs.writeFileSync(OUTPUT_PATH, csv, 'utf-8');
  console.log('  Output:', OUTPUT_PATH);
  console.log('  Rows:', csv.split('\n').length - 1);
  console.log('Done.');
}

main();
