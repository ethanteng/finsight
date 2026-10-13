import type { TrafficQuality } from '../types';
import { assessTrafficQuality } from '../traffic-quality';
import type { VisitorActionCounts } from '../../cohort-analytics/types';
import {
  channelFor,
  cleanPath,
  getAccessToken,
  parseCredentials,
  reportingLagDays,
  subtractDays,
  todayInReportingTimeZone,
} from './ga4-bigquery';

/**
 * Signed-out visitors from the GA4 BigQuery export, one row per browser.
 *
 * GA4 is the only record of someone who has not signed up: the first-party
 * tables deliberately keep no visitor or session identifier. A "visitor" is
 * GA4's `user_pseudo_id`, the analytics cookie of one browser.
 *
 * Each browser's activity is counted only until it becomes an account's:
 * the first `sign_up`, `trial_login_success`, or `/app` page view. Sessions
 * that start after that are left out, and actions inside the session that
 * crossed it are counted only before it.
 */

/** More browsers than this and the report shows nothing rather than an undercount. */
export const VISITOR_CAP = 100_000;
const PAGE_SIZE = 20_000;
/** Past every real timestamp, so a browser with no account has no account moment. */
const NEVER = '9223372036854775807';

export interface Ga4VisitorSession {
  sessionId: string;
  startedAt: Date;
  /** GA4's `ga_session_number`: 1 for the browser's first session ever. */
  sessionNumber: number | null;
  landingPage: string;
  source: string;
  medium: string;
  campaign: string;
  channel: string;
  device: string;
  country: string;
  pageViews: number;
  engagementSeconds: number;
  actions: VisitorActionCounts;
  quality: TrafficQuality;
}

export interface Ga4Visitor {
  visitorId: string;
  signedUpAt: Date | null;
  signedInAt: Date | null;
  /** Opened `/admin`, or sent `internal_browser_marked` before analytics stopped loading in it. */
  operator: boolean;
  /** Oldest first; only sessions that started before the browser became an account's. */
  sessions: Ga4VisitorSession[];
}

export interface Ga4VisitorLoad {
  state: 'live' | 'needs_configuration' | 'error';
  visitors: Ga4Visitor[];
  /** The last complete export day, in the reporting time zone. */
  reportEnd: string | null;
  truncated: boolean;
  detail: string;
}

export interface VisitorScan {
  /** First day to read (YYYY-MM-DD). */
  start: string;
  /** Last complete export day (YYYY-MM-DD). */
  end: string;
}

/** The last complete export day, after the configured availability lag. */
export function visitorReportEnd(): string {
  return subtractDays(todayInReportingTimeZone(), reportingLagDays());
}

/** A page URL whose path is `/${path}` or below it. */
const onPath = (path: string) =>
  `REGEXP_CONTAINS(COALESCE(page_location, ''), r'^https?://[^/]+/${path}(?:[/?#]|$)')`;

/**
 * One row per browser seen in the scan, with its sessions as a JSON array.
 *
 * The scan reads a day either side of the requested dates: GA4 names its daily
 * tables by the property's reporting day, and callers ask in UTC.
 */
