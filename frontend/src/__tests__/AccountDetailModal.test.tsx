import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountDetailModal from '@/components/finances/AccountDetailModal';
import type { FinancesAccount } from '@/types/finances-overview';

jest.mock('@/components/InvestmentPortfolio', () => ({
  __esModule: true,
  default: () => <div>portfolio</div>,
}));

const details = {
  revisionId: 'revision-1',
  accountId: 'snaptrade-1',
  transactions: [],
  holdings: [],
  investmentTransactions: [],
  portfolio: {
    reportingCurrency: 'USD',
    totalValue: 0,
    assetAllocation: [],
    holdingCount: 0,
    securityCount: 0,
    currencyMismatchIds: [],
    unavailableValueIds: [],
  },
};

const snapTradeAccount: FinancesAccount = {
  account_id: 'snaptrade-1',
  name: 'Public Treasury Account',
  type: 'investment',
  subtype: 'brokerage',
  institution: 'Public',
  source: 'snaptrade',
  displayBalance: 53432.68,
  dataAsOf: '2025-11-23T23:58:28.789Z',
  isDataStale: true,
  brokerageAuthorizationId: 'auth-1',
};

function renderModal(account: FinancesAccount = snapTradeAccount) {
  return render(
    <AccountDetailModal
      account={account}
      accountId={String(account.account_id)}
      revisionId="revision-1"
      onClose={() => {}}
    />
  );
}

describe('AccountDetailModal provenance and refresh', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'token');
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/details')) {
        return { ok: true, json: async () => details } as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true, message: 'Refresh requested. Updated balances usually arrive within a few minutes.' }),
      } as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => jest.resetAllMocks());

  it('dates the account from its own observation, year included', async () => {
    renderModal();

    expect(await screen.findByText('Updated Nov 23, 2025')).toBeInTheDocument();
  });

  it('asks the provider to re-sync the connection behind this account', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /refresh from institution/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/snaptrade/connections/auth-1/refresh'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // SnapTrade only schedules the syncs, so the confirmation must not send the
  // user off to compare against a balance that has not moved yet.
  it('confirms the request without claiming the balance changed', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /refresh from institution/i }));

    expect(await screen.findByText(/Refresh requested/i)).toBeInTheDocument();
  });

  it('offers no refresh for a provider that has no manual re-sync', async () => {
    renderModal({ ...snapTradeAccount, source: 'plaid', brokerageAuthorizationId: undefined });

    expect(await screen.findByText('Updated Nov 23, 2025')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /refresh from institution/i })).toBeNull();
  });

  // A snapshot written before the authorization was recorded has nothing to send.
  it('offers no refresh when the connection behind the account is unknown', async () => {
    renderModal({ ...snapTradeAccount, brokerageAuthorizationId: undefined });

    expect(screen.queryByRole('button', { name: /refresh from institution/i })).toBeNull();
  });
});
