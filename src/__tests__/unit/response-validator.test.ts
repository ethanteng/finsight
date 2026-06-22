import { formatMetricPercent } from '../../openai/response-validator';

describe('formatMetricPercent', () => {
  it('converts decimal fractions to whole-number percents', () => {
    expect(formatMetricPercent(0.153846)).toBe('15.38%');
    expect(formatMetricPercent(0.08)).toBe('8.00%');
  });

  it('handles zero survival rate', () => {
    expect(formatMetricPercent(0, 1)).toBe('0.0%');
  });

  it('handles rates above 1 as fractions (e.g. 150% withdrawal/portfolio)', () => {
    expect(formatMetricPercent(1.5)).toBe('150.00%');
  });

  it('returns N/A for non-finite values', () => {
    expect(formatMetricPercent(undefined)).toBe('N/A');
    expect(formatMetricPercent(NaN)).toBe('N/A');
  });
});