export function buildVisitorQuery(projectId: string, datasetId: string, scan: VisitorScan): string {
  const before = 'event_timestamp < account_at';
  return `
WITH raw AS (
  SELECT
    event_timestamp,
    event_name,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_number') AS session_number,
    COALESCE((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0) AS engagement_ms,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'calculation_trigger') AS calculation_trigger,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'link_domain') AS link_domain,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'traffic_type') AS traffic_type,
    COALESCE(
      CAST((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'debug_mode') AS STRING),
      (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'debug_mode')
    ) AS debug_mode,
    device.category AS device,
    device.web_info.hostname AS hostname,
    device.web_info.browser AS browser,
    device.operating_system AS operating_system,
    geo.country AS country,
    COALESCE(
      session_traffic_source_last_click.cross_channel_campaign.source,
      session_traffic_source_last_click.manual_campaign.source,
      collected_traffic_source.manual_source
    ) AS source,
    COALESCE(
      session_traffic_source_last_click.cross_channel_campaign.medium,
      session_traffic_source_last_click.manual_campaign.medium,
      collected_traffic_source.manual_medium
    ) AS medium,
    COALESCE(
      session_traffic_source_last_click.cross_channel_campaign.campaign_name,
      session_traffic_source_last_click.google_ads_campaign.campaign_name,
      session_traffic_source_last_click.manual_campaign.campaign_name,
      collected_traffic_source.manual_campaign_name
    ) AS campaign,
    COALESCE(collected_traffic_source.gclid, collected_traffic_source.dclid) AS ad_id
  FROM \`${projectId}.${datasetId}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(DATE '${scan.start}', INTERVAL 1 DAY))
    AND FORMAT_DATE('%Y%m%d', DATE_ADD(DATE '${scan.end}', INTERVAL 1 DAY))
    AND platform = 'WEB'
    AND user_pseudo_id IS NOT NULL
), marked AS (
  -- Window functions rather than a second CTE over raw: BigQuery runs a CTE
  -- once per reference, and every pass over raw is a full scan of the export.
  SELECT
    *,
    MIN(IF(event_name = 'sign_up', event_timestamp, NULL)) OVER (PARTITION BY user_pseudo_id) AS signed_up_at,
    MIN(IF(event_name = 'trial_login_success' OR (event_name = 'page_view' AND ${onPath('app')}), event_timestamp, NULL))
      OVER (PARTITION BY user_pseudo_id) AS signed_in_at,
    MAX(IF(event_name = 'internal_browser_marked' OR (event_name = 'page_view' AND ${onPath('admin')}), 1, 0))
      OVER (PARTITION BY user_pseudo_id) AS operator_browser
  FROM raw
), timed AS (
  SELECT
    *,
    LEAST(IFNULL(signed_up_at, ${NEVER}), IFNULL(signed_in_at, ${NEVER})) AS account_at
  FROM marked
), sessions AS (
  SELECT
    user_pseudo_id,
    session_id,
    ANY_VALUE(signed_up_at) AS signed_up_at,
    ANY_VALUE(signed_in_at) AS signed_in_at,
    ANY_VALUE(operator_browser) AS operator_browser,
    ANY_VALUE(account_at) AS account_at,
    MIN(event_timestamp) AS started_at,
    MIN(session_number) AS session_number,
    ARRAY_AGG(IF(event_name = 'page_view', page_location, NULL) IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS landing_page,
    ARRAY_AGG(NULLIF(hostname, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS hostname,
    COALESCE(ARRAY_AGG(NULLIF(source, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)], '(direct)') AS source,
    COALESCE(ARRAY_AGG(NULLIF(medium, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)], '(none)') AS medium,
    COALESCE(ARRAY_AGG(NULLIF(campaign, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)], '(not set)') AS campaign,
    COALESCE(ARRAY_AGG(NULLIF(ad_id, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)], '') AS ad_id,
    ARRAY_AGG(NULLIF(device, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS device,
    ARRAY_AGG(NULLIF(browser, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS browser,
    ARRAY_AGG(NULLIF(operating_system, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS operating_system,
    ARRAY_AGG(NULLIF(country, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS country,
    ARRAY_AGG(NULLIF(traffic_type, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS traffic_type,
    LOGICAL_OR(LOWER(COALESCE(debug_mode, '')) IN ('1', 'true')) AS debug_mode,
    COUNTIF(event_name = 'page_view') AS page_views,
    SUM(engagement_ms) AS engagement_ms,
    COUNTIF(event_name = 'coast_fire_calculated' AND calculation_trigger = 'submitted' AND ${before}) AS coast_fire_runs,
    COUNTIF(event_name = 'retirement_model_run' AND ${before}) AS retirement_runs,
    -- Our own event, or GA4's automatic outbound click from before it existed.
    -- When both fire for one click, the larger count keeps it from counting twice.
    GREATEST(
      COUNTIF(event_name = 'cash_flow_check_click' AND ${before}),
      COUNTIF(event_name = 'click' AND LOWER(COALESCE(link_domain, '')) IN ('trycoast.me', 'www.trycoast.me')
        AND ${onPath('cash-flow-forecast')} AND ${before})
    ) AS cash_flow_checks,
    COUNTIF(event_name = 'bmc_widget_opened' AND ${before}) AS coffee_opens
  FROM timed
  WHERE session_id IS NOT NULL
  GROUP BY user_pseudo_id, session_id
)
SELECT
  user_pseudo_id AS visitor_id,
  ANY_VALUE(signed_up_at) AS signed_up_at,
  ANY_VALUE(signed_in_at) AS signed_in_at,
  ANY_VALUE(operator_browser) AS operator_browser,
  TO_JSON_STRING(ARRAY_AGG(STRUCT(
    CAST(session_id AS STRING) AS id,
    started_at AS t,
    session_number AS n,
    landing_page AS lp,
    hostname AS host,
    source AS src,
    medium AS med,
    campaign AS cmp,
    ad_id != '' AS ad,
    device AS dev,
    browser AS br,
    operating_system AS os,
    country AS ctry,
    traffic_type AS tt,
    debug_mode AS dbg,
    page_views AS pv,
    engagement_ms AS eng,
    coast_fire_runs AS cf,
    retirement_runs AS rr,
    cash_flow_checks AS cc,
    coffee_opens AS bmc
  ) ORDER BY started_at)) AS sessions
FROM sessions
WHERE started_at < account_at
GROUP BY user_pseudo_id
LIMIT ${VISITOR_CAP + 1}`;
}

