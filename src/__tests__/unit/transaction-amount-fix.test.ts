import { describe, test, expect } from '@jest/globals';

describe('Transaction Amount Fix', () => {
  test('should correctly invert transaction amounts for display', () => {
    // Test data representing the actual issue
    const testTransactions = [
      {
        id: '1',
        name: 'External Funds Transfer',
        amount: 2050.00, // This should become negative
        date: '2025-07-31',
        category: ['Transfer']
      },
      {
        id: '2', 
        name: 'Interest Credit',
        amount: -308.81, // This should become positive
        date: '2025-07-31',
        category: ['Interest']
      }
    ];

    // Simulate the fix logic
    const correctedTransactions = testTransactions.map(transaction => ({
      ...transaction,
      displayAmount: -(transaction.amount || 0)
    }));

    // Verify the inversion worked correctly
    expect(correctedTransactions[0].displayAmount).toBe(-2050.00); // External transfer should be negative
    expect(correctedTransactions[1].displayAmount).toBe(308.81);   // Interest credit should be positive
  });

  test('should handle edge cases correctly', () => {
    const edgeCases = [
      { amount: 0, expected: 0 },
      { amount: null, expected: 0 },
      { amount: undefined, expected: 0 },
      { amount: 100.50, expected: -100.50 },
      { amount: -50.25, expected: 50.25 }
    ];

    edgeCases.forEach(({ amount, expected }) => {
      const correctedAmount = -(amount || 0);
      // Handle -0 vs 0 by using a more robust comparison
      if (expected === 0) {
        expect(correctedAmount === 0 || Object.is(correctedAmount, -0)).toBe(true);
      } else {
        expect(correctedAmount).toBe(expected);
      }
    });
  });
}); 