import type { TrafficQuality } from './types';

export interface TrafficQualityInput {
  hostname: string;
  landingPage: string;
  browser: string;
  operatingSystem: string;
  device: string;
  trafficType: string;
  debugMode: boolean;
  hasAdminPage?: boolean;
  pageViews: number;
  engagementSeconds: number;
  eventCounts: Record<string, number>;
}

export interface TrafficQualityAssessment {
  quality: TrafficQuality;
  exclusionReasons: string[];
}

const KNOWN_AUTOMATION = /(?:\bbot\b|crawler|spider|web\s*render|webrender|headless|bramble|dataprovider|donkey)/i;
const INTERNAL_TRAFFIC = /^(?:internal|developer|test)$/i;

export function configuredAnalyticsHostnames(): string[] {
  const configured = process.env.GA4_ALLOWED_HOSTNAMES
    ?.split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return configured?.length ? [...new Set(configured)] : ['asklinc.com', 'www.asklinc.com'];
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '').split(':')[0];
}

function hasMeaningfulEvent(eventCounts: Record<string, number>): boolean {
  return Object.entries(eventCounts).some(([event, count]) => event !== 'scroll' && count > 0);
}

/**
 * Conservative reporting classifier. Confirmed automation, explicit internal
 * traffic, developer sessions and off-host traffic are excluded. Ambiguous
 * sessions remain visible as unknown rather than being silently discarded.
 */
export function assessTrafficQuality(
  input: TrafficQualityInput,
  allowedHostnames = configuredAnalyticsHostnames(),
): TrafficQualityAssessment {
  const hostname = normalizeHostname(input.hostname);
  const browser = input.browser.trim();
  const operatingSystem = input.operatingSystem.trim();
  const device = input.device.trim().toLowerCase();
  const landingPage = input.landingPage.trim();

  if (INTERNAL_TRAFFIC.test(input.trafficType)) {
    return { quality: 'internal', exclusionReasons: [`ga4_traffic_type:${input.trafficType.toLowerCase()}`] };
  }
  if (input.debugMode) {
    return { quality: 'internal', exclusionReasons: ['ga4_debug_mode'] };
  }
  if (input.hasAdminPage || /^\/admin(?:\/|$)/.test(landingPage)) {
    return { quality: 'internal', exclusionReasons: ['admin_page_session'] };
  }
  if (KNOWN_AUTOMATION.test(`${browser} ${operatingSystem}`)) {
    return { quality: 'bot', exclusionReasons: [`known_automation:${browser || operatingSystem || 'unknown'}`] };
  }
  if (hostname && !allowedHostnames.includes(hostname)) {
    return { quality: 'synthetic', exclusionReasons: [`non_production_hostname:${hostname}`] };
  }
  if (
    device === 'unknown'
    && input.pageViews === 1
    && input.engagementSeconds <= 3
    && !hasMeaningfulEvent(input.eventCounts)
  ) {
    return { quality: 'bot', exclusionReasons: ['unknown_device_single_page_zero_engagement'] };
  }
  if (!hostname || device === 'unknown' || !browser) {
    const reasons = [
      ...(!hostname ? ['missing_hostname'] : []),
      ...(device === 'unknown' ? ['unknown_device'] : []),
      ...(!browser ? ['missing_browser'] : []),
    ];
    return { quality: 'unknown', exclusionReasons: reasons };
  }
  return { quality: 'human', exclusionReasons: [] };
}

export function isIncludedByDefault(quality: TrafficQuality): boolean {
  return quality === 'human' || quality === 'unknown';
}
