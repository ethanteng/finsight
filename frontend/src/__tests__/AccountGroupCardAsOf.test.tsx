import React from 'react';
import { render, screen } from '@testing-library/react';
import AccountGroupCard from '@/components/finances/AccountGroupCard';
import type { FinancesAccount } from '@/types/finances-overview';

const accounts: FinancesAccount[] = [
  {
    account_id: 'plaid-1',
    name: 'Bank of America Checking',
    institution: 'Bank of America',
    source: 'plaid',
    displayBalance: 22980.33,
    dataAsOf: '2026-08-20T23:31:04.694Z',
    isDataStale: false,
  },
  {
    account_id: 'snaptrade-1',
    name: 'Public Treasury Account',
    institution: 'Public',
    source: 'snaptrade',
    displayBalance: 53432.68,
    dataAsOf: '2025-11-23T23:58:28.789Z',
    isDataStale: true,
  },
  {
    account_id: 'legacy-1',
    name: 'Older snapshot account',
    institution: 'Somewhere',
    source: 'plaid',
    displayBalance: 100,
  },
];

function renderGroup() {
  return render(
    <AccountGroupCard
      title="Cash"
      accounts={accounts}
      totalBalance={76513.01}
      isExpanded
      onToggle={() => {}}
      onAccountClick={() => {}}
    />
  );
}

describe('account rows carry their own as-of', () => {
  // The page's own timestamp is built from the newest source, so a connection
  // that synced this morning made a nine-month-old account look equally current.
  it('dates each account separately and marks the stale one', () => {
    renderGroup();

    expect(screen.getByText('Updated Aug 20')).toBeInTheDocument();
    const stale = screen.getByText('Updated Nov 23, 2025');
    expect(stale).toBeInTheDocument();
    expect(stale.className).toContain('amber');
  });

  it('renders no line for an account the snapshot never dated', () => {
    renderGroup();

    expect(screen.getByText('Older snapshot account')).toBeInTheDocument();
    expect(screen.getAllByText(/^Updated /)).toHaveLength(2);
  });
});
