import { 
  tokenizeAccount, 
  tokenizeInstitution, 
  tokenizeMerchant,
  getRealAccountName,
  getRealInstitutionName,
  getRealMerchantName,
  convertResponseToUserFriendly,
  clearTokenizationMaps
} from '../../privacy';

describe('Dual-Data System Unit Tests', () => {
  // ✅ Proper setup and teardown
  beforeEach(() => {
    // Clear tokenization maps before each test for isolation
    clearTokenizationMaps();
  });

  afterEach(() => {
    // Ensure cleanup after each test
    clearTokenizationMaps();
  });

  describe('Tokenization Functions', () => {
    describe('tokenizeAccount', () => {
      test('should tokenize account names consistently', () => {
        // Arrange
        const accountName = 'Chase Checking Account';
        const institution = 'Chase Bank';
        
        // Act
        const token1 = tokenizeAccount(accountName, institution);
        const token2 = tokenizeAccount(accountName, institution);
        
        // Assert
        expect(token1).toBe(token2);
        expect(token1).toMatch(/^Account_\d+$/);
      });

      test('should handle different accounts with same name but different institutions', () => {
        // Arrange
        const accountName = 'Checking Account';
        const institution1 = 'Chase';
        const institution2 = 'Wells Fargo';
        
        // Act
        const token1 = tokenizeAccount(accountName, institution1);
        const token2 = tokenizeAccount(accountName, institution2);
        
        // Assert
        expect(token1).not.toBe(token2);
        expect(token1).toMatch(/^Account_\d+$/);
        expect(token2).toMatch(/^Account_\d+$/);
      });

      test('should handle empty account name', () => {
        // Arrange
        const accountName = '';
        const institution = 'Test Bank';
        
        // Act
        const token = tokenizeAccount(accountName, institution);
        
        // Assert
        expect(token).toMatch(/^Account_\d+$/);
      });

      test('should handle special characters in account names', () => {
        // Arrange
        const accountName = 'Account & Co. (LLC)';
        const institution = 'Bank & Trust';
        
        // Act
        const token = tokenizeAccount(accountName, institution);
        
        // Assert
        expect(token).toMatch(/^Account_\d+$/);
        expect(getRealAccountName(token)).toBe(accountName);
      });
    });

    describe('tokenizeInstitution', () => {
      test('should tokenize institution names consistently', () => {
        // Arrange
        const institution = 'Wells Fargo';
        
        // Act
        const token1 = tokenizeInstitution(institution);
        const token2 = tokenizeInstitution(institution);
        
        // Assert
        expect(token1).toBe(token2);
        expect(token1).toMatch(/^Institution_\d+$/);
      });

      test('should handle empty institution name', () => {
        // Arrange
        const institution = '';
        
        // Act
        const token = tokenizeInstitution(institution);
        
        // Assert
        expect(token).toMatch(/^Institution_\d+$/);
      });
    });

    describe('tokenizeMerchant', () => {
      test('should tokenize merchant names consistently', () => {
        // Arrange
        const merchant = 'Amazon.com';
        
        // Act
        const token1 = tokenizeMerchant(merchant);
        const token2 = tokenizeMerchant(merchant);
        
        // Assert
        expect(token1).toBe(token2);
        expect(token1).toMatch(/^Merchant_\d+$/);
      });

      test('should handle very long merchant names', () => {
        // Arrange
        const longMerchant = 'A'.repeat(1000);
        
        // Act
        const token = tokenizeMerchant(longMerchant);
        
        // Assert
        expect(token).toMatch(/^Merchant_\d+$/);
        expect(getRealMerchantName(token)).toBe(longMerchant);
      });
    });
  });

  describe('Real Data Retrieval Functions', () => {
    describe('getRealAccountName', () => {
      test('should retrieve real account names from tokens', () => {
        // Arrange
        const accountName = 'Savings Account';
        const institution = 'Ally Bank';
        const token = tokenizeAccount(accountName, institution);
        
        // Act
        const realName = getRealAccountName(token);
        
        // Assert
        expect(realName).toBe(accountName);
      });

      test('should return token if no real data mapping exists', () => {
        // Arrange
        const unknownToken = 'Unknown_Token_123';
        
        // Act
        const result = getRealAccountName(unknownToken);
        
        // Assert
        expect(result).toBe(unknownToken);
      });
    });

    describe('getRealInstitutionName', () => {
      test('should retrieve real institution names from tokens', () => {
        // Arrange
        const institution = 'Bank of America';
        const token = tokenizeInstitution(institution);
        
        // Act
        const realName = getRealInstitutionName(token);
        
        // Assert
        expect(realName).toBe(institution);
      });
    });

    describe('getRealMerchantName', () => {
      test('should retrieve real merchant names from tokens', () => {
        // Arrange
        const merchant = 'Netflix';
        const token = tokenizeMerchant(merchant);
        
        // Act
        const realName = getRealMerchantName(token);
        
        // Assert
        expect(realName).toBe(merchant);
      });
    });
  });

  describe('Response Conversion', () => {
    describe('convertResponseToUserFriendly', () => {
      test('should convert AI response with account tokens to user-friendly format', () => {
        // Arrange
        const accountName = 'Chase Checking';
        const institution = 'Chase Bank';
        const token = tokenizeAccount(accountName, institution);
        const aiResponse = `Your ${token} has a balance of $1,000.`;
        
        // Act
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        // Assert
        expect(userFriendly).toBe(`Your Chase Checking at Chase Bank has a balance of $1,000.`);
      });

      test('should convert AI response with merchant tokens to user-friendly format', () => {
        // Arrange
        const merchant = 'Amazon.com';
        const token = tokenizeMerchant(merchant);
        const aiResponse = `You spent $50 at ${token} yesterday.`;
        
        // Act
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        // Assert
        expect(userFriendly).toBe(`You spent $50 at Amazon.com yesterday.`);
      });

      test('should convert AI response with institution tokens to user-friendly format', () => {
        // Arrange
        const institution = 'Wells Fargo';
        const token = tokenizeInstitution(institution);
        const aiResponse = `Your mortgage is with ${token}.`;
        
        // Act
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        // Assert
        expect(userFriendly).toBe(`Your mortgage is with Wells Fargo.`);
      });

      test('should handle multiple tokens in same response', () => {
        // Arrange
        const accountToken = tokenizeAccount('Savings', 'Ally Bank');
        const merchantToken = tokenizeMerchant('Netflix');
        const institutionToken = tokenizeInstitution('Chase');
        const aiResponse = `Your ${accountToken} has money from ${merchantToken} subscription, and your checking is at ${institutionToken}.`;
        
        // Act
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        // Assert
        expect(userFriendly).toBe(`Your Savings at Ally Bank has money from Netflix subscription, and your checking is at Chase.`);
      });

      test('should leave unknown tokens unchanged', () => {
        // Arrange
        const aiResponse = `Your Account_Unknown has a balance.`;
        
        // Act
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        // Assert
        expect(userFriendly).toBe(`Your Account_Unknown has a balance.`);
      });

      test('should handle response with no tokens', () => {
        // Arrange
        const aiResponse = `Your account balance is $1,000.`;
        
        // Act
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        // Assert
        expect(userFriendly).toBe(`Your account balance is $1,000.`);
      });

      test('should handle empty response', () => {
        // Arrange
        const aiResponse = '';
        
        // Act
        const userFriendly = convertResponseToUserFriendly(aiResponse);
        
        // Assert
        expect(userFriendly).toBe('');
      });
    });
  });

  describe('Tokenization Maps Management', () => {
    describe('clearTokenizationMaps', () => {
      test('should clear all tokenization maps', () => {
        // Arrange
        tokenizeAccount('Test Account', 'Test Bank');
        tokenizeInstitution('Test Institution');
        tokenizeMerchant('Test Merchant');
        
        // Act
        clearTokenizationMaps();
        
        // Assert
        expect(getRealAccountName('Account_1')).toBe('Account_1');
        expect(getRealInstitutionName('Institution_1')).toBe('Institution_1');
        expect(getRealMerchantName('Merchant_1')).toBe('Merchant_1');
      });

      test('should maintain consistency within session', () => {
        // Arrange
        const accountName = 'Test Account';
        const institution = 'Test Bank';
        
        // Act
        const token1 = tokenizeAccount(accountName, institution);
        const realName1 = getRealAccountName(token1);
        const token2 = tokenizeAccount(accountName, institution);
        const realName2 = getRealAccountName(token2);
        
        // Assert
        expect(token1).toBe(token2);
        expect(realName1).toBe(realName2);
        expect(realName1).toBe(accountName);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null and undefined values gracefully', () => {
      // Arrange
      const nullAccount = null as any;
      const undefinedInstitution = undefined as any;
      
      // Act & Assert
      expect(() => tokenizeAccount(nullAccount, undefinedInstitution)).not.toThrow();
      expect(() => getRealAccountName(nullAccount)).not.toThrow();
    });

    test('should handle non-string inputs gracefully', () => {
      // Arrange
      const numberInput = 123 as any;
      const objectInput = {} as any;
      
      // Act & Assert
      expect(() => tokenizeAccount(numberInput, objectInput)).not.toThrow();
      expect(() => convertResponseToUserFriendly(numberInput)).not.toThrow();
    });
  });
}); 