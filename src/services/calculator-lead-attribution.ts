/**
 * Privacy-bounded acquisition metadata stored with a calculator email lead.
 *
 * The browser sends only routing and advertising identifiers. Financial
 * inputs and the email address remain in their existing first-party columns;
 * neither is copied into GA4 or an advertising parameter.
 */
export interface CalculatorLeadAttribution {
  landingPage?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  gaClientId?: string | null;
  gaSessionId?: string | null;
}

const SHORT_VALUE_LIMIT = 256;
const URL_VALUE_LIMIT = 1024;
const CLICK_ID_PATTERN = /^[A-Za-z0-9._~-]+$/;
const GA_CLIENT_ID_PATTERN = /^\d+\.\d+$/;
const GA_SESSION_ID_PATTERN = /^\d+$/;

function boundedString(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const hasControlCharacter = Array.from(trimmed).some(character => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!trimmed || trimmed.length > limit || hasControlCharacter) return undefined;
  return trimmed;
}

function landingPath(value: unknown): string | undefined {
  const candidate = boundedString(value, URL_VALUE_LIMIT);
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return undefined;
  try {
    const parsed = new URL(candidate, 'https://asklinc.com');
    // Campaign parameters and click ids are stored in their explicit fields.
    // Dropping the rest of the query avoids retaining arbitrary user state.
    return parsed.pathname;
  } catch {
    return undefined;
  }
}

function referrerUrl(value: unknown): string | undefined {
  const candidate = boundedString(value, URL_VALUE_LIMIT);
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    // Queries and fragments can contain tokens or other personal state. The
    // origin and path are enough to distinguish the referring surface.
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

function clickId(value: unknown): string | undefined {
  const candidate = boundedString(value, SHORT_VALUE_LIMIT);
  return candidate && CLICK_ID_PATTERN.test(candidate) ? candidate : undefined;
}

/**
 * Treat attribution as optional telemetry. Malformed values are dropped
 * field-by-field and can never make a requested results email fail.
 */
export function parseCalculatorLeadAttribution(raw: unknown): CalculatorLeadAttribution {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  const parsed = {
    landingPage: landingPath(value.landingPage),
    referrer: referrerUrl(value.referrer),
    utmSource: boundedString(value.utmSource, SHORT_VALUE_LIMIT),
    utmMedium: boundedString(value.utmMedium, SHORT_VALUE_LIMIT),
    utmCampaign: boundedString(value.utmCampaign, SHORT_VALUE_LIMIT),
    utmTerm: boundedString(value.utmTerm, SHORT_VALUE_LIMIT),
    utmContent: boundedString(value.utmContent, SHORT_VALUE_LIMIT),
    gclid: clickId(value.gclid),
    gbraid: clickId(value.gbraid),
    wbraid: clickId(value.wbraid),
  };
  const gaClientId = boundedString(value.gaClientId, 64);
  const gaSessionId = boundedString(value.gaSessionId, 32);

  return {
    ...Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    ...(gaClientId && GA_CLIENT_ID_PATTERN.test(gaClientId) ? { gaClientId } : {}),
    ...(gaSessionId && GA_SESSION_ID_PATTERN.test(gaSessionId) ? { gaSessionId } : {}),
  };
}

export function hasLeadAttribution(value: CalculatorLeadAttribution): boolean {
  return Boolean(
    value.gaClientId
    || value.gaSessionId
    || value.gclid
    || value.gbraid
    || value.wbraid
    || value.utmSource
    || value.utmMedium
    || value.utmCampaign,
  );
}

export function hasPaidLeadAttribution(value: CalculatorLeadAttribution): boolean {
  return Boolean(
    value.gclid
    || value.gbraid
    || value.wbraid
    || /^(?:cpc|ppc|paid|display)$/i.test(value.utmMedium || ''),
  );
}
