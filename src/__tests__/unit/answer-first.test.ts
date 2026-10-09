/**
 * Ask Linc answers with what it has: linked data, the user's own figures, and
 * disclosed assumptions. A missing link changes the basis of an answer, never
 * whether there is one, and "not linked" is never read as "zero".
 */
import { describe, expect, it } from '@jest/globals';
import {
  describeLinkedData,
  describeLinkedDataForModel,
  incomeLinked,
  NOTHING_LINKED,
  spendingLinked,
} from '../../openai/linked-data';
import { buildCanonicalFactPack } from '../../openai/canonical-facts';
import { buildFinancialReasoningPrompt, buildPromptInputFromSnapshot } from '../../openai/financial-reasoning-prompt';
import { collectMissingInputAsks } from '../../openai/missing-inputs';
import { questionNeedsFromPacks, type ContextPackId } from '../../openai/context-packs';
import { fallbackContextPlan } from '../../openai/context-planner';
import { buildSnapshotSummaryForValidation } from '../../openai/response-validator';

const needs = (...packs: ContextPackId[]) => questionNeedsFromPacks(packs, false);

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    accounts: [],
    bankingTransactions: [],
    metadata: { lastUpdated: new Date(), dataSources: {}, errors: [] },
    tierContext: { tierInfo: { currentTier: 'starter', availableSources: [] }, upgradeHints: [], marketContext: {} },
    financialSummary: {
      computedAt: '2026-10-01T00:00:00.000Z',
      financialOverview: { netWorth: 0, totalCash: 0, totalInvestments: 0, totalDebt: 0, homeValue: null },
      investmentPortfolio: { totalValue: 0, holdingCount: 0, assetAllocation: [] },
    },
    ...overrides,
  } as any;
}

const linked = (overrides: Partial<typeof NOTHING_LINKED>) => ({ ...NOTHING_LINKED, ...overrides });
const entered = (overrides: Partial<NonNullable<typeof NOTHING_LINKED['entered']>>) =>
  ({ accounts: 0, cash: 0, credit: 0, loans: 0, investments: 0, ...overrides });

describe('linked data', () => {
  it('counts linked accounts by kind with the shared classifier', () => {
    const record = describeLinkedData({
      accounts: [
        { type: 'depository', subtype: 'checking' },
        { type: 'credit', subtype: 'credit card' },
        { type: 'loan', subtype: 'mortgage' },
        { type: 'investment', subtype: '401k' },
        { type: 'investment', subtype: 'brokerage' },
      ],
      holdingCount: 12,
      transactionMonths: 4,
    });

    expect(record).toEqual({ accounts: 5, cash: 1, credit: 1, loans: 1, investments: 2, holdings: 12, transactionMonths: 4 });
  });

  it('counts a balance the user entered by hand apart from what is linked', () => {
    const record = describeLinkedData({
      accounts: [
        { type: 'credit', subtype: 'credit card' },
        // Each of the three ways a snapshot marks a hand-entered balance.
        { type: 'investment', subtype: 'brokerage', source: 'manual' },
        { type: 'depository', subtype: 'checking', account_id: 'manual-abc' },
        { type: 'loan', subtype: 'mortgage', institution: 'Manual' },
      ],
      transactionMonths: 3,
    });

    expect(record).toEqual({
      accounts: 1, cash: 0, credit: 1, loans: 0, investments: 0, holdings: 0, transactionMonths: 3,
      entered: { accounts: 3, cash: 1, credit: 0, loans: 1, investments: 1 },
    });
    // A cash balance the user typed in has no paycheck behind it.
    expect(incomeLinked(record)).toBe(false);
  });

  it('reads income only from a cash account, and spending from a card too', () => {
    const cardOnly = linked({ accounts: 1, credit: 1, transactionMonths: 3 });
    expect(spendingLinked(cardOnly)).toBe(true);
    expect(incomeLinked(cardOnly)).toBe(false);
    // Linked but not reported yet: nothing to read from, and nothing the user can do.
    expect(spendingLinked(linked({ accounts: 1, cash: 1 }))).toBe(false);
  });

  it('tells the model that an empty connection is not a zero balance', () => {
    expect(describeLinkedDataForModel(NOTHING_LINKED)).toMatch(/never describe their cash, investments, debt, income or spending as zero/);
    expect(describeLinkedDataForModel(linked({ accounts: 1, cash: 1, transactionMonths: 3 })))
      .toMatch(/no credit cards, no loans or a mortgage, no investment or retirement accounts/);
    expect(describeLinkedDataForModel(undefined)).toBeNull();
  });

  it('tells the model a balance the user entered is theirs, and not linked', () => {
    const enteredOnly = describeLinkedDataForModel(linked({ entered: entered({ accounts: 1, investments: 1 }) }))!;
    expect(enteredOnly).toContain('The user has not linked any accounts yet.');
    expect(enteredOnly).toContain('The user entered their investment balances by hand; they are not linked.');
    expect(enteredOnly).toContain('never a linked or connected account');
    expect(enteredOnly).not.toContain('There are no balances');

    const mixed = describeLinkedDataForModel(linked({
      accounts: 1, cash: 1, transactionMonths: 3, entered: entered({ accounts: 1, investments: 1 }),
    }))!;
    // Investments are covered by the entered balance, so they are not called missing.
    expect(mixed).toContain('but no credit cards, no loans or a mortgage.');
    expect(mixed).toContain('The user entered their investment balances by hand');
  });
});

