export const createTestTransaction = (overrides = {}) => ({
  id: 'test-transaction-id',
  accountId: 'test-account-id',
  amount: 100.00,
  name: 'Test Transaction',
  date: '2024-01-01',
  category: ['food'],
  categoryId: 'food',
  pending: false,
  transactionId: 'test-transaction-1',
  ...overrides
});

export const createTestIncomeTransaction = (overrides = {}) => 
  createTestTransaction({ 
    amount: 2500.00,
    name: 'Salary Deposit',
    category: ['income'],
    categoryId: 'income',
    ...overrides 
  });

export const createTestExpenseTransaction = (overrides = {}) => 
  createTestTransaction({ 
    amount: -50.00,
    name: 'Grocery Store',
    category: ['food'],
    categoryId: 'food',
    ...overrides 
  });

export const createTestTransferTransaction = (overrides = {}) => 
  createTestTransaction({ 
    amount: -500.00,
    name: 'Transfer to Savings',
    category: ['transfer'],
    categoryId: 'transfer',
    ...overrides 
  });

export const createTestPendingTransaction = (overrides = {}) => 
  createTestTransaction({ 
    pending: true,
    name: 'Pending Transaction',
    ...overrides 
  }); 