#!/usr/bin/env npx ts-node
/**
 * Refresh the checked-in Shiller and Kenneth French source snapshots.
 *
 * The retirement engine stays offline at runtime. This script is the explicit,
 * reviewable network step used by maintainers before rebuilding the unified
 * historical return file.
 */

import axios from 'axios';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as XLSX from 'xlsx';

const DATASET_DIR = path.join(__dirname, '../src/datasets');
const SHILLER_PAGE_URL = 'https://shillerdata.com/';
const FRENCH_US_URL =
  'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip';
const FRENCH_INTERNATIONAL_URL =
  'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_International_Indices.zip';

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

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

async function download(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30_000,
    maxRedirects: 5,
    headers: { 'User-Agent': 'Ask-Linc-market-dataset-refresh/1.0' },
  });
  return Buffer.from(response.data);
}

function monthString(value: number): string {
  const year = Math.floor(value);
  const month = Math.round((value - year) * 100);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function inspectShillerWorkbook(content: Buffer): { first: string; last: string; vintage: string } {
  const workbook = XLSX.read(content, { type: 'buffer' });
  const sheet = workbook.Sheets.Data;
  if (!sheet) throw new Error('Downloaded Shiller workbook has no Data worksheet');

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const observations: number[] = [];
  for (let row = range.s.r; row <= range.e.r; row++) {
    const value = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]?.v;
    if (typeof value === 'number') observations.push(value);
  }
  if (observations.length < 1_000) {
    throw new Error(`Downloaded Shiller workbook has only ${observations.length} observations`);
  }
  const first = monthString(observations[0]);
  const last = monthString(observations[observations.length - 1]);
  return { first, last, vintage: last };
}

function inspectFrenchCsv(content: Buffer): { first: string; last: string; vintage: string } {
  const text = content.toString('utf8');
  const dates = Array.from(text.matchAll(/^\s*(\d{6})\s*,/gm), match => match[1]);
  if (dates.length < 1_000) throw new Error(`Downloaded French factor file has only ${dates.length} monthly rows`);
  const vintageMatch = text.match(/created using the (\d{6}) CRSP database/i);
  const vintage = vintageMatch?.[1] || dates[dates.length - 1];
  return {
    first: `${dates[0].slice(0, 4)}-${dates[0].slice(4)}`,
    last: `${dates[dates.length - 1].slice(0, 4)}-${dates[dates.length - 1].slice(4)}`,
    vintage: `${vintage.slice(0, 4)}-${vintage.slice(4)}`,
  };
}

function inspectInternationalFile(content: Buffer): { first: string; last: string; vintage: string } {
  const dates: string[] = [];
  let started = false;
  for (const line of content.toString('utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(\d{6})\s+/);
    if (match) {
      started = true;
      dates.push(match[1]);
    } else if (started) {
      break;
    }
  }
  if (dates.length < 500) {
    throw new Error(`Downloaded French international file has only ${dates.length} monthly rows`);
  }
  const last = dates[dates.length - 1];
  return {
    first: `${dates[0].slice(0, 4)}-${dates[0].slice(4)}`,
    last: `${last.slice(0, 4)}-${last.slice(4)}`,
    vintage: `${last.slice(0, 4)}-${last.slice(4)}`,
  };
}

function extractZipEntry(zip: Buffer, entry: string, tempDir: string): Buffer {
  const zipPath = path.join(tempDir, `${entry.replace(/[^a-z0-9]/gi, '_')}.zip`);
  fs.writeFileSync(zipPath, zip);
  return execFileSync('unzip', ['-p', zipPath, entry], { maxBuffer: 10 * 1024 * 1024 });
}

function normalizeTextSnapshot(content: Buffer): Buffer {
  const normalized = content
    .toString('utf8')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');
  return Buffer.from(normalized, 'utf8');
}

async function resolveShillerDownloadUrl(): Promise<string> {
  const homepage = (await download(SHILLER_PAGE_URL)).toString('utf8');
  const match = homepage.match(/href=["']([^"']*ie_data\.xls[^"']*)["']/i);
  if (!match) throw new Error('Could not find the ie_data.xls download link on shillerdata.com');
  const decoded = match[1].replace(/&amp;/g, '&');
  return new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded, SHILLER_PAGE_URL).toString();
}

async function main(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-linc-market-data-'));
  try {
    const shillerDownloadUrl = await resolveShillerDownloadUrl();
    const [shiller, frenchUsZip, frenchInternationalZip] = await Promise.all([
      download(shillerDownloadUrl),
      download(FRENCH_US_URL),
      download(FRENCH_INTERNATIONAL_URL),
    ]);
    const frenchUs = normalizeTextSnapshot(
      extractZipEntry(frenchUsZip, 'F-F_Research_Data_Factors.csv', tempDir)
    );
    const frenchInternational = normalizeTextSnapshot(
      extractZipEntry(frenchInternationalZip, 'Ind_all.Dat', tempDir)
    );

    const shillerInfo = inspectShillerWorkbook(shiller);
    const frenchUsInfo = inspectFrenchCsv(frenchUs);
    const frenchInternationalInfo = inspectInternationalFile(frenchInternational);
    const retrievedAt = new Date().toISOString();

    fs.writeFileSync(path.join(DATASET_DIR, 'ie_data.xls'), shiller);
    fs.writeFileSync(path.join(DATASET_DIR, 'F-F_Research_Data_Factors.csv'), frenchUs);
    fs.writeFileSync(path.join(DATASET_DIR, 'F-F_International_Indices.dat'), frenchInternational);

    const manifest: { schemaVersion: number; sources: Record<string, SourceManifestEntry> } = {
      schemaVersion: 1,
      sources: {
        shiller: {
          provider: 'Robert J. Shiller',
          file: 'src/datasets/ie_data.xls',
          documentationUrl: SHILLER_PAGE_URL,
          downloadUrl: shillerDownloadUrl,
          retrievedAt,
          sourceVintage: shillerInfo.vintage,
          firstObservation: shillerInfo.first,
          lastObservation: shillerInfo.last,
          sha256: sha256(shiller),
        },
        frenchUsFactors: {
          provider: 'Kenneth R. French Data Library',
          file: 'src/datasets/F-F_Research_Data_Factors.csv',
          documentationUrl:
            'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library/f-f_factors.html',
          downloadUrl: FRENCH_US_URL,
          retrievedAt,
          sourceVintage: frenchUsInfo.vintage,
          firstObservation: frenchUsInfo.first,
          lastObservation: frenchUsInfo.last,
          sha256: sha256(frenchUs),
        },
        frenchInternationalIndices: {
          provider: 'Kenneth R. French Data Library',
          file: 'src/datasets/F-F_International_Indices.dat',
          documentationUrl:
            'https://mba.tuck.dartmouth.edu/pages/Faculty/ken.french/Data_Library/int_index_port_formed.html',
          downloadUrl: FRENCH_INTERNATIONAL_URL,
          retrievedAt,
          sourceVintage: frenchInternationalInfo.vintage,
          firstObservation: frenchInternationalInfo.first,
          lastObservation: frenchInternationalInfo.last,
          sha256: sha256(frenchInternational),
        },
      },
    };
    fs.writeFileSync(
      path.join(DATASET_DIR, 'source-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8'
    );

    console.log('Refreshed market source snapshots:');
    for (const [key, source] of Object.entries(manifest.sources)) {
      console.log(`  ${key}: ${source.firstObservation} through ${source.lastObservation}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
