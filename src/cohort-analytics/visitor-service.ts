import {
  loadGa4Visitors,
  VISITOR_CAP,
  visitorReportEnd,
  type Ga4VisitorLoad,
  type VisitorScan,
} from '../marketing-analytics/adapters/ga4-visitors';
import { windowStart } from './engine';
import { buildVisitorReport, unavailableVisitorReport } from './visitors';
import type { VisitorReport, VisitorWindow } from './types';

/**
 * The export changes once a day, so a scan is kept for a few minutes: moving
 * between filters and column grains re-reads it rather than BigQuery.
 */
const CACHE_MS = 10 * 60 * 1000;
const CACHE_ENTRIES = 8;
const cache = new Map<string, { at: number; load: Promise<Ga4VisitorLoad> }>();

const NOTES = [
  'A visitor is one browser’s GA4 cookie, not a person. Safari keeps that cookie for 7 days, and phones, private windows and ad blockers start new ones, so returns after the first week are a floor.',
  'Activity counts until the browser signs up or reaches the app; after that it belongs to an account and appears in Engagement and Activation. Signed in means the browser reached the app without signing up in it: an existing account.',
  'Coast FIRE runs are submitted calculations, not the example shown on arrival. Cash flow check clicks before the cash_flow_check_click tag existed come from GA4’s automatic outbound-click event, when it recorded them. Coffee counts opening the Buy Me a Coffee panel; whether anyone paid is only in Buy Me a Coffee.',
  'Activity is dated by the session it happened in. Sessions classified as automated, test or off-site are left out, as on the marketing pages.',
];

/** Midnight UTC after the last complete export day: periods ending later are still in progress. */
export function visitorDataThrough(reportEnd: string): Date {
  const date = new Date(`${reportEnd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function cachedLoad(scan: VisitorScan, fresh: boolean): Promise<Ga4VisitorLoad> {
  const key = `${scan.start}|${scan.end}`;
  const hit = cache.get(key);
  if (hit && !fresh && Date.now() - hit.at < CACHE_MS) return hit.load;
  const load = loadGa4Visitors(scan);
  cache.set(key, { at: Date.now(), load });
  // Keep only answers worth reusing; a failure is retried on the next request.
  load.then(result => {
    if (result.state !== 'live' && cache.get(key)?.load === load) cache.delete(key);
  }, () => cache.delete(key));
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  return load;
}

export function clearVisitorCache(): void {
  cache.clear();
}

export async function getVisitorReport(
  window: VisitorWindow,
  options: { fresh?: boolean; membersFor?: string | null } = {},
): Promise<VisitorReport> {
  const generatedAt = new Date();
  const reportEnd = visitorReportEnd();
  const now = visitorDataThrough(reportEnd);
  const scan = { start: windowStart(window, now).toISOString().slice(0, 10), end: reportEnd };
  const load = await cachedLoad(scan, options.fresh ?? false);
  if (load.state !== 'live') return unavailableVisitorReport(window, load.state, load.detail, reportEnd, generatedAt);
  if (load.truncated) {
    return unavailableVisitorReport(
      window,
      'truncated',
      `More than ${VISITOR_CAP.toLocaleString('en-US')} browsers visited in this window, more than one report can hold. Show fewer cohorts or use a shorter grain.`,
      reportEnd,
      generatedAt,
    );
  }
  return buildVisitorReport({
    visitors: load.visitors,
    window,
    now,
    generatedAt,
    reportEnd,
    detail: load.detail,
    notes: NOTES,
    membersFor: options.membersFor ?? null,
  });
}
