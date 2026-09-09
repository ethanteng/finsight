import { buildQuery } from '../../marketing-analytics/adapters/ga4-bigquery';
import { assessTrafficQuality, isAllowedAnalyticsHostname, isIncludedByDefault } from '../../marketing-analytics/traffic-quality';

const base = {
  hostname: 'asklinc.com',
  landingPage: '/',
  browser: 'Chrome',
  operatingSystem: 'Macintosh',
  device: 'desktop',
  trafficType: '',
  debugMode: false,
  pageViews: 2,
  engagementSeconds: 15,
  eventCounts: {},
};

describe('marketing traffic quality', () => {
  it('excludes explicit internal, debug, and admin sessions', () => {
    expect(assessTrafficQuality({ ...base, trafficType: 'internal' }).quality).toBe('internal');
    expect(assessTrafficQuality({ ...base, debugMode: true }).quality).toBe('internal');
    expect(assessTrafficQuality({ ...base, landingPage: '/admin/marketing' }).quality).toBe('internal');
    expect(assessTrafficQuality({ ...base, hasAdminPage: true }).quality).toBe('internal');
  });

  it.each([
    'Google Generic Crawler',
    'Google Adwords DisplayAds WebRender',
    'HubSpot Crawler',
    'Bramble',
    'Dataprovider.com',
    'Donkey',
  ])('excludes the known automation browser %s', browser => {
    expect(assessTrafficQuality({ ...base, browser }).quality).toBe('bot');
  });

  it('excludes the observed unknown-device zero-engagement signature', () => {
    expect(assessTrafficQuality({
      ...base,
      browser: '',
      device: 'unknown',
      pageViews: 1,
      engagementSeconds: 2.4,
    })).toEqual({
      quality: 'bot',
      exclusionReasons: ['unknown_device_single_page_zero_engagement'],
    });
  });

  it('keeps ambiguous unknown sessions visible and separates preview hosts', () => {
    expect(assessTrafficQuality({ ...base, browser: '' }).quality).toBe('unknown');
    expect(assessTrafficQuality({ ...base, hostname: 'preview.vercel.app' }).quality).toBe('synthetic');
    expect(isIncludedByDefault('unknown')).toBe(true);
    expect(isIncludedByDefault('synthetic')).toBe(false);
  });

  it('treats production subdomains as allowed, matching the frontend host gate', () => {
    expect(isAllowedAnalyticsHostname('asklinc.com')).toBe(true);
    expect(isAllowedAnalyticsHostname('www.asklinc.com')).toBe(true);
    expect(isAllowedAnalyticsHostname('blog.asklinc.com')).toBe(true);
    expect(isAllowedAnalyticsHostname('app.asklinc.com')).toBe(true);
    expect(isAllowedAnalyticsHostname('notasklinc.com')).toBe(false);
    expect(assessTrafficQuality({ ...base, hostname: 'blog.asklinc.com' }).quality).toBe('human');
    expect(assessTrafficQuality({ ...base, hostname: 'app.asklinc.com' }).quality).toBe('human');
  });

  it('does not discard a real conversion merely because its device is unknown', () => {
    expect(assessTrafficQuality({
      ...base,
      browser: '',
      device: 'unknown',
      pageViews: 1,
      engagementSeconds: 0,
      eventCounts: { sign_up: 1 },
    }).quality).toBe('unknown');
  });
});

describe('GA4 session query', () => {
  const query = buildQuery('project', 'dataset', {
    start: '2026-09-01',
    end: '2026-09-28',
    previousStart: '2026-08-04',
    previousEnd: '2026-08-31',
  });

  it('uses session acquisition fields and defers direct fallback until aggregation', () => {
    expect(query).toContain('session_traffic_source_last_click.cross_channel_campaign.source');
    expect(query).toContain("COALESCE(ARRAY_AGG(NULLIF(source, '')");
    expect(query).not.toContain("collected_traffic_source.manual_source, '(direct)'");
  });

  it('keeps landing page and landing referrer from the same first page view', () => {
    expect(query).toContain("IF(event_name = 'page_view', STRUCT(event_timestamp, page_location, page_referrer, hostname), NULL)");
    expect(query).toContain('landing.page_referrer AS referrer');
  });

  it('collects the fields needed for auditable quality filtering', () => {
    expect(query).toContain('device.web_info.hostname AS hostname');
    expect(query).toContain('device.web_info.browser AS browser');
    expect(query).toContain("key = 'traffic_type'");
    expect(query).toContain('AS has_admin_page');
    expect(query).toContain('COUNT(*) AS event_count');
    expect(query).toContain("ARRAY_AGG(NULLIF(hostname, '') IGNORE NULLS ORDER BY event_timestamp LIMIT 1)[SAFE_OFFSET(0)] AS session_hostname");
    expect(query).toContain("COALESCE(landing.hostname, NET.HOST(landing.page_location), session_hostname, '') AS hostname");
  });
});
