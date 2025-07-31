export const createTestAccount = (overrides = {}) => ({
  id: 'test-account-id',
  name: 'Test Account',
  balance: 1000.00,
  type: 'checking',
  subtype: 'checking',
  institution: 'Test Bank',
  accountId: 'test-account-1',
  mask: '1234',
  ...overrides
});

export const createTestCheckingAccount = (overrides = {}) => 
  createTestAccount({ 
    type: 'depository', 
    subtype: 'checking',
    name: 'Test Checking Account',
    ...overrides 
  });

export const createTestSavingsAccount = (overrides = {}) => 
  createTestAccount({ 
    type: 'depository', 
    subtype: 'savings',
    name: 'Test Savings Account',
    ...overrides 
  });

export const createTestCreditAccount = (overrides = {}) => 
  createTestAccount({ 
    type: 'credit', 
    subtype: 'credit card',
    name: 'Test Credit Card',
    balance: -500.00, // Negative for credit
    ...overrides 
  });

export const createTestInvestmentAccount = (overrides = {}) => 
  createTestAccount({ 
    type: 'investment', 
    subtype: '401k',
    name: 'Test 401(k)',
    balance: 50000.00,
    ...overrides 
  }); 