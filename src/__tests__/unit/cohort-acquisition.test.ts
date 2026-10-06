import { filterByAcquisition, matchesAcquisition, resolveCohortAcquisition, type AcquisitionUser } from '../../cohort-analytics/acquisition';
import { getPrismaClient } from '../../prisma-client';
import type { CohortWindow } from '../../cohort-analytics/types';

jest.mock('../../prisma-client', () => ({ getPrismaClient: jest.fn() }));
const signup = new Date('2026-10-05T12:00:00Z');
const window: CohortWindow = { segment: 'signup', cohortGrain: 'week', periodGrain: 'week', cohortCount: 12, periodCount: 12 };
const user = (origin = 'calculator_coast_fire', delay = 1000): AcquisitionUser => ({
  email: 'person@example.com', createdAt: signup, acquisition: null,
  conversations: [{ origin, createdAt: new Date(+signup + delay), calculatorLeadToken: 'seed-token' }],
});
const lead = { token: 'seed-token', email: 'PERSON@example.com', createdAt: new Date(+signup - 60_000),
  utmSource: 'Google', utmMedium: 'display', utmCampaign: 'coast_fire' };

it.each([
  ['calculator_coast_fire', 'coast_fire_calculator'], ['calculator_retirement', 'retirement_calculator'],
])('recovers historical %s source without creating a measurement record', (origin, source) => {
  expect(resolveCohortAcquisition(user(origin))).toEqual({ source, evidence: 'recovered' });
  const tokenless = user(origin); tokenless.conversations![0].calculatorLeadToken = null;
  expect(resolveCohortAcquisition(tokenless)).toEqual({ source, evidence: 'recovered' });
});

it.each([
  ['user', 1000], ['calculator_coast_fire', -1], ['calculator_coast_fire', 600_001],
])('does not use %s at offset %s as signup evidence', (origin, delay) => {
  expect(resolveCohortAcquisition(user(origin, delay))).toEqual({ source: 'direct_or_unknown', evidence: 'unknown' });
});

it('includes accounts with no attribution or decisions in Other / unknown', () => {
  const resolved = resolveCohortAcquisition({ email: 'old@example.com', createdAt: signup });
  expect(matchesAcquisition(resolved, { ...window, source: 'direct_or_unknown' })).toBe(true);
  expect(matchesAcquisition(resolved, { ...window, source: 'coast_fire_calculator' })).toBe(false);
});

it('never changes a recorded source or fills missing campaign data from a later calculator', () => {
  const recorded = { ...user(), acquisition: { source: 'direct_or_unknown' } };
  expect(resolveCohortAcquisition(recorded, lead)).toEqual({ source: 'direct_or_unknown', evidence: 'recorded' });
});

it('uses only a matching pre-signup lead for campaign attribution', () => {
  const resolved = resolveCohortAcquisition(user(), lead);
  const filters = { ...window, source: 'coast_fire_calculator' as const, channel: 'google_ads' as const, campaign: 'coast_fire' };
  expect(matchesAcquisition(resolved, filters)).toBe(true);
  expect(matchesAcquisition(resolved, { ...filters, campaign: 'retirement' })).toBe(false);
  expect(matchesAcquisition(resolved, { ...filters, source: 'retirement_calculator' })).toBe(false);
  for (const mismatch of [
    { ...lead, token: 'another-token' }, { ...lead, email: 'other@example.com' },
    { ...lead, createdAt: new Date(+signup + 1) },
  ]) {
    const rejected = resolveCohortAcquisition(user(), mismatch);
    expect(rejected.source).toBe('coast_fire_calculator');
    expect(matchesAcquisition(rejected, filters)).toBe(false);
  }
});

it.each(['cpc', 'ppc', 'paid', 'display'])('includes Google %s traffic and requires real evidence', medium => {
  expect(matchesAcquisition({ source: 'direct_or_unknown', evidence: 'recorded', utmSource: 'Google', utmMedium: medium }, { ...window, channel: 'google_ads' })).toBe(true);
  expect(matchesAcquisition({ source: 'coast_fire_calculator', evidence: 'recovered' }, { ...window, channel: 'google_ads' })).toBe(false);
  expect(matchesAcquisition({ source: 'direct_or_unknown', evidence: 'recorded', utmSource: 'bing', utmMedium: medium }, { ...window, channel: 'google_ads' })).toBe(false);
});

it.each(['gclid', 'gbraid', 'wbraid'])('recognizes %s without campaign UTMs', clickId => {
  expect(matchesAcquisition({ source: 'direct_or_unknown', evidence: 'recorded', [clickId]: 'real-click' }, { ...window, channel: 'google_ads' })).toBe(true);
});

it('looks up historical campaigns by exact token and calculator, without reading financial data', async () => {
  const db = { coastFireLead: { findMany: jest.fn().mockResolvedValue([lead]) }, retirementLead: { findMany: jest.fn().mockResolvedValue([]) } };
  (getPrismaClient as jest.Mock).mockReturnValue(db);
  const coast = user(); const retirement = user('calculator_retirement');
  const result = await filterByAcquisition([coast, retirement, { ...user(), acquisition: { source: 'direct_or_unknown' } }], { ...window, channel: 'google_ads', campaign: 'coast_fire' });
  expect(result.map(row => row.user)).toEqual([coast]); // Same token in the other calculator cannot borrow attribution.
  expect(db.coastFireLead.findMany).toHaveBeenCalledTimes(1);
  expect(db.coastFireLead.findMany.mock.calls[0][0]).toEqual({
    where: { token: { in: ['seed-token'] } },
    select: { token: true, email: true, createdAt: true, utmSource: true, utmMedium: true, utmCampaign: true, gclid: true, gbraid: true, wbraid: true },
  });
});

it('does not need lead queries for source-only filtering and keeps sources disjoint', async () => {
  (getPrismaClient as jest.Mock).mockImplementation(() => { throw new Error('No database expected'); });
  const users = [user(), user('calculator_retirement'), user('user')];
  const groups = await Promise.all((['coast_fire_calculator', 'retirement_calculator', 'direct_or_unknown'] as const)
    .map(source => filterByAcquisition(users, { ...window, source })));
  expect(groups.map(group => group.length)).toEqual([1, 1, 1]);
  expect(await filterByAcquisition(users, window)).toHaveLength(3);
});
