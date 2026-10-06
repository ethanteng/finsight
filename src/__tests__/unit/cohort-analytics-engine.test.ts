import {
  activationPeriod,
  addGrain,
  buildActivationReport,
  buildEngagementReport,
  cohortStarts,
  requiredQuestions,
  requiredQuestionsRange,
  startOfGrain,
} from '../../cohort-analytics/engine';
import { resolveFirstLink, type FirstLinkEvidence } from '../../cohort-analytics/first-link';
import type { CohortMember, CohortWindow } from '../../cohort-analytics/types';

const at = (iso: string) => new Date(iso);

function member(userId: string, startedAt: string, overrides: Partial<CohortMember> = {}): CohortMember {
  return {
    userId,
    email: `${userId}@example.com`,
    startedAt: at(startedAt),
    signedUpAt: at(startedAt),
    trialStartedAt: null,
    firstChargeAt: null,
    subscriptionStatus: 'inactive',
    tier: 'premium',
    lastLoginAt: null,
    ...overrides,
  };
}

const weekly: CohortWindow = { segment: 'trial', cohortGrain: 'week', periodGrain: 'week', cohortCount: 3, periodCount: 3 };

describe('cohort calendar', () => {
  it('buckets on UTC dates with Monday weeks', () => {
    // Sunday evening UTC is still the week that began the previous Monday.
    expect(startOfGrain(at('2026-10-04T23:30:00Z'), 'week').toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(startOfGrain(at('2026-10-05T00:00:00Z'), 'week').toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(startOfGrain(at('2026-10-17T12:00:00Z'), 'month').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(startOfGrain(at('2026-10-17T12:00:00Z'), 'day').toISOString()).toBe('2026-10-17T00:00:00.000Z');
  });

  it('clamps month arithmetic to the target month without drifting', () => {
    const start = at('2026-01-31T10:00:00Z');
    expect(addGrain(start, 'month', 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addGrain(start, 'month', 2).toISOString()).toBe('2026-03-31T10:00:00.000Z');
    expect(addGrain(at('2026-03-31T00:00:00Z'), 'month', -1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('lists cohort starts oldest first, ending with the current one', () => {
    expect(cohortStarts(at('2026-10-07T00:00:00Z'), 'week', 3).map(d => d.toISOString().slice(0, 10)))
      .toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(cohortStarts(at('2026-03-15T00:00:00Z'), 'month', 3).map(d => d.toISOString().slice(0, 10)))
      .toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
});

describe('engagement threshold', () => {
  it('is the raw count when the rule and the column share a grain', () => {
    expect(requiredQuestions({ questions: 4, per: 'month' }, 'month', at('2026-01-01Z'), at('2026-02-01Z'))).toBe(4);
    expect(requiredQuestionsRange({ questions: 3, per: 'week' }, 'week')).toEqual({ min: 3, max: 3 });
  });

  it('scales to the column length and rounds up to whole questions', () => {
    // 3 per week in a daily column needs any question at all.
    expect(requiredQuestionsRange({ questions: 3, per: 'week' }, 'day')).toEqual({ min: 1, max: 1 });
    // 1 per day across a week needs 7.
    expect(requiredQuestionsRange({ questions: 1, per: 'day' }, 'week')).toEqual({ min: 7, max: 7 });
    // 1 per week across a month depends on the month: 4 in February, 5 in a 31-day month.
    expect(requiredQuestionsRange({ questions: 1, per: 'week' }, 'month')).toEqual({ min: 4, max: 5 });
  });
});

describe('buildEngagementReport', () => {
  const now = at('2026-10-07T00:00:00Z');

  it('counts questions in each member’s own periods and leaves unfinished periods out', () => {
    const report = buildEngagementReport({
      window: weekly,
      rule: { questions: 2, per: 'week' },
      now,
      excluded: { operatorAccounts: 1 },
      members: [
        member('a', '2026-09-21T09:00:00Z'),
        member('b', '2026-09-23T09:00:00Z'),
        member('c', '2026-10-06T09:00:00Z'),
        member('outside', '2026-09-01T00:00:00Z'),
      ],
      questionTimes: new Map([
        // a: two questions in week 0, one in week 1.
        ['a', [at('2026-09-21T10:00:00Z'), at('2026-09-25T10:00:00Z'), at('2026-09-29T10:00:00Z')].map(d => d.getTime())],
        // b: two questions in week 1 (Sep 30 - Oct 7) — not complete until Oct 7 09:00.
        ['b', [at('2026-10-01T10:00:00Z'), at('2026-10-02T10:00:00Z')].map(d => d.getTime())],
      ]),
    });

    expect(report.cohorts.map(row => row.key)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    const [first, empty, current] = report.cohorts;
    expect(first.size).toBe(2);
    expect(empty.size).toBe(0);
    expect(current.size).toBe(1);

    // Week 0: both a and b finished it; only a asked twice.
    expect(first.cells[0]).toEqual({ rate: 0.5, count: 1, eligible: 2 });
    // Week 1: a finished it (Sep 28 09:00 - Oct 5 09:00) with one question; b has not finished it.
    expect(first.cells[1]).toEqual({ rate: 0, count: 0, eligible: 1 });
    expect(first.cells[2]).toEqual({ rate: null, count: 0, eligible: 0 });
    expect(current.cells[0].rate).toBeNull();

    const a = first.members.find(row => row.userId === 'a')!;
    expect(a.totalQuestions).toBe(3);
    expect(a.periods[0]).toEqual({ questions: 2, required: 2, engaged: true });
    expect(a.periods[1]).toEqual({ questions: 1, required: 2, engaged: false });
    expect(a.periods[2]).toBeNull();

    expect(report.overall[0]).toEqual({ rate: 0.5, count: 1, eligible: 2 });
    expect(report.rule.requiredPerPeriod).toEqual({ min: 2, max: 2 });
    expect(report.excluded.operatorAccounts).toBe(1);
  });

  it('starts paid members’ clocks at their first charge, ignoring earlier questions', () => {
    const report = buildEngagementReport({
      window: { ...weekly, segment: 'paid', cohortCount: 2, periodCount: 1 },
      rule: { questions: 1, per: 'week' },
      now: at('2026-10-20T00:00:00Z'),
      excluded: { operatorAccounts: 0 },
      members: [member('p', '2026-10-12T00:00:00Z', { signedUpAt: at('2026-09-01T00:00:00Z') })],
      questionTimes: new Map([['p', [at('2026-09-02T00:00:00Z').getTime()]]]),
    });
    const [row] = report.cohorts;
    expect(row.members[0].totalQuestions).toBe(0);
    expect(row.cells[0]).toEqual({ rate: 0, count: 0, eligible: 1 });
  });
});

describe('buildActivationReport', () => {
  it('is cumulative, counts pre-start links as period 0, and reports time to link', () => {
    const now = at('2026-10-26T00:00:00Z');
    const report = buildActivationReport({
      window: { ...weekly, cohortCount: 4, periodCount: 3, segment: 'paid' },
      now,
      excluded: { operatorAccounts: 0 },
      members: [
        member('early', '2026-10-05T00:00:00Z'),
        member('week1', '2026-10-05T00:00:00Z'),
        member('never', '2026-10-06T00:00:00Z'),
        member('late', '2026-10-07T00:00:00Z'),
      ],
      firstLinks: new Map([
        ['early', { at: at('2026-09-20T00:00:00Z'), sources: ['plaid'] }],
        ['week1', { at: at('2026-10-14T00:00:00Z'), sources: ['snaptrade'] }],
        ['late', { at: at('2026-10-21T12:00:00Z'), sources: ['public', 'plaid'] }],
      ]),
    });
    const [row] = report.cohorts;
    expect(row.cells[0]).toEqual({ rate: 0.25, count: 1, eligible: 4 });
    expect(row.cells[1]).toEqual({ rate: 0.5, count: 2, eligible: 4 });
    // Period 2 ends Oct 26 for the first two, later for the others: only two are eligible.
    expect(row.cells[2]).toEqual({ rate: 1, count: 2, eligible: 2 });
    expect(row.activatedToDate).toBe(3);

    const byId = Object.fromEntries(row.members.map(m => [m.userId, m]));
    expect(byId.early.activatedInPeriod).toBe(0);
    expect(byId.early.daysToFirstLink).toBe(0);
    expect(byId.week1.activatedInPeriod).toBe(1);
    expect(byId.week1.daysToFirstLink).toBe(9);
    expect(byId.late.activatedInPeriod).toBe(2);
    expect(byId.late.linkSources).toEqual(['public', 'plaid']);
    expect(byId.never.firstLinkedAt).toBeNull();
    expect(row.medianDaysToFirstLink).toBe(9);
  });

  it('places a link on the boundary in the later period', () => {
    expect(activationPeriod(at('2026-10-05T00:00:00Z'), 'week', at('2026-10-12T00:00:00Z'))).toBe(1);
    expect(activationPeriod(at('2026-10-05T00:00:00Z'), 'week', at('2026-10-11T23:59:59Z'))).toBe(0);
  });
});

describe('resolveFirstLink', () => {
  const none: FirstLinkEvidence = {
    plaidTokenCreatedAt: null,
    plaidDisconnectedAt: null,
    snapTradeRegisteredAt: null,
    snapTradeConnectedNow: false,
    snapTradeEvidenceAt: null,
    publicVerifiedCredentialAt: null,
    publicEvidenceAt: null,
  };

  it('finds nothing without evidence', () => {
    expect(resolveFirstLink(none)).toBeNull();
  });

  it('does not count a SnapTrade registration that never reached a brokerage', () => {
    expect(resolveFirstLink({ ...none, snapTradeRegisteredAt: at('2026-10-01T00:00:00Z') })).toBeNull();
  });

  it('dates a visible brokerage from registration', () => {
    expect(resolveFirstLink({ ...none, snapTradeRegisteredAt: at('2026-10-01T00:00:00Z'), snapTradeConnectedNow: true }))
      .toEqual({ at: at('2026-10-01T00:00:00Z'), sources: ['snaptrade'] });
  });

  it('dates a brokerage from registration when a direct Public key replaced it in the snapshot', () => {
    expect(resolveFirstLink({
      ...none,
      snapTradeRegisteredAt: at('2026-09-01T00:00:00Z'),
      publicVerifiedCredentialAt: at('2026-09-20T00:00:00Z'),
    })).toEqual({ at: at('2026-09-01T00:00:00Z'), sources: ['snaptrade', 'public'] });
  });

  it('keeps a link whose rows were deleted when history recorded the removal', () => {
    expect(resolveFirstLink({ ...none, plaidDisconnectedAt: at('2026-10-03T00:00:00Z') }))
      .toEqual({ at: at('2026-10-03T00:00:00Z'), sources: ['plaid'] });
  });

  it('takes the earliest link across providers and lists every provider seen', () => {
    expect(resolveFirstLink({
      ...none,
      plaidTokenCreatedAt: at('2026-10-05T00:00:00Z'),
      publicVerifiedCredentialAt: at('2026-10-02T00:00:00Z'),
    })).toEqual({ at: at('2026-10-02T00:00:00Z'), sources: ['plaid', 'public'] });
  });
});
