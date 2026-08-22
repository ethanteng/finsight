import { formatKeyNumberValue, formatProvenance } from '../formatKeyNumber';

describe('formatKeyNumberValue', () => {
  it('uses explicit units from the response schema', () => {
    expect(formatKeyNumberValue('savings_rate', { value: 12.5, unit: 'percent', provenance: 'savings_rate' })).toBe('12.5%');
    expect(formatKeyNumberValue('months_of_runway', { value: 18, unit: 'months', provenance: 'months_of_runway' })).toBe('18');
  });

  it('does not infer age from mortgage or rewrite percentages by magnitude', () => {
    expect(formatKeyNumberValue('mortgage_payoff_fund_balance', 4352.34)).toBe('$4,352');
    expect(formatKeyNumberValue('withdrawal_rate', 150)).toBe('150%');
    expect(formatKeyNumberValue('retirement_age', 65)).toBe('65');
  });
});

describe('formatProvenance', () => {
  const metric = (provenance: string, provenanceLabel?: string) =>
    ({ value: 1, unit: 'usd' as const, provenance, provenanceLabel });

  it('prefers the label the server resolved from the fact', () => {
    expect(formatProvenance(metric('holding_value_qq9wmog6pvh1xrv4dpaqc11orpeexyfzzodop_2893', 'WFC holding value')))
      .toBe('WFC holding value');
  });

  it('shows nothing rather than hex when a fact id embeds identifiers', () => {
    // The reported case: de-underscoring this id produced
    // "Holding Value Qq9wmog6pvh1xrv4dpaqc11orpeexyfzzodop 96d5ao5g... 2893"
    // under a dollar figure, which means nothing to the reader.
    expect(formatProvenance(metric('holding_value_qq9wmog6pvh1xrv4dpaqc11orpeexyfzzodop_96d5ao5gljc9eowv7zy1tb1ydryymnfajrrjp_2893')))
      .toBeNull();
  });

  it('still de-underscores an id that reads fine', () => {
    expect(formatProvenance(metric('allocation_equity'))).toBe('allocation equity');
    expect(formatProvenance(metric('total_investments'))).toBe('total investments');
    expect(formatProvenance(metric('allocation_target_date_fund'))).toBe('allocation target date fund');
  });

  it('does not mistake a short or wordy segment for an identifier', () => {
    // `401k` is short; `net_worth` has no digits. Neither should suppress the line.
    expect(formatProvenance(metric('allocation_401k'))).toBe('allocation 401k');
    expect(formatProvenance(metric('net_worth'))).toBe('net worth');
  });

  it('returns null when there is no provenance at all', () => {
    expect(formatProvenance(metric(''))).toBeNull();
  });

  it('ignores a blank label and falls back to the id', () => {
    expect(formatProvenance(metric('total_cash', '   '))).toBe('total cash');
  });
});
