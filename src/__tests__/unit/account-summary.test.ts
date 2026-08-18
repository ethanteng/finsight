import { buildAccountSummaries } from '../../openai/account-summary';
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
  });

  it('uses current balance before available balance for cash accounts', () => {
    const [summary] = buildAccountSummaries([
      account({ balance: { current: 125, available: 100, iso_currency_code: 'USD' } }),
    ]);

    expect(summary.balance).toBe(125);
  });

  it('uses the revision-aligned display balance when present', () => {
    const [summary] = buildAccountSummaries([
      account({ type: 'investment', balance: { current: 125, iso_currency_code: 'USD' } }),
    ], { 'account-1': 9000 });

    expect(summary.balance).toBe(9000);
  });

  it('resolves plaidAccountId when account_id is absent', () => {
    const [summary] = buildAccountSummaries([
      account({
        account_id: undefined as unknown as string,
        id: 'db-row-1',
        plaidAccountId: 'plaid-abc',
      } as Account & { plaidAccountId: string }),
    ], { 'plaid-abc': 4200 });

    expect(summary.id).toBe('plaid-abc');
    expect(summary.balance).toBe(4200);
  });

  it('retains Plaid liability terms and promotes the primary APR', () => {
    const liabilityDetails = [{
      provider: 'plaid' as const,
      kind: 'credit' as const,
      retrievedAt: '2026-08-18T12:00:00Z',
      aprs: [{ type: 'purchase_apr', percentage: 19.99 }],
      minimumPaymentAmount: 50,
      nextPaymentDueDate: '2026-09-01',
    }];
    const [summary] = buildAccountSummaries([account({ liabilityDetails })]);

    expect(summary.interestRate).toBe(19.99);
    expect(summary.liabilityDetails).toEqual(liabilityDetails);
  });
});
