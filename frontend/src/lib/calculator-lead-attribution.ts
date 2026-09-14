import { readGaClientId, readGaSessionId } from './ga-client-id';

export interface CalculatorLeadAttribution {
  landingPage?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  gaClientId?: string;
  gaSessionId?: string;
}

function queryValue(search: URLSearchParams, name: string): string | undefined {
  const value = search.get(name)?.trim();
  return value || undefined;
}

function safeReferrer(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/**
 * Capture only acquisition metadata that can be joined safely later. Query
 * values other than the explicit UTM and Google click-id allowlist are never
 * copied, and a referrer's query/fragment is deliberately discarded.
 */
export function readCalculatorLeadAttribution(): CalculatorLeadAttribution {
  if (typeof window === 'undefined' || typeof document === 'undefined') return {};
  const search = new URLSearchParams(window.location.search);
  const referrer = safeReferrer();
  const gaClientId = readGaClientId();
  const gaSessionId = readGaSessionId();

  return {
    landingPage: window.location.pathname,
    ...(referrer ? { referrer } : {}),
    ...(queryValue(search, 'utm_source') ? { utmSource: queryValue(search, 'utm_source') } : {}),
    ...(queryValue(search, 'utm_medium') ? { utmMedium: queryValue(search, 'utm_medium') } : {}),
    ...(queryValue(search, 'utm_campaign') ? { utmCampaign: queryValue(search, 'utm_campaign') } : {}),
    ...(queryValue(search, 'utm_term') ? { utmTerm: queryValue(search, 'utm_term') } : {}),
    ...(queryValue(search, 'utm_content') ? { utmContent: queryValue(search, 'utm_content') } : {}),
    ...(queryValue(search, 'gclid') ? { gclid: queryValue(search, 'gclid') } : {}),
    ...(queryValue(search, 'gbraid') ? { gbraid: queryValue(search, 'gbraid') } : {}),
    ...(queryValue(search, 'wbraid') ? { wbraid: queryValue(search, 'wbraid') } : {}),
    ...(gaClientId ? { gaClientId } : {}),
    ...(gaSessionId ? { gaSessionId } : {}),
  };
}
