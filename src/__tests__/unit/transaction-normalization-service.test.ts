import { TransactionNormalizationService } from '../../services/transaction-normalization-service';

describe('TransactionNormalizationService', () => {
  const service = new TransactionNormalizationService();

  it('recognizes a Plaid credit-card refund before deriving canonical cash flow', () => {
    const normalized = service.normalizeTransaction(
      {
        transaction_id: 'card-refund',
        account_id: 'credit-card',
        amount: -45,
        date: '2026-05-10',
        name: 'Merchant refund',
        personal_finance_category: {
          primary: 'GENERAL_MERCHANDISE',
          detailed: 'GENERAL_MERCHANDISE_REFUND',
        },
        iso_currency_code: 'USD',
      },
      'credit',
      'credit card'
    );

    expect(normalized.source_amount).toBe(-45);
    expect(normalized.cash_flow_amount).toBe(45);
  });

  it('does not guess canonical cash flow for an unclassified transaction', () => {
    const normalized = service.normalizeTransaction(
      {
        transaction_id: 'unknown',
        account_id: 'credit-card',
        amount: 20,
        date: '2026-05-10',
        name: 'Unknown activity',
        iso_currency_code: 'USD',
      },
      'credit',
      'credit card'
    );

    expect(normalized.cash_flow_amount).toBeUndefined();
  });
});
