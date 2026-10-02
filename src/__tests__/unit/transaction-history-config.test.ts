import {
  DEFAULT_TRANSACTION_HISTORY_DAYS,
  PLAID_TRANSACTIONS_DAYS_REQUESTED,
  transactionHistoryDays,
} from '../../config/transaction-history';

describe('transactionHistoryDays', () => {
  it('defaults to twelve months when the variable is unset', () => {
    expect(transactionHistoryDays({})).toBe(365);
    expect(DEFAULT_TRANSACTION_HISTORY_DAYS).toBe(365);
  });

  it('honours an explicit positive override', () => {
    expect(transactionHistoryDays({ TRANSACTION_HISTORY_DAYS: '90' })).toBe(90);
  });

  it('falls back to the default for unusable values', () => {
    expect(transactionHistoryDays({ TRANSACTION_HISTORY_DAYS: '' })).toBe(365);
    expect(transactionHistoryDays({ TRANSACTION_HISTORY_DAYS: 'abc' })).toBe(365);
    expect(transactionHistoryDays({ TRANSACTION_HISTORY_DAYS: '0' })).toBe(365);
    expect(transactionHistoryDays({ TRANSACTION_HISTORY_DAYS: '-30' })).toBe(365);
  });

  it('requests the Plaid maximum for new connections', () => {
    expect(PLAID_TRANSACTIONS_DAYS_REQUESTED).toBe(730);
  });
});
