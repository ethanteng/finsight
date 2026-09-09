import { createSign } from 'crypto';
import type { AnalyticsSession, FunnelEventName, MarketingFilters } from '../types';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

interface BigQueryField { name: string }
interface BigQueryResponse {
  jobComplete?: boolean;
  jobReference?: { jobId?: string; location?: string };
  schema?: { fields?: BigQueryField[] };
  rows?: Array<{ f: Array<{ v: string | null }> }>;
  pageToken?: string;
  totalRows?: string;
  errors?: Array<{ message?: string }>;
  error?: { message?: string };
}

export interface Ga4LoadResult {
  state: 'live' | 'collecting' | 'needs_configuration' | 'error';
  sessions: AnalyticsSession[];
  reportEnd: string | null;
  detail: string;
  truncated: boolean;
}

const FUNNEL_EVENTS: FunnelEventName[] = [
  'start_free_click', 'trial_signup_viewed', 'trial_signup_started',
  'trial_signup_submit', 'sign_up', 'trial_verify_viewed',
  'trial_verify_submit', 'trial_verify_success', 'trial_login_viewed',
  'trial_login_submit', 'trial_login_success',
];

const DIAGNOSTIC_EVENTS = [
  'trial_signup_validation_error', 'trial_signup_registration_error',
  'trial_verify_error', 'trial_login_error',
  'retirement_calculator_field_edited', 'retirement_model_clicked',
  'retirement_model_requested', 'retirement_model_run', 'scroll',
] as const;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

const base64url = (value: string | Buffer) => Buffer.from(value)
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

