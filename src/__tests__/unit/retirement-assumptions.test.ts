import { describeRetirementAssumptions } from '../../openai/retirement-assumptions';

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

  it('says nothing when no projection ran', () => {
    expect(describeRetirementAssumptions({} as any)).toBeNull();
    expect(describeRetirementAssumptions({ retirementAnalysis: {} } as any)).toBeNull();
    expect(describeRetirementAssumptions(analysis({}))).toBeNull();
  });
});