describe('the fact pack never quotes an empty connection', () => {
  it('publishes no balances at all when nothing is linked', () => {
    const pack = buildCanonicalFactPack(snapshot({ linkedData: NOTHING_LINKED }), 'What is my net worth?', needs());
    const ids = pack.facts.map((fact) => fact.id);

    for (const id of ['net_worth', 'total_cash', 'total_investments', 'total_debt', 'portfolio_value', 'portfolio_holding_count']) {
      expect(ids).not.toContain(id);
    }
  });

  it('keeps what is linked and names what net worth leaves out', () => {
    const data = snapshot({
      linkedData: linked({ accounts: 1, cash: 1, transactionMonths: 3 }),
      financialSummary: {
        computedAt: '2026-10-01T00:00:00.000Z',
        financialOverview: { netWorth: 12_000, totalCash: 12_000, totalInvestments: 0, totalDebt: 0, homeValue: null },
      },
    });
    const pack = buildCanonicalFactPack(data, 'What is my net worth?', needs());

    expect(pack.facts.find((fact) => fact.id === 'total_cash')?.value).toBe(12_000);
    expect(pack.facts.some((fact) => fact.id === 'total_investments')).toBe(false);
    expect(pack.facts.some((fact) => fact.id === 'total_debt')).toBe(false);
    expect(pack.facts.find((fact) => fact.id === 'net_worth')?.label)
      .toBe('Net worth across linked accounts only (no investment accounts, no credit cards or loans linked)');
  });

  it('publishes balances the user entered, labelled as theirs rather than linked', () => {
    const data = snapshot({
      linkedData: linked({ entered: entered({ accounts: 1, investments: 1 }) }),
      financialSummary: {
        computedAt: '2026-10-01T00:00:00.000Z',
        financialOverview: { netWorth: 500_000, totalCash: 0, totalInvestments: 500_000, totalDebt: 0, homeValue: null },
        investmentPortfolio: { totalValue: 500_000, holdingCount: 0, assetAllocation: [] },
      },
    });
    const facts = buildCanonicalFactPack(data, 'What is my net worth?', needs()).facts;
    const fact = (id: string) => facts.find((item) => item.id === id);

    expect(fact('total_investments')).toMatchObject({ value: 500_000, label: 'Total investments (entered by the user, not linked)' });
    expect(fact('portfolio_value')?.label).toBe('Portfolio value (entered by the user, not linked)');
    expect(fact('net_worth')?.label)
      .toBe('Net worth from balances the user entered, with nothing linked (no cash accounts, no credit cards or loans entered)');
    expect(fact('total_cash')).toBeUndefined();
    expect(fact('total_debt')).toBeUndefined();
  });

  it('names the home value as part of net worth, not as money the user entered', () => {
    const withHome = (linkedData: Record<string, unknown>) => buildCanonicalFactPack(snapshot({
      linkedData,
      financialSummary: {
        computedAt: '2026-10-01T00:00:00.000Z',
        financialOverview: { netWorth: 510_000, totalCash: 10_000, totalInvestments: 0, totalDebt: 0, homeValue: 500_000 },
      },
    }), 'What is my net worth?', needs()).facts.find((fact) => fact.id === 'net_worth')?.label;

    expect(withHome(linked({ entered: entered({ accounts: 1, cash: 1 }) }))).toBe(
      'Net worth from balances the user entered and the home value, with nothing linked ' +
      '(no investment accounts, no credit cards or loans entered)'
    );
    expect(withHome(linked({ accounts: 1, cash: 1, transactionMonths: 3 }))).toBe(
      'Net worth across linked accounts and the home value only (no investment accounts, no credit cards or loans linked)'
    );
    expect(buildSnapshotSummaryForValidation(snapshot({
      linkedData: linked({ entered: entered({ accounts: 1, cash: 1 }) }),
      financialSummary: {
        computedAt: '2026-10-01T00:00:00.000Z',
        financialOverview: { netWorth: 510_000, totalCash: 10_000, totalInvestments: 0, totalDebt: 0, homeValue: 500_000 },
      },
    }))).toContain('netWorth=510000 (balances the user entered and the home value, nothing linked;');
  });

  it('says which totals mix linked accounts with balances the user entered', () => {
    const data = snapshot({
      linkedData: linked({
        accounts: 2, cash: 1, investments: 1, transactionMonths: 3,
        entered: entered({ accounts: 1, investments: 1 }),
      }),
      financialSummary: {
        computedAt: '2026-10-01T00:00:00.000Z',
        financialOverview: { netWorth: 112_000, totalCash: 12_000, totalInvestments: 100_000, totalDebt: 0, homeValue: null },
      },
    });
    const facts = buildCanonicalFactPack(data, 'What is my net worth?', needs()).facts;
    const label = (id: string) => facts.find((item) => item.id === id)?.label;

    expect(label('total_cash')).toBe('Total cash');
    expect(label('total_investments')).toBe('Total investments (linked accounts plus balances the user entered)');
    expect(label('net_worth'))
      .toBe('Net worth across linked accounts and balances the user entered (no credit cards or loans linked or entered)');
  });

  it('publishes the plan saved in Your numbers as the user\'s own figures, dated', () => {
    const pack = buildCanonicalFactPack(snapshot({
      linkedData: NOTHING_LINKED,
      statedFigures: {
        retirementAge: { value: 60, savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
        annualRetirementSpending: { value: 80_000, savedAt: '2026-09-14T10:00:00.000Z', source: 'answer' },
        allocation: { value: 'growth', savedAt: '2026-09-14T10:00:00.000Z', source: 'page' },
      },
    }), 'When can I retire?', needs());
    const fact = (id: string) => pack.facts.find((item) => item.id === id);

    expect(fact('saved_retirement_age')).toMatchObject({
      value: 60,
      unit: 'age',
      label: 'Age you plan to retire, as the user saved it in Your numbers on Sep 14, 2026',
      provenance: { kind: 'user_input', source: 'statedFigures.retirementAge' },
    });
    expect(fact('saved_annual_retirement_spending')).toMatchObject({ value: 80_000, unit: 'usd' });
    expect(pack.facts.some((item) => item.id.startsWith('saved_allocation'))).toBe(false);
  });

  it('behaves as it always has without the record', () => {
    const pack = buildCanonicalFactPack(snapshot(), 'What is my net worth?', needs());
    expect(pack.facts.find((fact) => fact.id === 'net_worth')).toMatchObject({ label: 'Net worth', value: 0 });
  });

  it('lets the user\'s own figures from earlier in the decision be repeated back', () => {
    const pack = buildCanonicalFactPack(
      snapshot({ linkedData: NOTHING_LINKED }),
      'And if I retired two years later?',
      needs(),
      ['I have $500,000 saved and spend $80,000 a year. I am 38 years old.']
    );
    const earlier = pack.facts.filter((fact) => fact.id.startsWith('user_input_earlier_'));

    expect(earlier.map((fact) => [fact.value, fact.unit])).toEqual(expect.arrayContaining([
      [500_000, 'usd'],
      [80_000, 'usd'],
      [38, 'age'],
    ]));
    expect(earlier.every((fact) => fact.provenance.kind === 'user_input')).toBe(true);
  });

  it('does not publish $0 monthly income for a card-only connection', () => {
    const pack = buildCanonicalFactPack(
      snapshot({
        linkedData: linked({ accounts: 1, credit: 1, transactionMonths: 2 }),
        transactionSummary: {
          byMonth: {
            '2026-01': { income: 0, expense: 400, operatingCashFlow: -400 },
            '2026-02': { income: 0, expense: 350, operatingCashFlow: -350 },
          },
        },
        cashFlowForecast: {
          status: 'available',
          highlights: [{
            key: 'this_month',
            start: '2026-03-01',
            endExclusive: '2026-04-01',
            actualToDate: null,
            actualCoverage: 'none',
            remaining: null,
            projected: { income: 0, spending: 400, net: -400 },
            planned: { income: 0, spending: 0, net: 0 },
            projectedWithoutPlanned: null,
          }],
          recurring: [{ flow: 'income', label: 'Pay', amount: 0, cadence: 'monthly' }],
        },
      }),
      'What am I spending?',
      needs('monthly_cash_flow', 'cash_flow_forecast')
    );
    const ids = pack.facts.map((fact) => fact.id);

    expect(ids.some((id) => id.startsWith('income_'))).toBe(false);
    expect(ids.some((id) => id.startsWith('operating_cash_flow_'))).toBe(false);
    expect(ids).toContain('expenses_2026-01');
    expect(ids.some((id) => id.includes('projected_income'))).toBe(false);
    expect(ids.some((id) => id.includes('projected_net'))).toBe(false);
    expect(ids.some((id) => id.includes('projected_spending'))).toBe(true);
    expect(ids.some((id) => id.startsWith('cash_flow_recurring_'))).toBe(false);
  });
});

describe('the reviewer is shown the same totals as the answer', () => {
  it('leaves out a zero for a kind nobody linked, and names what net worth leaves out', () => {
    const data = snapshot({
      linkedData: linked({ accounts: 1, cash: 1, transactionMonths: 3 }),
      financialSummary: {
        computedAt: '2026-10-01T00:00:00.000Z',
        financialOverview: { netWorth: 12_000, totalCash: 12_000, totalInvestments: 0, totalDebt: 0, homeValue: null },
        investmentPortfolio: { totalValue: 0, holdingsCount: 0, assetAllocation: [] },
      },
    });
    const summary = buildSnapshotSummaryForValidation(data);

    expect(summary).toContain('Financial overview: netWorth=12000 (linked accounts only; no investment accounts, no credit cards or loans linked), totalCash=12000, homeValue=null');
    expect(summary).not.toMatch(/totalInvestments=|totalDebt=|Investment portfolio:/);
  });

  it('shows the balances the user entered, labelled as theirs', () => {
    const summary = buildSnapshotSummaryForValidation(snapshot({
      linkedData: linked({ entered: entered({ accounts: 1, investments: 1 }) }),
      financialSummary: {
        computedAt: '2026-10-01T00:00:00.000Z',
        financialOverview: { netWorth: 500_000, totalCash: 0, totalInvestments: 500_000, totalDebt: 0, homeValue: null },
      },
    }));

    expect(summary).toContain('Financial overview: netWorth=500000 (balances the user entered, nothing linked; ' +
      'no cash accounts, no credit cards or loans entered), totalInvestments=500000 (entered by the user, not linked), homeValue=null');
    expect(summary).not.toContain('balance totals are not available');
  });

  it('shows no balances when nothing is linked', () => {
    const summary = buildSnapshotSummaryForValidation(snapshot({ linkedData: NOTHING_LINKED }));
    expect(summary).toContain('Financial overview: no linked accounts; balance totals are not available (not zero), homeValue=null');
    expect(summary).not.toMatch(/netWorth=|totalCash=/);
  });
});

describe('the answer prompt answers first', () => {
  const { systemPrompt, userMessage } = buildFinancialReasoningPrompt(
    buildPromptInputFromSnapshot('What is my net worth?', snapshot({ linkedData: NOTHING_LINKED }), needs(), [])
  );

  it('leads with the answer, names assumptions, and leaves linking to the application', () => {
    expect(systemPrompt).toContain('Never open with what you cannot see, and never reply only that something is missing.');
    expect(systemPrompt).toContain('Whenever an answer rests on an assumption, say so in the same sentence');
    expect(systemPrompt).toContain('Do not tell the user to link or connect accounts.');
    expect(systemPrompt).not.toContain('explain what is missing instead of estimating it');
  });

  it('states what is not linked beside the facts', () => {
    expect(userMessage).toContain('## What the User Has Linked');
    expect(userMessage).toContain('The user has not linked any accounts yet.');
  });
});

describe('the closing note says what linking would change', () => {
  const ask = (data: Record<string, unknown>, packs: ContextPackId[], personalDataQuestion = true) =>
    collectMissingInputAsks(data as any, needs(...packs), { personalDataQuestion });

  it('names the account and the better answer for a spending question', () => {
    const [note] = ask({ linkedData: NOTHING_LINKED }, ['transaction_details']);
    expect(note.id).toBe('link_for_cash_flow');
    expect(note.message).toContain('Link the checking account your pay lands in');
    expect(note.message).toContain('what you really spend each month and on what');
  });

  it('asks only for the income when a card is linked but no checking account', () => {
    const [note] = ask({ linkedData: linked({ accounts: 1, credit: 1, transactionMonths: 3 }) }, ['monthly_cash_flow']);
    expect(note.id).toBe('link_for_income');
  });

  it('offers holdings for an investment question with no brokerage linked', () => {
    const [note] = ask({ linkedData: linked({ accounts: 1, cash: 1, transactionMonths: 3 }) }, ['investment_details']);
    expect(note.id).toBe('link_for_investments');
    expect(note.message).toContain('what each fund charges');
  });

  it('offers linking in place of an investment balance the user entered', () => {
    const [note] = ask({ linkedData: linked({ entered: entered({ accounts: 1, investments: 1 }) }) }, ['investment_details']);
    expect(note.id).toBe('link_for_investments');
    expect(note.message).toContain('in place of the balance you entered');
  });

  it('offers live numbers in place of the balances the user entered', () => {
    const [note] = ask({ linkedData: linked({ entered: entered({ accounts: 1, cash: 1 }) }) }, [], true);
    expect(note.id).toBe('link_anything');
    expect(note.message).toContain('instead of the balances you entered');
  });

  it('asks for cash flow when only a cash balance was entered, since it has no transactions', () => {
    const [note] = ask({ linkedData: linked({ entered: entered({ accounts: 1, cash: 1 }) }) }, ['monthly_cash_flow']);
    expect(note.id).toBe('link_for_cash_flow');
  });

  it('does not ask again for an investment balance the user entered', () => {
    const [note] = ask({
      linkedData: linked({ entered: entered({ accounts: 1, investments: 1 }) }),
      retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'no_holdings' },
    }, ['retirement_analysis'], true);
    expect(note.id).toBe('retirement_no_holdings');
    expect(note.message).toContain('test the investment balance you entered on a preset mix');
    expect(note.message).not.toContain('how much you have invested');
  });

  it('covers a question about the user\'s own money that needed no pack, when nothing is linked', () => {
    expect(ask({ linkedData: NOTHING_LINKED }, [], true).map((note) => note.id)).toEqual(['link_anything']);
    // A general question is the same for anyone; packs alone must not force a note.
    expect(ask({ linkedData: NOTHING_LINKED }, [], false)).toEqual([]);
    expect(ask({ linkedData: NOTHING_LINKED }, ['transaction_details', 'investment_details'], false)).toEqual([]);
  });

  it('says nothing for a general question, whatever packs it drew', () => {
    // The fallback plan selects every pack and claims nothing about meaning.
    const fallback = fallbackContextPlan();
    expect(collectMissingInputAsks({ linkedData: NOTHING_LINKED } as any, fallback.questionNeeds, {
      personalDataQuestion: fallback.personalDataQuestion,
    })).toEqual([]);
  });

  it('says nothing when the account is linked and only has not reported yet', () => {
    expect(ask({ linkedData: linked({ accounts: 1, cash: 1 }) }, ['transaction_details'], true)).toEqual([]);
  });

  it('leaves a retirement question to its own, more specific note', () => {
    const notes = ask({
      linkedData: NOTHING_LINKED,
      retirementAnalysisNeedsInfo: { missingParams: [], detectedParams: {}, unavailableCode: 'no_holdings' },
    }, ['retirement_analysis'], true);
    expect(notes.map((note) => note.id)).toEqual(['retirement_no_holdings']);
  });

  it('stays out of the way without the record', () => {
    expect(ask({}, ['transaction_details'], true)).toEqual([]);
  });
});
