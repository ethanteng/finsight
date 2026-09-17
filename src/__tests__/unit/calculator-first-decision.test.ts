import { describe, expect, it, beforeEach } from '@jest/globals';

/**
 * The lead store and Prisma are the only things this module touches, and both
 * are held here so a case can decide what they say. The composition helpers
 * are pure and are exercised directly.
 */
const leads = { read: jest.fn<Promise<unknown>, unknown[]>(async () => null) };
jest.mock('../../services/retirement-leads', () => ({
  ...(jest.requireActual('../../services/retirement-leads') as object),
  readRetirementLead: (...args: unknown[]) => leads.read(...args),
}));

const db = {
  count: jest.fn<Promise<number>, unknown[]>(async () => 0),
  create: jest.fn<Promise<unknown>, unknown[]>(async () => ({ id: 'conversation-1' })),
};
jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    conversation: {
      count: (...args: unknown[]) => db.count(...args),
      create: (...args: unknown[]) => db.create(...args),
    },
  }),
}));

import {
  buildDecisionAnswer,
  buildDecisionQuestion,
  resolveCalculatorLead,
  seedFirstDecisionFromLead,
} from '../../services/calculator-first-decision';
import type { RetirementLeadRecord } from '../../services/retirement-leads';

function lead(overrides: Partial<RetirementLeadRecord> = {}): RetirementLeadRecord {
  return {
    token: 'a'.repeat(48),
    email: 'reader@example.com',
    inputs: {
      currentAge: 54,
      retirementAge: 60,
      investableAssets: 2_273_872,
      annualSpending: 132_000,
      annualContributions: 48_000,
      socialSecurityAnnual: 41_400,
      socialSecurityStartAge: 67,
      lifeExpectancy: 95,
      allocation: 'balanced',
    },
    outcome: {
      survivalRate: 0.873,
      sequencesTested: 709,
      sequencesSurvived: 619,
      projectedPortfolioAtRetirement: 3_326_191.63,
      firstYearWithdrawalRate: 0.0397,
    },
    ...overrides,
  } as RetirementLeadRecord;
}

beforeEach(() => {
  leads.read.mockReset().mockResolvedValue(null);
  db.count.mockReset().mockResolvedValue(0);
  db.create.mockReset().mockResolvedValue({ id: 'conversation-1' });
});

describe('the question a calculator run becomes', () => {
  /*
   * A calculator is a form, so there is no prompt to carry over. The decision
   * still needs one: a thread with no question reads as a stray note, and a
   * follow-up has nothing to continue from.
   */
  it('states the plan back using only figures the visitor entered', () => {
    const question = buildDecisionQuestion(lead());

    expect(question).toContain('Can I retire at 60?');
    expect(question).toContain('I am 54 now');
    expect(question).toContain('$2,273,872');
    expect(question).toContain('$132,000');
    expect(question).toContain('$48,000');
    expect(question).toContain('$41,400');
    expect(question).toContain('age 67');
  });

  /*
   * Asserted whole rather than by substring. The first version of this joined
   * every clause with commas and read "...am saving $48,000 a year until then,
   * I expect $41,400 of Social Security" — a comma splice that every
   * `toContain` in this file still passed.
   */
  it('reads as sentences, with Social Security as its own', () => {
    expect(buildDecisionQuestion(lead())).toBe(
      'Can I retire at 60? I am 54 now. I have $2,273,872 invested, expect to spend $132,000 ' +
      'a year in retirement, and am saving $48,000 a year until then. I also expect $41,400 ' +
      'a year of Social Security from age 67.'
    );
  });

  it('joins two clauses with "and" rather than a comma', () => {
    expect(buildDecisionQuestion(lead({
      inputs: { ...lead().inputs, annualContributions: 0, socialSecurityAnnual: 0 },
    }))).toBe(
      'Can I retire at 60? I am 54 now. I have $2,273,872 invested and expect to spend ' +
      '$132,000 a year in retirement.'
    );
  });

  it('leaves out a contribution and a benefit the visitor did not enter', () => {
    const question = buildDecisionQuestion(lead({
      inputs: { ...lead().inputs, annualContributions: 0, socialSecurityAnnual: 0 },
    }));

    expect(question).not.toContain('saving');
    expect(question).not.toContain('Social Security');
    expect(question).toContain('$2,273,872');
  });
});

/* The app renders `Conversation.answer` through MarkdownRenderer, so the
 * emphasis below is markup rather than literal asterisks on the screen. */
