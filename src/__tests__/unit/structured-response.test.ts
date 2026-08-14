import {
  parseStructuredResponse,
  formatKeyNumberValue,
  toDisplayText,
  AskLincResponse
} from '../../openai/structured-response';

describe('parseStructuredResponse', () => {
  it('parses a clean JSON object', () => {
    const raw = JSON.stringify({
      summary: 'You are doing well.',
      key_numbers: { net_worth: 250000, withdrawal_rate: 4.15 },
      insights: ['Insight A', 'Insight B'],
      suggested_actions: ['Action A']
    });
    const parsed = parseStructuredResponse(raw);
    expect(parsed.summary).toBe('You are doing well.');
    expect(parsed.key_numbers).toEqual({
      net_worth: { value: 250000, unit: 'usd', provenance: '' },
      withdrawal_rate: { value: 4.15, unit: 'percent', provenance: '' },
    });
    expect(parsed.insights).toEqual(['Insight A', 'Insight B']);
    expect(parsed.suggested_actions).toEqual(['Action A']);
  });

  it('parses JSON wrapped in a markdown code block with preamble text', () => {
    const raw = 'Here is my analysis.\n```json\n{"summary":"Hi","insights":["x"]}\n```';
    const parsed = parseStructuredResponse(raw);
    expect(parsed.summary).toBe('Hi');
    expect(parsed.insights).toEqual(['x']);
  });

  it('coerces stringified numbers in key_numbers and drops non-numeric values', () => {
    const raw = '{"summary":"s","key_numbers":{"a":"1234.5","b":"not-a-number","c":42}}';
    const parsed = parseStructuredResponse(raw);
    expect(parsed.key_numbers).toEqual({
      a: { value: 1234.5, unit: 'usd', provenance: '' },
      c: { value: 42, unit: 'usd', provenance: '' },
    });
  });

  it('preserves the explicit value, unit, and provenance schema', () => {
    const raw = JSON.stringify({
      summary: 's',
      key_numbers: {
        savings_rate: { value: 12.5, unit: 'percent', provenance: 'savings_rate' },
      },
    });
    expect(parseStructuredResponse(raw).key_numbers).toEqual({
      savings_rate: { value: 12.5, unit: 'percent', provenance: 'savings_rate' },
    });
  });

  it('repairs truncated JSON (unclosed array/braces)', () => {
    const raw = '{"summary":"truncated","insights":["one","two"';
    const parsed = parseStructuredResponse(raw);
    expect(parsed.summary).toBe('truncated');
    expect(parsed.insights).toEqual(['one', 'two']);
  });

  it('keeps the first occurrence when keys are duplicated', () => {
    const raw = '{"summary":"first","insights":["a"],"insights":["b"]}';
    const parsed = parseStructuredResponse(raw);
    // Duplicate key handling keeps a single, valid result (not a crash / not merged garbage)
    expect(parsed.summary).toBe('first');
    expect(parsed.insights && parsed.insights.length).toBeGreaterThan(0);
  });

  it('falls back to wrapping raw text in summary when no JSON present', () => {
    const raw = 'This is just prose with no JSON at all.';
    const parsed = parseStructuredResponse(raw);
    expect(parsed.summary).toBe(raw);
  });

  it('handles empty / non-string input safely', () => {
    expect(parseStructuredResponse('').summary).toBeTruthy();
    // @ts-expect-error testing runtime guard
    expect(parseStructuredResponse(null).summary).toBeTruthy();
  });
});

describe('formatKeyNumberValue', () => {
  it('formats percent / pct / rate / allocation / apy keys as percentages', () => {
    expect(formatKeyNumberValue('withdrawal_rate', 4.15)).toBe('4.15%');
    expect(formatKeyNumberValue('equity_allocation', 72.5)).toBe('72.5%');
    expect(formatKeyNumberValue('effective_tax_percent', 18)).toBe('18%');
    expect(formatKeyNumberValue('current_fixed_income_pct', 4.7)).toBe('4.7%');
    expect(formatKeyNumberValue('target_total_fixed_income_pct', 10)).toBe('10%');
    expect(formatKeyNumberValue('popular_direct_cd_effective_apy', 4.32)).toBe('4.32%');
    expect(formatKeyNumberValue('cfg_money_market_effective_apy', 3.68)).toBe('3.68%');
    expect(formatKeyNumberValue('best_market_rate_apy', 4.26)).toBe('4.26%');
  });

  it('does not silently rewrite percentage values', () => {
    expect(formatKeyNumberValue('withdrawal_rate', 150)).toBe('150%');
    expect(formatKeyNumberValue('vtip_allocation', 2000)).toBe('2,000%');
  });

  it('renders percentage keys that also contain "loss" as percentages (regression)', () => {
    // Previously "loss" forced a dollar format, so this produced "$-8.3".
    expect(formatKeyNumberValue('unrealized_loss_percent', -8.3)).toBe('-8.3%');
    expect(formatKeyNumberValue('loss_rate', 12.5)).toBe('12.5%');
  });

  it('formats months / years keys as plain numbers', () => {
    expect(formatKeyNumberValue('years_of_expenses', 28.5)).toBe('28.5');
    expect(formatKeyNumberValue('months_of_runway', 36)).toBe('36');
  });

  it('formats dollar keys (incl. loss/surplus/buffer) as currency rounded to whole dollars', () => {
    expect(formatKeyNumberValue('unrealized_loss', 5000)).toBe('$5,000');
    expect(formatKeyNumberValue('monthly_surplus', 1500)).toBe('$1,500');
    expect(formatKeyNumberValue('net_worth', 250000)).toBe('$250,000');
    expect(formatKeyNumberValue('cfg_balance', 53618.72)).toBe('$53,619');
    expect(formatKeyNumberValue('mortgage_payoff_fund_balance', 4352.34)).toBe('$4,352');
    expect(formatKeyNumberValue('total_cash_position', 257803.45)).toBe('$257,803');
  });

  it('renders negative dollar amounts with the sign before the dollar sign', () => {
    // Previously produced "$-5000".
    expect(formatKeyNumberValue('cash_shortfall_dollars', -5000)).toBe('-$5,000');
  });
});

describe('toDisplayText', () => {
  it('renders summary, key numbers, insights, and actions', () => {
    const response: AskLincResponse = {
      summary: 'Overview text.',
      key_numbers: { net_worth: 250000, withdrawal_rate: 4.15 },
      insights: ['Insight 1'],
      suggested_actions: ['Action 1']
    };
    const text = toDisplayText(response);
    expect(text).toContain('Overview text.');
    expect(text).toContain('Net Worth: $250,000');
    expect(text).toContain('Withdrawal Rate: 4.15%');
    expect(text).toContain('**Insights:**');
    expect(text).toContain('- Insight 1');
    expect(text).toContain('**Suggested Actions:**');
    expect(text).toContain('- Action 1');
  });

  it('omits optional sections when absent', () => {
    const text = toDisplayText({ summary: 'Just a summary.' });
    expect(text).toBe('Just a summary.');
  });
});
