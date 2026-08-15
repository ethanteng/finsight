import { collectMissingInputAsks, describeMissingInputs } from '../../openai/missing-inputs';

const NO_NEEDS = { needsRetirement: false, needsHomeValue: false };

function ids(snapshot: any, needs: any = NO_NEEDS): string[] {
  return collectMissingInputAsks(snapshot, needs).map((ask) => ask.id);
}

describe('missing input asks', () => {
  it('asks for retirement inputs only the user has', () => {
    const asks = collectMissingInputAsks(
      { retirementAnalysisNeedsInfo: { missingParams: ['annualWithdrawalAmount'], detectedParams: {} } } as any,
      { needsRetirement: true, needsHomeValue: false }
    );

    expect(asks).toHaveLength(1);
    expect(asks[0].id).toBe('retirement_inputs');
    expect(asks[0].message).toContain('how much you expect to spend per year once retired');
  });

  it('asks for a connection when the analysis had nothing to analyze', () => {
    const asks = collectMissingInputAsks(
      {
        retirementAnalysisNeedsInfo: {
          missingParams: [],
          detectedParams: {},
          unavailableReason: 'No linked investment holdings are available.',
          unavailableCode: 'no_holdings',
        },
      } as any,
      { needsRetirement: true, needsHomeValue: false }
    );

    expect(asks[0]).toMatchObject({ id: 'retirement_no_holdings' });
    expect(asks[0].message).toContain('Link an investment account');
  });

  it('stays quiet about failures the user cannot do anything about', () => {
    // A pricing service outage is ours to fix; telling the user is an apology,
    // not an ask.
    expect(ids(
      {
        retirementAnalysisNeedsInfo: {
          missingParams: [],
          detectedParams: {},
          unavailableReason: 'The portfolio analysis service failed.',
          unavailableCode: 'service_error',
        },
      },
      { needsRetirement: true, needsHomeValue: false }
    )).toEqual([]);
  });

  it('asks for a home value only when the question needed one', () => {
    const snapshot = { homeValueSummary: 'Home value data is currently unavailable.' };

    expect(ids(snapshot, { needsRetirement: false, needsHomeValue: true })).toEqual(['home_value']);
    expect(ids(snapshot)).toEqual([]);
  });

  it('flags connections that stopped reporting, whatever the question was', () => {
    // Unlike the others this is not question-specific: a dead connection skews
    // every total derived from it.
    const asks = collectMissingInputAsks(
      { financialSummary: { quality: { unavailableSourceIds: ['plaid:item-1'] } } } as any,
      NO_NEEDS
    );

    expect(asks[0].id).toBe('unavailable_sources');
    expect(asks[0].message).toContain('One of your account connections is');
    // Internal source identifiers never reach the user.
    expect(asks[0].message).not.toContain('plaid');
  });

  it('counts distinct broken connections without repeating one', () => {
    const asks = collectMissingInputAsks(
      {
        financialSummary: {
          quality: {
            requiredUnavailableSourceIds: ['plaid:item-1'],
            unavailableSourceIds: ['plaid:item-1', 'snaptrade'],
          },
        },
      } as any,
      NO_NEEDS
    );

    expect(asks[0].message).toContain('2 of your account connections are');
  });

  it('does not raise a stale source as something to fix', () => {
    expect(ids({ financialSummary: { quality: { staleSourceIds: ['plaid:item-1'] } } })).toEqual([]);
  });

  it('caps how much it asks for at once', () => {
    const asks = collectMissingInputAsks(
      {
        retirementAnalysisNeedsInfo: { missingParams: ['annualWithdrawalAmount'], detectedParams: {} },
        homeValueSummary: 'Home value data is currently unavailable.',
        financialSummary: { quality: { unavailableSourceIds: ['plaid:item-1'] } },
      } as any,
      { needsRetirement: true, needsHomeValue: true }
    );

    expect(asks.map((ask) => ask.id)).toEqual(['retirement_inputs', 'home_value']);
  });

  it('says nothing when nothing is missing', () => {
    expect(describeMissingInputs({}, NO_NEEDS)).toBeNull();
  });
});