describe('the answer a calculator run becomes', () => {
  /*
   * The emailed figures, not a fresh run. A token lives for ninety days and
   * the engine and its dataset change inside that; a saved decision that
   * disagrees with the email that produced it is worse than no decision.
   */
  it('states the verdict the email stated', () => {
    const answer = buildDecisionAnswer(lead());

    expect(answer).toContain('619 of the 709');
    expect(answer).toContain('87.3%');
    expect(answer).toContain('$3,326,192');
    expect(answer).toContain('3.97%');
    expect(answer).toContain('**Histories that ran short:** 90');
  });

  it('does not invent a failure when nothing ran short', () => {
    const answer = buildDecisionAnswer(lead({
      outcome: { ...lead().outcome, survivalRate: 1, sequencesSurvived: 709 },
    }));

    expect(answer).toContain('**Histories that ran short:** none');
    expect(answer).toContain('100.0%');
  });

  /* The limit of a run made from six numbers, and why the app is worth opening. */
  it('says the asset mix was a preset and what is not modeled', () => {
    const answer = buildDecisionAnswer(lead());

    expect(answer).toContain('balanced preset');
    expect(answer).toContain('taxes, fees and account types are not modeled');
    expect(answer).toContain('Connect your accounts');
  });
});

/*
 * Resolution is separate from writing because two things hang off it: what the
 * first decision says, and whether the address still needs a code. It runs
 * before the account exists, and the address match is what makes holding a
 * token proof of controlling the inbox.
 */
describe('resolveCalculatorLead', () => {
  it('returns the lead for a live token addressed to the registering email', async () => {
    leads.read.mockResolvedValue(lead());

    const resolved = await resolveCalculatorLead({
      token: 'a'.repeat(48),
      email: 'reader@example.com',
    });
    expect(resolved?.email).toBe('reader@example.com');
  });

  /*
   * The control that matters. A token is the only key to a lead, and a lead
   * holds somebody's retirement figures — so a forwarded link must not let
   * whoever received it copy that plan into an account of their own, nor
   * count as proof of an address they do not control.
   */
  it('refuses a token whose lead was sent to a different address', async () => {
    leads.read.mockResolvedValue(lead({ email: 'someone-else@example.com' }));

    expect(await resolveCalculatorLead({
      token: 'a'.repeat(48),
      email: 'attacker@example.com',
    })).toBeNull();
  });

  it('matches the address regardless of case or surrounding space', async () => {
    leads.read.mockResolvedValue(lead({ email: 'Reader@Example.com' }));

    expect(await resolveCalculatorLead({
      token: 'a'.repeat(48),
      email: ' reader@example.com ',
    })).not.toBeNull();
  });

  it('returns null for an unknown or expired token, without reading one that is absent', async () => {
    leads.read.mockResolvedValue(null);
    expect(await resolveCalculatorLead({
      token: 'b'.repeat(48), email: 'reader@example.com',
    })).toBeNull();

    leads.read.mockClear();
    for (const token of [undefined, null, '', '   ', 42]) {
      expect(await resolveCalculatorLead({ token, email: 'reader@example.com' })).toBeNull();
    }
    expect(leads.read).not.toHaveBeenCalled();
  });

  it('returns null rather than throwing when the lookup fails', async () => {
    leads.read.mockRejectedValue(new Error('database down'));

    expect(await resolveCalculatorLead({
      token: 'a'.repeat(48), email: 'reader@example.com',
    })).toBeNull();
  });
});

describe('seedFirstDecisionFromLead', () => {
  it('writes the run as the account\u2019s first decision', async () => {
    const outcome = await seedFirstDecisionFromLead({ userId: 'user-1', lead: lead() });

    expect(outcome).toBe('seeded');
    const [call] = db.create.mock.calls as Array<[{ data: Record<string, string> }]>;
    expect(call[0].data.userId).toBe('user-1');
    expect(call[0].data.question).toContain('Can I retire at 60?');
    expect(call[0].data.answer).toContain('619 of the 709');
  });

  it('does nothing, quietly, for a signup that resolved no lead', async () => {
    expect(await seedFirstDecisionFromLead({ userId: 'user-1', lead: null })).toBe('no-lead');
    expect(db.create).not.toHaveBeenCalled();
  });

  /* Registration can be retried, and this runs unawaited on each attempt. */
  it('does not add a second copy to an account that already has decisions', async () => {
    db.count.mockResolvedValue(1);

    expect(await seedFirstDecisionFromLead({ userId: 'user-1', lead: lead() }))
      .toBe('already-has-decisions');
    expect(db.create).not.toHaveBeenCalled();
  });

  /*
   * Registration has already succeeded by the time this runs. A database that
   * will not take the row costs a better home screen, never the account.
   */
  it('swallows a write failure instead of escaping into the caller', async () => {
    db.create.mockRejectedValue(new Error('constraint violation'));

    expect(await seedFirstDecisionFromLead({ userId: 'user-1', lead: lead() })).toBe('failed');
  });
});
