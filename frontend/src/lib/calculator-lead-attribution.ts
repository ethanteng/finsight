import { readGaClientId, readGaSessionId } from './ga-client-id';
import {
  campaignParamsFrom,
  readLandingAttribution,
  rememberLanding,
  strippedReferrer,
} from './landing-attribution';

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

/**
 * Capture only acquisition metadata that can be joined safely later. Query
 * values other than the explicit UTM and Google click-id allowlist are never
 * copied, and a referrer's query/fragment is deliberately discarded.
 *
 * The landing this browser remembered (`landing-attribution`) wins over the
 * page the form is on, so a visitor who arrived from a campaign and signed up
 * three pages later still carries it. With nothing remembered, the current
 * page is the landing, as it always was. The GA ids describe this session
 * either way, so they are always read fresh.
 */
export function readCalculatorLeadAttribution(): CalculatorLeadAttribution {
  if (typeof window === 'undefined' || typeof document === 'undefined') return {};
  // The recorder in the root layout normally ran on landing already; running
  // it again covers a form submitted before that effect fired.
  rememberLanding();
  const remembered = readLandingAttribution();
  const landing = remembered ?? {
    landingPage: window.location.pathname,
    ...(strippedReferrer() ? { referrer: strippedReferrer() } : {}),
    ...campaignParamsFrom(window.location.search),
  };
  const gaClientId = readGaClientId();
  const gaSessionId = readGaSessionId();

  return {
    ...landing,
    ...(gaClientId ? { gaClientId } : {}),
    ...(gaSessionId ? { gaSessionId } : {}),
  };
}
