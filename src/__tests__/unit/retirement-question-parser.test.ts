import { parseRetirementQuestion } from '../../retirement-analytics/retirement-question-parser';

describe('parseRetirementQuestion', () => {
  const auditQuestion =
    'Based on my current portfolio and retirement analysis, am I on track to retire at 68 with $100,000 per year in withdrawals? Show net worth, withdrawal rate, survival rate, and years of expenses covered.';

  it('does not treat "track" as a thousands multiplier for $100,000', () => {
    const result = parseRetirementQuestion(auditQuestion);
    expect(result.annualWithdrawalAmount).toBe(100_000);
  });

  it('parses explicit k suffix on the amount', () => {
    const result = parseRetirementQuestion('Can I withdraw $100k annually in retirement?');
    expect(result.annualWithdrawalAmount).toBe(100_000);
  });

  it('parses million suffix on the matched amount only', () => {
    const result = parseRetirementQuestion('I need $1.5 million per year in retirement withdrawals');
    expect(result.annualWithdrawalAmount).toBe(1_500_000);
  });

  it('extracts retirement age without setting current age from "retire at 68"', () => {
    const result = parseRetirementQuestion(auditQuestion);
    expect(result.retirementAge).toBe(68);
    expect(result.currentAge).toBeUndefined();
  });

  it('extracts current age from "I am 48 years old"', () => {
    const result = parseRetirementQuestion('I am 48 years old — am I ready for retirement?');
    expect(result.currentAge).toBe(48);
  });
});
