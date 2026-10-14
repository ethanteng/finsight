import {
  connectGa4,
  loadExportCoverage,
  loadGa4Visitors,
  VISITOR_CAP,
  type ExportCoverage,
  type Ga4Connection,
  type Ga4VisitorLoad,
  type VisitorScan,
} from '../marketing-analytics/adapters/ga4-visitors';
import { reportingLagDays } from '../marketing-analytics/adapters/ga4-bigquery';
import { buildVisitorReport, unavailableVisitorReport, visitorCohortStarts } from './visitors';
import type { VisitorReport, VisitorWindow } from './types';

/**
 * Which tables exist, and each scan of them, are kept for a few minutes:
 * moving between filters and column grains re-reads them rather than
 * BigQuery. Refresh reads both again, which is how the newest streamed
 * events reach the page.
 */
const CACHE_MS = 10 * 60 * 1000;
const CACHE_ENTRIES = 8;

interface Cached<T> {
  key: string;
  at: number;
  value: Promise<T>;
}

const loads = new Map<string, Cached<Ga4VisitorLoad>>();
let coverageCache: Cached<ExportCoverage> | null = null;

const NOTES = [
  'A visitor is one browser’s GA4 cookie, not a person. Safari keeps that cookie for 7 days, and phones, private windows and ad blockers start new ones, so returns after the first week are a floor.',
  'Activity counts until the browser signs up or reaches the app; after that it belongs to an account and appears in Engagement and Activation. Signed in means the browser reached the app without signing up in it: an existing account.',
  'Coast FIRE runs are submitted calculations, not the example shown on arrival. Cash flow check clicks before the cash_flow_check_click tag existed come from GA4’s automatic outbound-click event, when it recorded them. Coffee counts opening the Buy Me a Coffee panel; whether anyone paid is only in Buy Me a Coffee.',
  'Activity is dated by the session it happened in. Sessions classified as automated, test or off-site are left out, as on the marketing pages.',
];

const STREAMING_NOTE = 'Visits since the newest daily export come from GA4’s streaming export and are provisional until the daily export replaces them: late events can still arrive, and a new visitor’s channel and campaign can read as Direct until then, because streaming leaves out traffic sources for new users.';

/**
 * Where the data ends, so periods ending later count as in progress: the
 * newest streamed event (never later than the request), else midnight UTC
 * after the newest daily table. Null when the export holds nothing yet.
 */
