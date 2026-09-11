import { expect, it, beforeEach, afterAll } from '@jest/globals';

/**
 * The recorder writes bookkeeping for the admin side from an unauthenticated
 * marketing page. Its one hard requirement is that it cannot take the page
 * down with it, so these cases drive it against a database that refuses.
 */
const create = jest.fn();
jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ retirementQuickPlanRun: { create } }),
}));

import {
  recordQuickPlanRejection,
  recordQuickPlanRun,
} from '../../services/retirement-quickplan-log';
import { QuickPlanValidationError } from '../../services/retirement-quickplan';

const SUBMITTED = {
  currentAge: 52,
  retirementAge: 62,
  investableAssets: null,
  annualSpending: 95_000,
  annualContributions: 0,
  socialSecurityAnnual: null,
  socialSecurityStartAge: 67,
  allocation: 'balanced',
};

const RESULT = {
  mode: 'rates' as const,
  assumed: [{ field: 'retirementAge', value: 65, note: 'Example.' }],
  missing: ['investableAssets' as const],
  primary: null,
  sustainableSpendingRates: { p10: 0.031, p50: 0.04 },
  history: { sequencesTested: 834 },
  durationMs: 1200,
  cached: false,
};

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

beforeEach(() => {
  create.mockReset();
  consoleError.mockClear();
});

afterAll(() => {
  consoleError.mockRestore();
});

it('records the shape of a rates run, keeping a blank distinct from a zero', async () => {
  create.mockResolvedValue({} as never);

  await recordQuickPlanRun(SUBMITTED, RESULT as never);

  const { data } = (create.mock.calls[0] as [{ data: Record<string, unknown> }])[0];
  expect(data).toMatchObject({
    outcome: 'rates',
    assumedFields: ['retirementAge'],
    missingFields: ['investableAssets'],
    investableAssets: null,
    annualContributions: 0,
    survivalRate: null,
    sustainableRateP10: 0.031,
    sequencesTested: 834,
  });
});

it('records a refusal with the field the model named', async () => {
  create.mockResolvedValue({} as never);

  await recordQuickPlanRejection(
    { ...SUBMITTED, investableAssets: 0 },
    new QuickPlanValidationError('investableAssets', 'Investment assets must be between…')
  );

  const { data } = (create.mock.calls[0] as [{ data: Record<string, unknown> }])[0];
  expect(data).toMatchObject({ outcome: 'rejected', rejectedField: 'investableAssets', investableAssets: 0 });
});

it('resolves rather than throwing when the database refuses the write', async () => {
  create.mockRejectedValue(new Error('relation does not exist') as never);

  // The route does not await these, so a rejection here would surface as an
  // unhandled rejection rather than a failed request — worse, not better.
  await expect(recordQuickPlanRun(SUBMITTED, RESULT as never)).resolves.toBeUndefined();
  await expect(
    recordQuickPlanRejection(SUBMITTED, new QuickPlanValidationError('currentAge', 'nope'))
  ).resolves.toBeUndefined();
  expect(consoleError).toHaveBeenCalledTimes(2);
});

it('drops an age the column cannot hold rather than losing the whole row', async () => {
  create.mockResolvedValue({} as never);

  // A visitor can type a fractional age, and the rejection it causes is
  // exactly the row worth keeping.
  await recordQuickPlanRun({ ...SUBMITTED, currentAge: 52.5 }, RESULT as never);

  const { data } = (create.mock.calls[0] as [{ data: Record<string, unknown> }])[0];
  expect(data.currentAge).toBeNull();
  expect(data.retirementAge).toBe(62);
});