function parseCredentials(): ServiceAccountCredentials | null {
  const raw = process.env.GA4_BIGQUERY_SERVICE_ACCOUNT_JSON
    || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountCredentials;
    if (!parsed.client_email || !parsed.private_key) return null;
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/bigquery.readonly',
    aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  const assertion = `${header}.${claims}.${base64url(signer.sign(credentials.private_key))}`;
  const response = await fetch(credentials.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || `Google authentication failed (${response.status})`);
  cachedAccessToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
  return body.access_token;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayInReportingTimeZone(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function subtractDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return dateOnly(date);
}

function reportDates(days: number) {
  const configuredLag = Number(process.env.GA4_REPORTING_LAG_DAYS || 3);
  const lagDays = Number.isFinite(configuredLag) ? Math.max(0, Math.floor(configuredLag)) : 3;
  const end = subtractDays(todayInReportingTimeZone(), lagDays);
  const start = subtractDays(end, days - 1);
  const previousEnd = subtractDays(start, 1);
  const previousStart = subtractDays(previousEnd, days - 1);
  return { start, end, previousStart, previousEnd };
}

function cleanPath(value: string): string {
  if (!value) return '(not set)';
  try {
    const url = new URL(value, 'https://asklinc.com');
    return url.pathname.replace(/\/$/, '') || '/';
  } catch {
    return value.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  }
}

function channelFor(source: string, medium: string, hasAdId: boolean): string {
  const normalizedSource = source.toLowerCase();
  const normalizedMedium = medium.toLowerCase();
  if (hasAdId || /cpc|ppc|paid|display/.test(normalizedMedium)) return 'Paid';
  if (/organic/.test(normalizedMedium)) return 'Organic Search';
  if (/facebook|linkedin|instagram|bsky|twitter|t\.co/.test(normalizedSource)) return 'Organic Social';
  if (!normalizedSource || normalizedSource === '(direct)' || normalizedMedium === '(none)') return 'Direct';
  if (/referral/.test(normalizedMedium)) return 'Referral';
  return 'Other';
}

function buildQuery(projectId: string, datasetId: string, dates: ReturnType<typeof reportDates>): string {
  const eventColumns = [...FUNNEL_EVENTS, ...DIAGNOSTIC_EVENTS].map(event => {
    const signupGuard = event === 'sign_up' ? " AND signup_flow = 'free_trial'" : '';
    return `COUNTIF(event_name = '${event}'${signupGuard}) AS count_${event}, MIN(IF(event_name = '${event}'${signupGuard}, event_timestamp, NULL)) AS first_${event}`;
  }).join(',\n    ');

  return `
WITH raw AS (
  SELECT
    event_timestamp,
    event_name,
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    (SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING)) FROM UNNEST(event_params) WHERE key = 'session_engaged') AS session_engaged,
    COALESCE((SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'engagement_time_msec'), 0) AS engagement_ms,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_referrer') AS page_referrer,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source_page') AS source_page,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'signup_flow') AS signup_flow,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_number') AS session_number,
    device.category AS device,
    COALESCE(session_traffic_source_last_click.cross_channel_campaign.source, collected_traffic_source.manual_source, '(direct)') AS source,
    COALESCE(session_traffic_source_last_click.cross_channel_campaign.medium, collected_traffic_source.manual_medium, '(none)') AS medium,
    COALESCE(session_traffic_source_last_click.cross_channel_campaign.campaign_name, collected_traffic_source.manual_campaign_name, '(not set)') AS campaign,
    COALESCE(collected_traffic_source.manual_term, '(not set)') AS search_term,
    COALESCE(collected_traffic_source.manual_content, '(not set)') AS creative,
    COALESCE(collected_traffic_source.gclid, collected_traffic_source.dclid, '') AS ad_id
  FROM \`${projectId}.${datasetId}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(DATE '${dates.previousStart}', INTERVAL 1 DAY))
    AND FORMAT_DATE('%Y%m%d', DATE_ADD(DATE '${dates.end}', INTERVAL 1 DAY))
    AND platform = 'WEB'
), session_rows AS (
  SELECT
    user_pseudo_id,
    session_id,
    FORMAT_DATE('%F', DATE(TIMESTAMP_SECONDS(session_id), 'America/Los_Angeles')) AS session_date,
    ARRAY_AGG(source IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS source,
    ARRAY_AGG(medium IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS medium,
    ARRAY_AGG(campaign IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS campaign,
    ARRAY_AGG(search_term IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS search_term,
    ARRAY_AGG(creative IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS creative,
    ARRAY_AGG(ad_id IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS ad_id,
    ARRAY_AGG(device IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS device,
    ARRAY_AGG(page_referrer IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS referrer,
    ARRAY_AGG(IF(event_name = 'page_view', page_location, NULL) IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS landing_page,
    MIN(session_number) AS session_number,
    MAX(IF(session_engaged = '1', 1, 0)) AS engaged,
    SUM(engagement_ms) AS engagement_ms,
    COUNTIF(event_name = 'page_view') AS page_views,
    ${eventColumns}
  FROM raw
  WHERE user_pseudo_id IS NOT NULL AND session_id IS NOT NULL
  GROUP BY user_pseudo_id, session_id
)
SELECT * FROM session_rows
WHERE session_date BETWEEN '${dates.previousStart}' AND '${dates.end}'
ORDER BY session_date DESC
LIMIT 100000`;
}

function rowsToObjects(response: BigQueryResponse): Record<string, string>[] {
  const fields = response.schema?.fields ?? [];
  return (response.rows ?? []).map(row => Object.fromEntries(fields.map((field, index) => [field.name, row.f[index]?.v ?? ''])));
}

async function runQuery(projectId: string, location: string, token: string, query: string): Promise<{ rows: Record<string, string>[]; truncated: boolean }> {
  const endpoint = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(projectId)}/queries`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, useLegacySql: false, location, timeoutMs: 20_000, maxResults: 100_000 }),
  });
  let body = await response.json() as BigQueryResponse;
  if (!response.ok || body.error) throw new Error(body.error?.message || body.errors?.[0]?.message || `BigQuery request failed (${response.status})`);
  if (!body.jobComplete) {
    const jobId = body.jobReference?.jobId;
    if (!jobId) throw new Error('BigQuery did not return a job id');
    const poll = await fetch(`${endpoint}/${encodeURIComponent(jobId)}?location=${encodeURIComponent(location)}&timeoutMs=20000&maxResults=100000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    body = await poll.json() as BigQueryResponse;
    if (!poll.ok || body.error || !body.jobComplete) throw new Error(body.error?.message || body.errors?.[0]?.message || 'BigQuery job did not complete');
  }
  return { rows: rowsToObjects(body), truncated: Number(body.totalRows || 0) > 100_000 || Boolean(body.pageToken) };
}

