/**
 * Where a visitor first came from, remembered across pages and visits.
 *
 * Attribution used to be read off the page the form sat on, at the moment it
 * was submitted. A visitor who landed on `/coast-fire?utm_campaign=…` from an
 * ad, read the blog, and signed up from `/getstarted` arrived with no campaign
 * at all, and so did one who came back a day later from a bookmark. Both were
 * reported as direct.
 *
 * So the landing is recorded when it happens, in this browser, and read back
 * when a form is submitted. The first campaign landing wins, matching how the
 * server treats a calculator lead's own attribution: a later click on one of
 * our emails is not what brought the person here. A landing that only has an
 * outside referrer (organic search, a link from another site) is kept until a
 * campaign landing replaces it, since a tagged click says more than a
 * referrer does. Internal navigation and direct visits never touch it.
 *
 * localStorage is per-viewer and can be blocked or cleared, so every read and
 * write tolerates failure, and a missing record means "use the current page",
 * which is what happened before this existed.
 */

const STORAGE_KEY = 'asklinc.landing-attribution.v1';
const VERSION = 1 as const;
/** Google Ads' default click-through conversion window. */
export const LANDING_ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** The server's own cap on these fields; anything longer is dropped there anyway. */
const MAX_VALUE_LENGTH = 256;
const MAX_PATH_LENGTH = 1024;

const CAMPAIGN_PARAMS = [
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_term', 'utmTerm'],
  ['utm_content', 'utmContent'],
  ['gclid', 'gclid'],
  ['gbraid', 'gbraid'],
  ['wbraid', 'wbraid'],
] as const;

type CampaignField = typeof CAMPAIGN_PARAMS[number][1];
export type CampaignParams = Partial<Record<CampaignField, string>>;

export interface LandingAttribution extends CampaignParams {
  landingPage: string;
  referrer?: string;
}

interface StoredLanding extends LandingAttribution {
  version: typeof VERSION;
  savedAt: number;
  /** `campaign` when the landing URL was tagged; `referral` for an outside referrer alone. */
  kind: 'campaign' | 'referral';
}

/** The allowlisted campaign values on a query string, trimmed and non-empty. */
export function campaignParamsFrom(search: string): CampaignParams {
  const params = new URLSearchParams(search);
  const found: CampaignParams = {};
  for (const [param, field] of CAMPAIGN_PARAMS) {
    const value = params.get(param)?.trim();
    if (value && value.length <= MAX_VALUE_LENGTH) found[field] = value;
  }
  return found;
}

/** The referrer reduced to origin and path; its query can carry search terms. */
export function strippedReferrer(): string | undefined {
  if (typeof document === 'undefined' || !document.referrer) return undefined;
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function isOutsideReferrer(referrer: string | undefined): boolean {
  if (!referrer) return false;
  try {
    return new URL(referrer).host !== window.location.host;
  } catch {
    return false;
  }
}

function isString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** localStorage is untrusted input: extensions and same-origin code can edit it. */
function parseStored(raw: string | null, now: number): StoredLanding | null {
  if (!raw) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const savedAt = value.savedAt;
  if (
    value.version !== VERSION ||
    (value.kind !== 'campaign' && value.kind !== 'referral') ||
    typeof savedAt !== 'number' ||
    !Number.isFinite(savedAt) ||
    savedAt > now ||
    now - savedAt > LANDING_ATTRIBUTION_TTL_MS ||
    !isString(value.landingPage, MAX_PATH_LENGTH) ||
    !value.landingPage.startsWith('/')
  ) {
    return null;
  }

  const stored: StoredLanding = {
    version: VERSION,
    savedAt,
    kind: value.kind,
    landingPage: value.landingPage,
  };
  if (isString(value.referrer, MAX_PATH_LENGTH)) stored.referrer = value.referrer;
  for (const [, field] of CAMPAIGN_PARAMS) {
    const fieldValue = value[field];
    if (isString(fieldValue, MAX_VALUE_LENGTH)) stored[field] = fieldValue;
  }
  return stored;
}

function readStored(now: number): StoredLanding | null {
  try {
    return parseStored(window.localStorage.getItem(STORAGE_KEY), now);
  } catch {
    return null;
  }
}

function writeStored(landing: StoredLanding): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(landing));
  } catch {
    // Blocked storage only means this landing is not remembered; the form
    // still reports the page it was submitted from.
  }
}

/**
 * Record the page this browser is on, if it is a landing worth remembering.
 * Safe to call on every page load and again before reading.
 */
export function rememberLanding(now = Date.now()): void {
  if (typeof window === 'undefined') return;
  const campaign = campaignParamsFrom(window.location.search);
  const isCampaign = Object.keys(campaign).length > 0;
  const referrer = strippedReferrer();
  const fromOutside = isOutsideReferrer(referrer);
  if (!isCampaign && !fromOutside) return;

  const stored = readStored(now);
  // The first campaign landing wins; a referral is kept only until one arrives.
  if (stored?.kind === 'campaign') return;
  if (stored && !isCampaign) return;

  const landingPage = window.location.pathname.slice(0, MAX_PATH_LENGTH);
  writeStored({
    version: VERSION,
    savedAt: now,
    kind: isCampaign ? 'campaign' : 'referral',
    landingPage,
    ...(fromOutside && referrer ? { referrer } : {}),
    ...campaign,
  });
}

/** The remembered landing, or null when there is none or it has expired. */
export function readLandingAttribution(now = Date.now()): LandingAttribution | null {
  if (typeof window === 'undefined') return null;
  const stored = readStored(now);
  if (!stored) return null;
  const landing: LandingAttribution = { landingPage: stored.landingPage };
  if (stored.referrer) landing.referrer = stored.referrer;
  for (const [, field] of CAMPAIGN_PARAMS) {
    const value = stored[field];
    if (value) landing[field] = value;
  }
  return landing;
}
