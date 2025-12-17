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

interface GroupedAccounts {
  cash: (Account | SnapTradeAccount)[];
  investments: Account[];
  snapTrade: SnapTradeAccount[];
  debt: (Account | SnapTradeAccount)[];
  other: (Account | SnapTradeAccount)[];
}

export function groupAccounts(
  accounts: Account[],
  snapTradeAccounts: SnapTradeAccount[]
): GroupedAccounts {
  const grouped: GroupedAccounts = {
    cash: [],
    investments: [],
    snapTrade: [...snapTradeAccounts],
    debt: [],
    other: []
  };

  accounts.forEach(account => {
    const type = account.type?.toLowerCase() || '';
    const subtype = account.subtype?.toLowerCase() || '';

    // Cash accounts
    if (type === 'depository' || 
        subtype === 'checking' || 
        subtype === 'savings' || 
        subtype === 'cd' ||
        subtype === 'money market' ||
        subtype === 'prepaid') {
      grouped.cash.push(account);
      return;
    }

    // Investment accounts (Plaid)
    if (type === 'investment' ||
        subtype === '401k' || 
        subtype === 'ira' || 
        subtype === 'roth' ||
        subtype === 'brokerage' || 
        subtype === 'hsa' || 
        subtype === '529' ||
        subtype === 'pension' || 
        subtype === 'annuity') {
      grouped.investments.push(account);
      return;
    }

    // Debt accounts
    if (type === 'credit' || 
        type === 'loan' ||
        subtype === 'credit card' ||
        subtype === 'mortgage' || 
        subtype === 'student' || 
        subtype === 'auto' || 
        subtype === 'personal' ||
        subtype === 'home equity') {
      grouped.debt.push(account);
      return;
    }

    // Other accounts
    grouped.other.push(account);
  });

  return grouped;
}