function toSession(row: Record<string, string>): AnalyticsSession {
  const source = row.source || '(direct)';
  const medium = row.medium || '(none)';
  const adId = row.ad_id || '';
  const eventCounts: Record<string, number> = {};
  const firstEventAt: AnalyticsSession['firstEventAt'] = {};
  for (const event of [...FUNNEL_EVENTS, ...DIAGNOSTIC_EVENTS]) {
    eventCounts[event] = Number(row[`count_${event}`] || 0);
    if (FUNNEL_EVENTS.includes(event as FunnelEventName) && row[`first_${event}`]) {
      firstEventAt[event as FunnelEventName] = Number(row[`first_${event}`]);
    }
  }
  return {
    id: `${row.user_pseudo_id}.${row.session_id}`,
    userId: row.user_pseudo_id,
    sessionDate: row.session_date,
    acquisition: {
      source,
      medium,
      channel: channelFor(source, medium, Boolean(adId)),
      campaign: row.campaign || '(not set)',
      landingPage: cleanPath(row.landing_page),
      searchTerm: row.search_term || '(not set)',
      creative: row.creative || '(not set)',
      adId,
      referrer: row.referrer || '',
    },
    device: row.device || 'unknown',
    visitorType: Number(row.session_number) === 1 ? 'new' : Number(row.session_number) > 1 ? 'returning' : 'unknown',
    engaged: row.engaged === '1',
    engagementSeconds: Number(row.engagement_ms || 0) / 1000,
    pageViews: Number(row.page_views || 0),
    scrollEvents: Number(row.count_scroll || 0),
    eventCounts,
    firstEventAt,
  };
}

export async function loadGa4Sessions(filters: MarketingFilters): Promise<Ga4LoadResult> {
  const credentials = parseCredentials();
  const firstFullTrackingDate = process.env.GA4_FIRST_FULL_TRACKING_DATE?.trim();
  if (!credentials) {
    return { state: 'needs_configuration', sessions: [], reportEnd: null, truncated: false, detail: 'Add a read-only BigQuery service account to the backend environment.' };
  }
  if (!firstFullTrackingDate) {
    return { state: 'collecting', sessions: [], reportEnd: null, truncated: false, detail: 'The export is connected, but the first complete verified tracking date has not been set.' };
  }
  const projectId = process.env.GA4_BIGQUERY_PROJECT_ID?.trim() || credentials.project_id;
  if (!projectId) {
    return { state: 'needs_configuration', sessions: [], reportEnd: null, truncated: false, detail: 'Set the BigQuery project ID in the backend environment or service-account JSON.' };
  }
  const dates = reportDates(filters.days);
  if (dates.end < firstFullTrackingDate) {
    return { state: 'collecting', sessions: [], reportEnd: dates.end, truncated: false, detail: 'The selected period ends before the first complete day of the new funnel tracking.' };
  }
  const datasetId = process.env.GA4_BIGQUERY_DATASET_ID?.trim() || 'analytics_519498279';
  const location = process.env.GA4_BIGQUERY_LOCATION?.trim() || 'US';
  try {
    const token = await getAccessToken(credentials);
    const result = await runQuery(projectId, location, token, buildQuery(projectId, datasetId, dates));
    return {
      state: 'live',
      sessions: result.rows.map(toSession),
      reportEnd: dates.end,
      truncated: result.truncated,
      detail: `GA4 daily export through ${dates.end}; three-day settling lag applied.`,
    };
  } catch (error) {
    return {
      state: 'error', sessions: [], reportEnd: dates.end, truncated: false,
      detail: error instanceof Error ? error.message : 'Unable to query the GA4 BigQuery export.',
    };
  }
}
