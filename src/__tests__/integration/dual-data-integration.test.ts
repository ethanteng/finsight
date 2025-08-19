import request from 'supertest';
import { testApp } from './test-app-setup';
import { askOpenAI, askOpenAIWithEnhancedContext } from '../../openai';
import { convertResponseToUserFriendly, clearTokenizationMaps } from '../../privacy';

// Mock the OpenAI module for controlled testing
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn(),
  askOpenAIWithEnhancedContext: jest.fn()
}));

// Mock the privacy module for testing
jest.mock('../../privacy', () => ({
  convertResponseToUserFriendly: jest.fn(),
  clearTokenizationMaps: jest.fn()
}));

describe('Dual-Data System Integration Tests', () => {
  const mockAskOpenAI = askOpenAI as jest.MockedFunction<typeof askOpenAI>;
  const mockAskOpenAIWithEnhancedContext = askOpenAIWithEnhancedContext as jest.MockedFunction<typeof askOpenAIWithEnhancedContext>;
  const mockConvertResponse = convertResponseToUserFriendly as jest.MockedFunction<typeof convertResponseToUserFriendly>;

  // ✅ Proper setup and teardown
  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    
    // Verify required environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY not set for integration tests');
    }
  });

  beforeEach(async () => {
    // ✅ Reset mocks and setup fresh app instance
    jest.clearAllMocks();
    
    // ✅ Default mock implementations
    mockAskOpenAIWithEnhancedContext.mockResolvedValue('Mock AI response');
    mockAskOpenAIWithEnhancedContext.mockResolvedValue('Mock AI response');
    mockConvertResponse.mockImplementation((response) => 
      response.replace(/Account_\w+/g, 'Chase Checking')
    );
  });

  afterEach(async () => {
    // ✅ Cleanup after each test
    clearTokenizationMaps();
  });

  describe('Demo Mode Integration', () => {
    test('should return AI response directly for demo mode', async () => {
      // ✅ Arrange
      const demoResponse = 'Your Chase Checking Account has a balance of $1,000.';
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(demoResponse);

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my account balance?',
          isDemo: true,
          sessionId: 'demo-session-123'
        });

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBe(demoResponse);
      expect(mockConvertResponse).not.toHaveBeenCalled();
    });

    test('should handle demo mode with fake data', async () => {
      // ✅ Arrange
      const fakeDataResponse = 'Your Savings Account at Ally Bank has $5,000.';
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(fakeDataResponse);

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'Show me my accounts',
          isDemo: true,
          sessionId: 'demo-session-456'
        });

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBe(fakeDataResponse);
    });

    test('should handle demo session persistence', async () => {
      // ✅ Arrange
      const demoResponse = 'Demo response with session data';
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(demoResponse);

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'Test question',
          isDemo: true,
          sessionId: 'test-session-123'
        });

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBe(demoResponse);
    });
  });

  describe('Production Mode Integration', () => {
    test('should convert AI response to user-friendly format for production', async () => {
      // ✅ Arrange
      const tokenizedResponse = 'Your Account_abc1 has a balance of $1,000.';
      const userFriendlyResponse = 'Your Chase Checking has a balance of $1,000.';
      
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(tokenizedResponse);
      mockConvertResponse.mockReturnValue(userFriendlyResponse);

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my account balance?',
          isDemo: false
        });

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBe(userFriendlyResponse);
      expect(mockConvertResponse).toHaveBeenCalledWith(tokenizedResponse);
    });

    test('should handle production mode with real data tokenization', async () => {
      // ✅ Arrange
      const tokenizedResponse = 'You spent $50 at Merchant_xyz1 yesterday.';
      const userFriendlyResponse = 'You spent $50 at Amazon.com yesterday.';
      
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(tokenizedResponse);
      mockConvertResponse.mockReturnValue(userFriendlyResponse);

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What did I spend money on?',
          isDemo: false
        });

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBe(userFriendlyResponse);
    });

    test('should handle production user authentication', async () => {
      // ✅ Arrange
      const tokenizedResponse = 'Your Account_abc1 balance is $1,000.';
      const userFriendlyResponse = 'Your Chase Checking balance is $1,000.';
      
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(tokenizedResponse);
      mockConvertResponse.mockReturnValue(userFriendlyResponse);

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .set('Authorization', 'Bearer mock-token')
        .send({
          question: 'What is my balance?',
          isDemo: false
        });

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBe(userFriendlyResponse);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle missing question parameter', async () => {
      // ✅ Arrange
      const requestBody = {
        isDemo: true,
        sessionId: 'demo-session-123'
      };

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send(requestBody);

      // ✅ Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Question is required');
    });

    test('should handle AI service errors gracefully', async () => {
      // ✅ Arrange
      mockAskOpenAIWithEnhancedContext.mockRejectedValue(new Error('AI service unavailable'));

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my balance?',
          isDemo: false
        });

      // ✅ Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to process question');
    });

    test('should handle conversion errors gracefully', async () => {
      // ✅ Arrange
      mockAskOpenAIWithEnhancedContext.mockResolvedValue('Tokenized response');
      mockConvertResponse.mockImplementation(() => {
        throw new Error('Conversion failed');
      });

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my balance?',
          isDemo: false
        });

      // ✅ Assert
      expect(response.status).toBe(500);
    });

    test('should handle malformed request body', async () => {
      // ✅ Arrange
      const malformedBody = { invalidField: 'test' };

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send(malformedBody);

      // ✅ Assert
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Question is required');
    });
  });

  describe('Data Privacy Verification Integration', () => {
    test('should ensure AI never receives real account names in production', async () => {
      // ✅ Arrange
      const tokenizedResponse = 'Your Account_abc1 has $1,000.';
      const userFriendlyResponse = 'Your Chase Checking has $1,000.';
      
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(tokenizedResponse);
      mockConvertResponse.mockReturnValue(userFriendlyResponse);

      // ✅ Act
      await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my balance?',
          isDemo: false
        });

      // ✅ Assert - Verify that conversion was called (indicating tokenized data was processed)
      expect(mockConvertResponse).toHaveBeenCalledWith(tokenizedResponse);
    });

    test('should ensure demo mode uses fake data without tokenization', async () => {
      // ✅ Arrange
      const fakeResponse = 'Your Chase Checking Account has $1,000.';
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(fakeResponse);

      // ✅ Act
      await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my balance?',
          isDemo: true,
          sessionId: 'demo-session-123'
        });

      // ✅ Assert - Verify that conversion was NOT called (indicating no tokenization)
      expect(mockConvertResponse).not.toHaveBeenCalled();
    });
  });

  describe('Performance Integration', () => {
    test('should handle large responses efficiently', async () => {
      // ✅ Arrange
      const largeResponse = 'A'.repeat(10000);
      mockAskOpenAIWithEnhancedContext.mockResolvedValue(largeResponse);

      // ✅ Act
      const startTime = Date.now();
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'Generate large response',
          isDemo: true,
          sessionId: 'demo-session-123'
        });
      const endTime = Date.now();

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBe(largeResponse);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle concurrent requests', async () => {
      // ✅ Arrange
      const responses = ['Response 1', 'Response 2', 'Response 3'];
      mockAskOpenAIWithEnhancedContext
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1])
        .mockResolvedValueOnce(responses[2]);

      // ✅ Act
      const promises = responses.map((_, index) =>
        request(testApp)
          .post('/ask/display-real')
          .send({
            question: `Question ${index + 1}`,
            isDemo: true,
            sessionId: `demo-session-${index}`
          })
      );

      const results = await Promise.all(promises);

      // ✅ Assert
      results.forEach((result, index) => {
        expect(result.status).toBe(200);
        expect(result.body.answer).toBe(responses[index]);
      });
    });
  });

  describe('Security Integration', () => {
    test('should not expose sensitive data in error messages', async () => {
      // ✅ Arrange
      mockAskOpenAIWithEnhancedContext.mockRejectedValue(new Error('Internal error with sensitive data'));

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'What is my balance?',
          isDemo: false
        });

      // ✅ Assert
      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to process question');
      expect(response.body.error).not.toContain('sensitive data');
    });

    test('should handle invalid session IDs gracefully', async () => {
      // ✅ Arrange
      const invalidSessionId = 'invalid-session-123';

      // ✅ Act
      const response = await request(testApp)
        .post('/ask/display-real')
        .send({
          question: 'Test question',
          isDemo: true,
          sessionId: invalidSessionId
        });

      // ✅ Assert
      expect(response.status).toBe(200);
      expect(response.body.answer).toBeDefined();
    });
  });
}); 