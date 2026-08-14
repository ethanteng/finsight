jest.mock('openai', () => {
  const create = jest.fn();
  return {
    __esModule: true,
    default: jest.fn(() => ({ chat: { completions: { create } } })),
    __mockCreate: create,
  };
});

import { TransactionCategorizationService } from '../../services/transaction-categorization-service';

const mockCreate = (jest.requireMock('openai') as any).__mockCreate;

describe('TransactionCategorizationService deterministic fast path', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses provider categories without an LLM request', async () => {
    const service = new TransactionCategorizationService();
    const result = await service.categorizeTransaction({
      transaction_id: 'restaurant',
      account_id: 'checking',
      amount: 42,
      date: '2026-08-13',
      name: 'Restaurant',
      personal_finance_category: {
        primary: 'FOOD_AND_DRINK',
        detailed: 'FOOD_AND_DRINK_RESTAURANT',
      },
    });

    expect(result.transaction_type).toBe('expense');
    expect(result.categorization_method).toBe('plaid');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('classifies credit-card payments as transfers without an LLM request', async () => {
    const service = new TransactionCategorizationService();
    const result = await service.categorizeTransaction({
      transaction_id: 'payment',
      account_id: 'card',
      amount: -500,
      date: '2026-08-13',
      name: 'AUTOPAY PAYMENT',
      personal_finance_category: {
        primary: 'LOAN_PAYMENTS',
        detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      },
    });

    expect(result.transaction_type).toBe('transfer_out');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
