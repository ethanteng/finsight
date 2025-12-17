"use client";

interface Account {
  id: string;
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  balance: {
    current: number;
    available?: number;
    limit?: number;
    iso_currency_code: string;
  };
  institution?: string;
  source?: 'plaid' | 'snaptrade';
}

interface SnapTradeAccount {
  id: string;
  name: string;
  type: string;
  institution: string;
  balance: number;
  accountNumber: string;
}

interface AccountGroupCardProps {
  title: string;
  accounts: (Account | SnapTradeAccount)[];
  totalBalance: number;
  isExpanded: boolean;
  onToggle: () => void;
  onAccountClick: (accountId: string) => void;
}

export default function AccountGroupCard({
  title,
  accounts,
  totalBalance,
  isExpanded,
  onToggle,
  onAccountClick
}: AccountGroupCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getAccountBalance = (account: Account | SnapTradeAccount): number => {
    if ('balance' in account && typeof account.balance === 'object') {
      return account.balance.available ?? account.balance.current ?? 0;
    }
    return (account as SnapTradeAccount).balance ?? 0;
  };

  const getAccountName = (account: Account | SnapTradeAccount): string => {
    return account.name || 'Unknown Account';
  };

  const getAccountInstitution = (account: Account | SnapTradeAccount): string => {
    if ('institution' in account && account.institution) {
      return account.institution;
    }
    // Check if it's a SnapTradeAccount by looking for accountNumber property
    if ('accountNumber' in account && 'institution' in account) {
      return (account as SnapTradeAccount).institution || '';
    }
    return '';
  };

  const getAccountId = (account: Account | SnapTradeAccount): string => {
    // Check if it's an Account type
    if ('account_id' in account) {
      return (account as Account).account_id || (account as Account).id || '';
    }
    // Otherwise it's a SnapTradeAccount
    return (account as SnapTradeAccount).id || '';
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-750 transition-colors rounded-lg"
      >
        <div className="flex items-center space-x-4">
          <div className="text-lg">{isExpanded ? '▼' : '▶'}</div>
          <div className="text-left">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <div className="text-sm text-gray-400">
              {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-white font-semibold text-xl">
            {formatCurrency(totalBalance)}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-3">
          {accounts.map((account) => {
            const accountId = getAccountId(account);
            const balance = getAccountBalance(account);
            const name = getAccountName(account);
            const institution = getAccountInstitution(account);

            return (
              <div
                key={accountId}
                onClick={() => onAccountClick(accountId)}
                className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-white">{name}</div>
                    {institution && (
                      <div className="text-sm text-gray-400">{institution}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-white">
                      {formatCurrency(balance)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

