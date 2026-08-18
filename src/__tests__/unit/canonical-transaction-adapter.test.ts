import { describe, expect, it } from '@jest/globals';
import {
  canonicalCashFlowAmount,
  resolveCanonicalTransactionType,
} from '../../services/canonical-transaction-adapter';

describe('provider investment activity classification', () => {
  it('reads transfer direction with each provider\'s own sign convention', () => {
    // SnapTrade signs an activity by its effect on account cash.
    const snapTradeIn = { type: 'TRANSFER', amount: 5_000, source: 'snaptrade' };
    const snapTradeOut = { type: 'TRANSFER', amount: -5_000, source: 'snaptrade' };
    expect(resolveCanonicalTransactionType(snapTradeIn)).toBe('transfer_in');
    expect(resolveCanonicalTransactionType(snapTradeOut)).toBe('transfer_out');

    // Plaid signs an investment transaction by cash debited, which is the
    // opposite: a positive transfer is money leaving the account.
    const plaidOut = { type: 'transfer', amount: 5_000, isInvestmentTransaction: true };
    const plaidIn = { type: 'transfer', amount: -5_000, isInvestmentTransaction: true };
    expect(resolveCanonicalTransactionType(plaidOut)).toBe('transfer_out');
    expect(resolveCanonicalTransactionType(plaidIn)).toBe('transfer_in');
  });

  it('recognizes SnapTrade activities carried on snapTradeData', () => {
    const activity = { type: 'TRANSFER', amount: 250, snapTradeData: { type: 'TRANSFER' } };
    expect(resolveCanonicalTransactionType(activity)).toBe('transfer_in');
  });

  it('leaves a directionless transfer as an adjustment rather than guessing', () => {
    // Guessing an inflow here would post cash the user may never have received.
    expect(resolveCanonicalTransactionType({ type: 'TRANSFER' })).toBe('adjustment');
    expect(resolveCanonicalTransactionType({ type: 'TRANSFER', amount: 0 })).toBe('adjustment');
    expect(resolveCanonicalTransactionType({ type: 'TRANSFER', amount: Number.NaN }))
      .toBe('adjustment');
  });

  it('treats non-cash corporate actions as adjustments, not income', () => {
    // A stock dividend pays in shares; only the cash-paying DIVIDEND is income.
    for (const type of ['SPLIT', 'STOCK_SPLIT', 'STOCK_DIVIDEND', 'MERGER', 'SPINOFF']) {
      expect(resolveCanonicalTransactionType({ type })).toBe('adjustment');
    }
    expect(resolveCanonicalTransactionType({ type: 'DIVIDEND' })).toBe('income');
  });

  it('keeps an adjustment out of the inflow and outflow buckets', () => {
    // Adjustments pass through untouched, so a non-cash action cannot be summed
    // into income the way an 'income' classification would be.
    expect(canonicalCashFlowAmount(1_200, 'adjustment')).toBe(1_200);
    expect(canonicalCashFlowAmount(1_200, 'income')).toBe(1_200);
    expect(canonicalCashFlowAmount(-1_200, 'income')).toBe(1_200);
    expect(canonicalCashFlowAmount(1_200, 'transfer_out')).toBe(-1_200);
    expect(canonicalCashFlowAmount(-1_200, 'transfer_in')).toBe(1_200);
  });

  it('maps tax withholding to a fee in both type and subtype position', () => {
    expect(resolveCanonicalTransactionType({ type: 'TAX' })).toBe('fee');
    expect(resolveCanonicalTransactionType({ type: 'OTHER', subtype: 'withholding tax' }))
      .toBe('fee');
  });

  it('still prefers an explicit canonical type over provider inference', () => {
    const transaction = { type: 'TRANSFER', amount: 5_000, canonicalTransactionType: 'income' };
    expect(resolveCanonicalTransactionType(transaction)).toBe('income');
  });
});