interface BigQueryResponse {
  jobComplete?: boolean;
  jobReference?: { jobId?: string; location?: string };
  schema?: { fields?: Array<{ name: string }> };
  rows?: Array<{ f: Array<{ v: string | null }> }>;
  pageToken?: string;
  totalRows?: string;
  errors?: Array<{ message?: string }>;
  error?: { message?: string };
}

function rowsToObjects(response: BigQueryResponse): Array<Record<string, string | null>> {
  const fields = response.schema?.fields ?? [];
  return (response.rows ?? []).map(row => Object.fromEntries(fields.map((field, index) => [field.name, row.f[index]?.v ?? null])));
}

function failure(response: Response, body: BigQueryResponse, fallback: string): Error {
  return new Error(body.error?.message || body.errors?.[0]?.message || `${fallback} (${response.status})`);
}

/**
 * Runs the query and reads every page, up to the cap. A large result arrives
 * in pages; reading only the first would silently drop browsers.
 */
async function runPagedQuery(
  projectId: string,
  location: string,
  token: string,
  query: string,
): Promise<{ rows: Array<Record<string, string | null>>; truncated: boolean }> {
  const endpoint = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`;
  const headers = { Authorization: `Bearer ${token}` };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, useLegacySql: false, location, timeoutMs: 20_000, maxResults: PAGE_SIZE }),
  });
  let body = await response.json() as BigQueryResponse;
  if (!response.ok || body.error) throw failure(response, body, 'BigQuery request failed');
  const jobId = body.jobReference?.jobId;
  const results = (pageToken?: string) => {
    const params = new URLSearchParams({ location, timeoutMs: '20000', maxResults: String(PAGE_SIZE) });
    if (pageToken) params.set('pageToken', pageToken);
    return fetch(`${endpoint}/${encodeURIComponent(jobId ?? '')}?${params.toString()}`, { headers });
  };
  for (let attempt = 0; !body.jobComplete; attempt += 1) {
    if (!jobId) throw new Error('BigQuery did not return a job id');
    if (attempt === 3) throw new Error('BigQuery job did not complete');
    const poll = await results();
    body = await poll.json() as BigQueryResponse;
    if (!poll.ok || body.error) throw failure(poll, body, 'BigQuery job failed');
  }
  const rows = rowsToObjects(body);
  while (body.pageToken && rows.length <= VISITOR_CAP) {
    if (!jobId) throw new Error('BigQuery did not return a job id');
    const page = await results(body.pageToken);
    body = await page.json() as BigQueryResponse;
    if (!page.ok || body.error) throw failure(page, body, 'BigQuery page failed');
    rows.push(...rowsToObjects(body));
  }
  const truncated = rows.length > VISITOR_CAP;
  return { rows: truncated ? rows.slice(0, VISITOR_CAP) : rows, truncated };
}

const whole = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};
const text = (value: unknown, fallback = '') => (typeof value === 'string' && value ? value : fallback);
/** GA4 timestamps are microseconds; BigQuery returns INT64 as a string. */
const micros = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? new Date(Math.floor(number / 1000)) : null;
};

export function toVisitorSession(raw: Record<string, unknown>): Ga4VisitorSession | null {
  const startedAt = micros(raw.t);
  if (!startedAt || raw.id === null || raw.id === undefined) return null;
  const hasAdId = raw.ad === true;
  const source = hasAdId && text(raw.src, '(direct)') === '(direct)' ? 'google' : text(raw.src, '(direct)');
  const medium = hasAdId && text(raw.med, '(none)') === '(none)' ? 'cpc' : text(raw.med, '(none)');
  const actions: VisitorActionCounts = {
    coast_fire_run: whole(raw.cf),
    retirement_run: whole(raw.rr),
    cash_flow_check: whole(raw.cc),
    coffee_widget: whole(raw.bmc),
  };
  const landingPage = cleanPath(text(raw.lp));
  const device = text(raw.dev, 'unknown');
  const pageViews = whole(raw.pv);
  const engagementSeconds = whole(raw.eng) / 1000;
  const sessionNumber = raw.n === null || raw.n === undefined ? null : whole(raw.n) || null;
  const { quality } = assessTrafficQuality({
    hostname: text(raw.host),
    landingPage,
    browser: text(raw.br),
    operatingSystem: text(raw.os),
    device,
    trafficType: text(raw.tt),
    debugMode: raw.dbg === true,
    pageViews,
    engagementSeconds,
    eventCounts: actions,
  });
  return {
    sessionId: String(raw.id),
    startedAt,
    sessionNumber,
    landingPage,
    source,
    medium,
    campaign: text(raw.cmp, '(not set)'),
    channel: channelFor(source, medium, hasAdId),
    device,
    country: text(raw.ctry),
    pageViews,
    engagementSeconds,
    actions,
    quality,
  };
}

export function toVisitor(row: Record<string, string | null>): Ga4Visitor | null {
  if (!row.visitor_id) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.sessions ?? '[]');
  } catch {
    return null;
  }
  const sessions = (Array.isArray(parsed) ? parsed : [])
    .map(session => (session && typeof session === 'object' ? toVisitorSession(session as Record<string, unknown>) : null))
    .filter((session): session is Ga4VisitorSession => session !== null)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  return {
    visitorId: row.visitor_id,
    signedUpAt: micros(row.signed_up_at),
    signedInAt: micros(row.signed_in_at),
    operator: row.operator_browser === '1' || row.operator_browser === 'true',
    sessions,
  };
}

export async function loadGa4Visitors(scan: VisitorScan): Promise<Ga4VisitorLoad> {
  const base = { visitors: [] as Ga4Visitor[], reportEnd: scan.end, truncated: false };
  const credentials = parseCredentials();
  if (!credentials) {
    return { ...base, state: 'needs_configuration', detail: 'Add a read-only BigQuery service account to the backend environment.' };
  }
  const projectId = process.env.GA4_BIGQUERY_PROJECT_ID?.trim() || credentials.project_id;
  if (!projectId) {
    return { ...base, state: 'needs_configuration', detail: 'Set the BigQuery project ID in the backend environment or service-account JSON.' };
  }
  const datasetId = process.env.GA4_BIGQUERY_DATASET_ID?.trim() || 'analytics_519498279';
  const location = process.env.GA4_BIGQUERY_LOCATION?.trim() || 'US';
  try {
    const token = await getAccessToken(credentials);
    const result = await runPagedQuery(projectId, location, token, buildVisitorQuery(projectId, datasetId, scan));
    return {
      ...base,
      state: 'live',
      visitors: result.rows.map(toVisitor).filter((visitor): visitor is Ga4Visitor => visitor !== null),
      truncated: result.truncated,
      detail: `GA4 daily export through ${scan.end}; ${reportingLagDays()}-day availability lag applied. Recent daily tables can still receive late events for up to 3 days.`,
    };
  } catch (error) {
    return { ...base, state: 'error', detail: error instanceof Error ? error.message : 'Unable to query the GA4 BigQuery export.' };
  }
}
