import {
  describeRetirementAssumptions,
  describeRetirementScenarioAssumptions,
} from '../../openai/retirement-assumptions';

/**
 * Every other guard in this area tries to stop a misread. This one assumes one
 * got through and makes it visible, so the tests are mostly about the sentence
 * being present, accurate, and quiet when it has nothing to say.
 */
describe('describeRetirementAssumptions', () => {
  const analysis = (
    values: Record<string, number | undefined>,
    sources?: Record<string, string>
  ) =>
    ({
      retirementAnalysis: {
        _storedInputParams: values,
        _inputSources: sources,
      },
    }) as any;

  it('states the spending target with the words it was read from', () => {
    const line = describeRetirementAssumptions(
      analysis(
        { annualWithdrawalAmount: 125_000, retirementAge: 58 },
        { annualWithdrawalAmount: '$125K as my target annual spending' }
      )
    );

    expect(line).toContain('spending $125,000 a year');
    expect(line).toContain('“$125K as my target annual spending”');
    expect(line).toContain('retiring at 58');
    expect(line).toContain('Tell me if any of that is wrong');
  });

  it('still names a value that carries no quote', () => {
    // Ages often come from the stored profile rather than anything said in this
    // decision. The number was still used, so it is still stated.
    const line = describeRetirementAssumptions(analysis({ annualWithdrawalAmount: 80_000, currentAge: 48 }));

    expect(line).toContain('spending $80,000 a year');
    expect(line).toContain('age today 48');
    expect(line).not.toContain('from “');
  });

  it('leads with spending, because a misread there costs the most', () => {
    const line = describeRetirementAssumptions(
      analysis({ currentAge: 48, retirementAge: 58, annualWithdrawalAmount: 125_000 })
    )!;

    expect(line.indexOf('spending')).toBeLessThan(line.indexOf('retiring at'));
    expect(line.indexOf('retiring at')).toBeLessThan(line.indexOf('age today'));
  });

  it('drops a quote too long to read at a glance, keeping the value', () => {
    const line = describeRetirementAssumptions(
      analysis({ annualWithdrawalAmount: 125_000 }, { annualWithdrawalAmount: 'x'.repeat(400) })
    );

    expect(line).toContain('spending $125,000 a year');
    expect(line).not.toContain('xxxx');
  });

  it('reduces a quote to plain prose before it reaches output validation', () => {
    // The quote is the user's own text, and a security flag on the finished
    // answer replaces all of it — so a phrase that merely looks like an
    // injection would cost them a good projection.
    const line = describeRetirementAssumptions(
      analysis(
        { annualWithdrawalAmount: 125_000 },
        { annualWithdrawalAmount: '$125k/yr <script>alert(1)</script>; DROP TABLE users;--' }
      )
    )!;

    expect(line).toContain('spending $125,000 a year');
    expect(line).toContain('$125k/yr');
    expect(line).not.toContain('<');
    expect(line).not.toContain(';');
  });

  it('says nothing when no projection ran', () => {
    expect(describeRetirementAssumptions({} as any)).toBeNull();
    expect(describeRetirementAssumptions({ retirementAnalysis: {} } as any)).toBeNull();
    expect(describeRetirementAssumptions(analysis({}))).toBeNull();
  });
});

describe('describeRetirementScenarioAssumptions', () => {
  it('states the comparison, held-constant inputs, and a product default', () => {
    const line = describeRetirementScenarioAssumptions({
      retirementScenarioExecution: {
        status: 'completed',
        version: 1,
        calculator: 'retirement',
        computedAt: '2026-08-17T00:00:00.000Z',
        durationMs: 1,
        baselineScenarioId: 'base',
        scenarios: [{
          id: 'fixed',
          label: '3% annual withdrawal growth',
          withdrawalPolicy: { type: 'fixed_growth', annualRate: 0.03 },
          reusedBaseline: false,
          analysis: {} as any,
          assumptions: [
            { key: 'annual_growth_rate', label: 'Annual growth', value: 0.03, origin: 'default' },
            { key: 'annual_withdrawal_amount', label: 'Spending', value: 40_000, origin: 'inherited' },
            { key: 'current_age', label: 'Age', value: 50, origin: 'inherited' },
            { key: 'retirement_age', label: 'Retirement', value: 60, origin: 'inherited' },
            { key: 'life_expectancy', label: 'Life', value: 95, origin: 'inherited' },
          ],
        }, {
          id: 'flat',
          label: 'Flat nominal withdrawals',
          withdrawalPolicy: { type: 'flat_nominal' },
          reusedBaseline: false,
          analysis: {} as any,
          assumptions: [],
        }],
      },
    } as any)!;

    expect(line).toContain('compared 3% annual withdrawal growth with Flat nominal withdrawals');
    expect(line).toContain('$40,000 a year');
    expect(line).toContain('age 50 today');
    expect(line).toContain('no additional contributions');
    expect(line).toContain('Ask Linc default of 3%');
  });

  it('turns a calculator failure into a useful disclosure', () => {
    expect(describeRetirementScenarioAssumptions({
      retirementScenarioExecution: {
        status: 'unavailable',
        reason: 'Historical data was unavailable.',
      },
    } as any)).toContain('Historical data was unavailable');
  });
});
