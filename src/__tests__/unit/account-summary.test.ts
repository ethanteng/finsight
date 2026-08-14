import { buildAccountSummaries } from '../../openai/account-summary';
import { formatAccountSummary } from '../../openai/prompt-builder';
import type { Account } from '../../services/financial-data-service';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    account_id: 'account-1',
    name: 'Checking',
    type: 'depository',
    subtype: 'checking',
    balance: {
      current: 125,
      iso_currency_code: 'USD',
    },
    source: 'plaid',
    ...overrides,
  };
}

describe('account summaries', () => {
  it('preserves an unavailable balance instead of converting it to zero', () => {
    const [summary] = buildAccountSummaries([
      account({ balance: { current: null, iso_currency_code: 'USD' } }),
    ]);

    expect(summary.balance).toBeNull();
    expect(formatAccountSummary([summary])).toContain('Balance unavailable');
    expect(formatAccountSummary([summary])).not.toContain('$0.00');
  });

  it('prefers the available balance for cash accounts', () => {
    const [summary] = buildAccountSummaries([
      account({ balance: { current: 125, available: 100, iso_currency_code: 'USD' } }),
    ]);

    expect(summary.balance).toBe(100);
  });
});
