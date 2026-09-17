import { describe, expect, it, beforeEach } from '@jest/globals';

/**
 * The lead store and Prisma are the only things this module touches, and both
 * are held here so a case can decide what they say. The composition helpers
 * are pure and are exercised directly.
 */
const leads = {
  readRetirement: jest.fn<Promise<unknown>, unknown[]>(async () => null),
  readCoastFire: jest.fn<Promise<unknown>, unknown[]>(async () => null),
};
jest.mock('../../services/retirement-leads', () => ({
  ...(jest.requireActual('../../services/retirement-leads') as object),
  readRetirementLead: (...args: unknown[]) => leads.readRetirement(...args),
}));
jest.mock('../../services/coast-fire-leads', () => ({
  ...(jest.requireActual('../../services/coast-fire-leads') as object),
  readCoastFireLead: (...args: unknown[]) => leads.readCoastFire(...args),
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
  buildCoastFireAnswer,
  buildCoastFireQuestion,
  buildDecisionAnswer,
  buildDecisionQuestion,
  resolveCalculatorLead,
  seedFirstDecisionFromLead,
} from '../../services/calculator-first-decision';
import type { RetirementLeadRecord } from '../../services/retirement-leads';
import type { CoastFireLeadRecord } from '../../services/coast-fire-leads';

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

/**
 * A Coast FIRE lead carries the figures the email stated, not a fresh run, so
 * the outcome fields here are stored values rather than anything recomputed.
 */
function coastFireLead(overrides: Partial<CoastFireLeadRecord> = {}): CoastFireLeadRecord {
  return {
    token: 'c'.repeat(48),
    email: 'reader@example.com',
    inputs: {
      currentAge: 52,
      retirementAge: 67,
      currentSavings: 900_000,
      annualRetirementSpending: 90_000,
      annualRetirementIncome: 42_000,
      realReturnRate: 5,
      withdrawalRate: 4,
    },
    coastFireNumber: 577_220.91,
    retirementTarget: 1_200_000,
    projectedSavingsAtRetirement: 1_871_034.62,
    hasReachedCoastFire: true,
    ...overrides,
  } as CoastFireLeadRecord;
}

beforeEach(() => {
  leads.readRetirement.mockReset().mockResolvedValue(null);
  leads.readCoastFire.mockReset().mockResolvedValue(null);
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

describe('the question a Coast FIRE run becomes', () => {
  it('owns the return and the withdrawal rate as assumptions the visitor typed', () => {
    expect(buildCoastFireQuestion(coastFireLead())).toBe(
      'Have I reached Coast FIRE? I am 52 now and plan to retire at 67. I have $900,000 in ' +
      'retirement savings, expect to spend $90,000 a year once I stop, and expect $42,000 a year ' +
      'of income from the day I retire. I assumed 5% growth a year after inflation and a 4% ' +
      'withdrawal rate.'
    );
  });

  /* Two clauses join with "and"; three take the serial comma. */
  it('leaves out retirement income the visitor did not enter', () => {
    const question = buildCoastFireQuestion(coastFireLead({
      inputs: { ...coastFireLead().inputs, annualRetirementIncome: 0 },
    }));

    expect(question).toContain(
      'I have $900,000 in retirement savings and expect to spend $90,000 a year once I stop.'
    );
    expect(question).not.toContain('from the day I retire');
  });

  it('writes a fractional rate without inventing precision', () => {
    const question = buildCoastFireQuestion(coastFireLead({
      inputs: { ...coastFireLead().inputs, realReturnRate: 5.5, withdrawalRate: 3.5 },
    }));

    expect(question).toContain('5.5% growth');
    expect(question).toContain('3.5% withdrawal rate');
  });
});

describe('the answer a Coast FIRE run becomes', () => {
  /*
   * The emailed figures, not a fresh run — same reason as the quick plan. The
   * Coast FIRE number, the target and the projection are all stored, so a
   * formula change inside the token's ninety days cannot make this decision
   * disagree with the message that produced it.
   */
  it('states the verdict and the figures the email carried', () => {
    const answer = buildCoastFireAnswer(coastFireLead());

    expect(answer).toContain('On the assumptions you entered, yes.');
    expect(answer).toContain('$577,221');
    expect(answer).toContain('**Portfolio needed at 67:** $1,200,000');
    expect(answer).toContain('$1,871,035');
    expect(answer).toContain('**Retirement income:** $42,000');
  });

  it('says not yet without turning it into an instruction to save harder', () => {
    const answer = buildCoastFireAnswer(coastFireLead({
      inputs: { ...coastFireLead().inputs, currentSavings: 120_000 },
      coastFireNumber: 497_126,
      hasReachedCoastFire: false,
    }));

    expect(answer).toContain('On the assumptions you entered, not yet.');
    expect(answer).not.toMatch(/you should|start saving|save more|keep saving/i);
  });

  /* The limit of a run made from seven numbers, and why the app is worth opening. */
  it('names the single straight line and what it does not model', () => {
    const answer = buildCoastFireAnswer(coastFireLead());

    expect(answer).toContain('a single straight line: 5% every year');
    expect(answer).toContain('no taxes, fees, account types, healthcare, uneven markets');
    expect(answer).toContain('Connect your accounts');
  });

  /*
   * Entered income covering entered spending is a real answer, not an edge
   * case to paper over: the Coast FIRE number is zero, and "you need $0
   * invested today" reads as a broken calculator rather than as the finding.
   */
  it('explains a scenario that asks nothing of the portfolio', () => {
    const answer = buildCoastFireAnswer(coastFireLead({
      inputs: {
        ...coastFireLead().inputs,
        annualRetirementSpending: 60_000,
        annualRetirementIncome: 60_000,
      },
      coastFireNumber: 0,
      retirementTarget: 0,
      hasReachedCoastFire: true,
    }));

    expect(answer).toContain('already covers the $60,000 a year you plan to spend');
    expect(answer).toContain('asks nothing of your portfolio');
    expect(answer).not.toContain('Your Coast FIRE number was $0');
  });

  /* "$0 grows to $0" is true and reads as a bug. */
  it('does not describe nothing as compounding', () => {
    const answer = buildCoastFireAnswer(coastFireLead({
      inputs: { ...coastFireLead().inputs, currentSavings: 0 },
      projectedSavingsAtRetirement: 0,
      hasReachedCoastFire: false,
    }));

    expect(answer).toContain('This projection only compounds what you already have');
    expect(answer).not.toContain('$0 grows to $0');
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
    leads.readRetirement.mockResolvedValue(lead());

    const resolved = await resolveCalculatorLead({
      token: 'a'.repeat(48),
      email: 'reader@example.com',
    });
    expect(resolved).toMatchObject({ kind: 'retirement', lead: { email: 'reader@example.com' } });
  });

  /*
   * The control that matters. A token is the only key to a lead, and a lead
   * holds somebody's retirement figures — so a forwarded link must not let
   * whoever received it copy that plan into an account of their own, nor
   * count as proof of an address they do not control.
   */
  it('refuses a token whose lead was sent to a different address', async () => {
    leads.readRetirement.mockResolvedValue(lead({ email: 'someone-else@example.com' }));

    expect(await resolveCalculatorLead({
      token: 'a'.repeat(48),
      email: 'attacker@example.com',
    })).toBeNull();
  });

  it('matches the address regardless of case or surrounding space', async () => {
    leads.readRetirement.mockResolvedValue(lead({ email: 'Reader@Example.com' }));

    expect(await resolveCalculatorLead({
      token: 'a'.repeat(48),
      email: ' reader@example.com ',
    })).not.toBeNull();
  });

  it('returns null for an unknown or expired token, without reading one that is absent', async () => {
    leads.readRetirement.mockResolvedValue(null);
    expect(await resolveCalculatorLead({
      token: 'b'.repeat(48), email: 'reader@example.com',
    })).toBeNull();

    leads.readRetirement.mockClear();
    for (const token of [undefined, null, '', '   ', 42]) {
      expect(await resolveCalculatorLead({ token, email: 'reader@example.com' })).toBeNull();
    }
    expect(leads.readRetirement).not.toHaveBeenCalled();
  });

  /*
   * Both calculators mint tokens from the same space, so the token itself says
   * which table holds it. The client is never asked, and a retirement lookup
   * that finds nothing is not the answer.
   */
  it('finds a Coast FIRE lead behind a token the retirement table does not hold', async () => {
    leads.readCoastFire.mockResolvedValue(coastFireLead());

    const resolved = await resolveCalculatorLead({
      token: 'c'.repeat(48),
      email: 'reader@example.com',
    });
    expect(resolved).toMatchObject({ kind: 'coast-fire', lead: { email: 'reader@example.com' } });
    expect(leads.readRetirement).toHaveBeenCalled();
  });

  /* The same control, on the second table: a forwarded link is not proof. */
  it('refuses a Coast FIRE token whose lead was sent to a different address', async () => {
    leads.readCoastFire.mockResolvedValue(coastFireLead({ email: 'someone-else@example.com' }));

    expect(await resolveCalculatorLead({
      token: 'c'.repeat(48),
      email: 'attacker@example.com',
    })).toBeNull();
  });

  /* One token cannot be in both tables, and the first hit settles it. */
  it('does not look in the Coast FIRE table once the retirement one answered', async () => {
    leads.readRetirement.mockResolvedValue(lead());

    await resolveCalculatorLead({ token: 'a'.repeat(48), email: 'reader@example.com' });
    expect(leads.readCoastFire).not.toHaveBeenCalled();
  });

  /*
   * `continuedAt` measures the signup page's own exchange of the emailed link.
   * Registration resolves the token a second time, and gets there by way of an
   * address match that can refuse — so marking here would count a forwarded
   * link opened by somebody else as the recipient continuing, in the figure
   * the acquisition experiment reports.
   */
  it('does not record a continuation while deciding whether a token may be claimed', async () => {
    leads.readCoastFire.mockResolvedValue(coastFireLead());

    await resolveCalculatorLead({ token: 'c'.repeat(48), email: 'reader@example.com' });

    for (const read of [leads.readRetirement, leads.readCoastFire]) {
      expect(read).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Date),
        expect.objectContaining({ markContinuation: false }),
      );
    }
  });

  it('returns null rather than throwing when the lookup fails', async () => {
    leads.readRetirement.mockRejectedValue(new Error('database down'));

    expect(await resolveCalculatorLead({
      token: 'a'.repeat(48), email: 'reader@example.com',
    })).toBeNull();
  });
});

describe('seedFirstDecisionFromLead', () => {
  it('writes the run as the account\u2019s first decision', async () => {
    const outcome = await seedFirstDecisionFromLead({
      userId: 'user-1',
      lead: { kind: 'retirement', lead: lead() },
    });

    expect(outcome).toBe('seeded');
    const [call] = db.create.mock.calls as Array<[{ data: Record<string, string> }]>;
    expect(call[0].data.userId).toBe('user-1');
    expect(call[0].data.origin).toBe('calculator_retirement');
    expect(call[0].data.question).toContain('Can I retire at 60?');
    expect(call[0].data.answer).toContain('619 of the 709');
  });

  it('writes a Coast FIRE run as the first decision too', async () => {
    const outcome = await seedFirstDecisionFromLead({
      userId: 'user-1',
      lead: { kind: 'coast-fire', lead: coastFireLead() },
    });

    expect(outcome).toBe('seeded');
    const [call] = db.create.mock.calls as Array<[{ data: Record<string, string> }]>;
    expect(call[0].data.question).toContain('Have I reached Coast FIRE?');
    expect(call[0].data.origin).toBe('calculator_coast_fire');
    expect(call[0].data.answer).toContain('$577,221');
  });

  it('does nothing, quietly, for a signup that resolved no lead', async () => {
    expect(await seedFirstDecisionFromLead({ userId: 'user-1', lead: null })).toBe('no-lead');
    expect(db.create).not.toHaveBeenCalled();
  });

  /* Registration can be retried, and this runs unawaited on each attempt. */
  it('does not add a second copy to an account that already has decisions', async () => {
    db.count.mockResolvedValue(1);

    expect(await seedFirstDecisionFromLead({
      userId: 'user-1',
      lead: { kind: 'retirement', lead: lead() },
    })).toBe('already-has-decisions');
    expect(db.create).not.toHaveBeenCalled();
  });

  /*
   * Registration has already succeeded by the time this runs. A database that
   * will not take the row costs a better home screen, never the account.
   */
  it('swallows a write failure instead of escaping into the caller', async () => {
    db.create.mockRejectedValue(new Error('constraint violation'));

    expect(await seedFirstDecisionFromLead({
      userId: 'user-1',
      lead: { kind: 'retirement', lead: lead() },
    })).toBe('failed');
  });
});