export function visitorDataThrough(
  coverage: Pick<ExportCoverage, 'dailyEnd' | 'streamedThrough'>,
  requestedAt: Date,
): Date | null {
  if (coverage.streamedThrough) return new Date(Math.min(coverage.streamedThrough.getTime(), requestedAt.getTime()));
  if (!coverage.dailyEnd) return null;
  const date = new Date(`${coverage.dailyEnd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function describeCoverage(coverage: ExportCoverage, streamedAsOf: Date | null): string {
  const late = 'Daily tables can still receive late events for up to 3 days.';
  if (coverage.source === 'lag') {
    return `GA4 daily export through ${coverage.dailyEnd}; ${reportingLagDays()}-day availability lag applied. ${late} The export’s tables could not be listed (${coverage.listingError}), so nothing streamed is read: the service account needs BigQuery Data Viewer or Metadata Viewer on the dataset.`;
  }
  if (coverage.streamedThrough && streamedAsOf) {
    return `GA4 daily export through ${coverage.dailyEnd ?? 'no day yet'}, and streaming export through ${streamedAsOf.toISOString()}. ${late}`;
  }
  // Tables can exist before the first event lands. That is not "streaming is off".
  if (coverage.streamingDays.length > 0) {
    return `GA4 daily export through ${coverage.dailyEnd}. ${late} Streaming tables are in the dataset but have no events yet, so same-day visits appear once events stream in.`;
  }
  return `GA4 daily export through ${coverage.dailyEnd}. ${late} No streaming tables are in the dataset, so later visits appear once the next daily export lands; turn on streaming export in GA4 to see them within minutes.`;
}

function hasCachedCoverage(connection: Ga4Connection): boolean {
  return coverageCache !== null
    && coverageCache.key === `${connection.projectId}.${connection.datasetId}`
    && Date.now() - coverageCache.at < CACHE_MS;
}

function cachedCoverage(connection: Ga4Connection, fresh: boolean): Promise<ExportCoverage> {
  const key = `${connection.projectId}.${connection.datasetId}`;
  if (coverageCache && !fresh && hasCachedCoverage(connection)) return coverageCache.value;
  const entry: Cached<ExportCoverage> = { key, at: Date.now(), value: loadExportCoverage(connection) };
  coverageCache = entry;
  entry.value.catch(() => {
    if (coverageCache === entry) coverageCache = null;
  });
  return entry.value;
}

/**
 * The cutoff is in the key: a scan read before newer events streamed in
 * must not be paired with a cutoff that counts them as read.
 */
function loadKey(connection: Ga4Connection, scan: VisitorScan, through: Date): string {
  return [connection.projectId, connection.datasetId, scan.start, scan.dailyEnd, scan.streamingDays.join(','), through.toISOString()].join('|');
}

function hasCachedLoad(key: string): boolean {
  const hit = loads.get(key);
  return hit !== undefined && Date.now() - hit.at < CACHE_MS;
}

function cachedLoad(connection: Ga4Connection, scan: VisitorScan, through: Date, fresh: boolean): Promise<Ga4VisitorLoad> {
  const key = loadKey(connection, scan, through);
  const hit = loads.get(key);
  if (hit && !fresh && hasCachedLoad(key)) return hit.value;
  const value = loadGa4Visitors(connection, scan);
  loads.set(key, { key, at: Date.now(), value });
  // Keep only answers worth reusing; a failure is retried on the next request.
  value.then(result => {
    if (result.state !== 'live' && loads.get(key)?.value === value) loads.delete(key);
  }, () => {
    // A newer scan may already own this key; only drop the one that failed.
    if (loads.get(key)?.value === value) loads.delete(key);
  });
  while (loads.size > CACHE_ENTRIES) loads.delete(loads.keys().next().value as string);
  return value;
}

/** The scan a window needs over these tables, and where its data ends; null when there are none yet. */
function planScan(coverage: ExportCoverage, window: VisitorWindow, requestedAt: Date): { now: Date; scan: VisitorScan } | null {
  const now = visitorDataThrough(coverage, requestedAt);
  if (!now) return null;
  return {
    now,
    scan: {
      start: visitorCohortStarts(now, window)[0].toISOString().slice(0, 10),
      dailyEnd: coverage.dailyEnd,
      // Streaming tables with no events in them yet have nothing to add.
      streamingDays: coverage.streamedThrough ? coverage.streamingDays : [],
    },
  };
}

export function clearVisitorCache(): void {
  loads.clear();
  coverageCache = null;
}

export async function getVisitorReport(
  window: VisitorWindow,
  options: { fresh?: boolean; membersFor?: string | null } = {},
): Promise<VisitorReport> {
  const generatedAt = new Date();
  const fresh = options.fresh ?? false;
  const connect = await connectGa4();
  if (connect.state !== 'connected') return unavailableVisitorReport(window, connect.state, connect.detail, null, generatedAt);

  let coverage: ExportCoverage;
  let plan: ReturnType<typeof planScan>;
  try {
    const remembered = !fresh && hasCachedCoverage(connect.connection);
    coverage = await cachedCoverage(connect.connection, fresh);
    plan = planScan(coverage, window, generatedAt);
    // A remembered table listing is trusted only for a scan already read
    // with it. GA4 swaps a day's streaming table for its daily one without
    // notice, so a scan about to be read lists the tables again: otherwise it
    // could look for a streaming table that is gone and miss that day.
    if (remembered && plan && !hasCachedLoad(loadKey(connect.connection, plan.scan, plan.now))) {
      coverage = await cachedCoverage(connect.connection, true);
      plan = planScan(coverage, window, generatedAt);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unable to read the GA4 streaming export.';
    return unavailableVisitorReport(window, 'error', detail, null, generatedAt);
  }
  if (!plan) {
    return unavailableVisitorReport(
      window,
      'needs_configuration',
      'The GA4 dataset has no export tables yet. The first daily table lands the day after the BigQuery link is made, or within minutes with streaming export on.',
      null,
      generatedAt,
    );
  }
  const { now, scan } = plan;
  const load = await cachedLoad(connect.connection, scan, now, fresh);
  if (load.state !== 'live') return unavailableVisitorReport(window, load.state, load.detail, coverage.dailyEnd, generatedAt);
  if (load.truncated) {
    return unavailableVisitorReport(
      window,
      'truncated',
      `More than ${VISITOR_CAP.toLocaleString('en-US')} browsers visited in this window, more than one report can hold. Show fewer cohorts or use a shorter grain.`,
      coverage.dailyEnd,
      generatedAt,
    );
  }
  // `now` is the streamed event capped at the request. The header quotes it,
  // so a client clock ahead of the server cannot advertise a future "as of".
  const streamedAsOf = coverage.streamedThrough ? now : null;
  return buildVisitorReport({
    visitors: load.visitors,
    window,
    now,
    generatedAt,
    reportEnd: coverage.dailyEnd,
    streamedThrough: streamedAsOf,
    detail: describeCoverage(coverage, streamedAsOf),
    notes: coverage.streamedThrough ? [...NOTES, STREAMING_NOTE] : NOTES,
    membersFor: options.membersFor ?? null,
  });
}
