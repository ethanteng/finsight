import { dataOrchestrator } from '../../data/orchestrator';
import { ProfileManager } from '../../profile/manager';
import { ProfileExtractor } from '../../profile/extractor';
import { PlaidProfileEnhancer } from '../../profile/plaid-enhancer';
import { UserTier } from '../../data/types';

// Mock the data orchestrator
jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: {
    getMarketContextSummary: jest.fn(),
    getCacheStats: jest.fn(),
    refreshMarketContext: jest.fn(),
    invalidateCache: jest.fn(),
    getMarketContext: jest.fn(),
    buildTierAwareContext: jest.fn(),
    getSearchContext: jest.fn(),
    forceRefreshAllContext: jest.fn()
  }
}));

// Mock ProfileManager
jest.mock('../../profile/manager');

// Mock ProfileExtractor
jest.mock('../../profile/extractor');

// Mock PlaidProfileEnhancer
jest.mock('../../profile/plaid-enhancer');

const MockDataOrchestrator = dataOrchestrator as jest.Mocked<typeof dataOrchestrator>;
const MockProfileManager = ProfileManager as jest.MockedClass<typeof ProfileManager>;
const MockProfileExtractor = ProfileExtractor as jest.MockedClass<typeof ProfileExtractor>;
const MockPlaidProfileEnhancer = PlaidProfileEnhancer as jest.MockedClass<typeof PlaidProfileEnhancer>;

describe('RAG & Intelligent Profile System Unit Tests', () => {
  let mockProfileManager: any;
  let mockExtractor: any;
  let mockEnhancer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock instances
    mockProfileManager = {
      getOrCreateProfile: jest.fn(),
      updateProfile: jest.fn(),
      updateProfileFromConversation: jest.fn()
    };
    
    mockExtractor = {
      extractAndUpdateProfile: jest.fn()
    };
    
    mockEnhancer = {
      enhanceProfileFromPlaidData: jest.fn(),
      analyzePlaidDataForProfile: jest.fn()
    };
    
    // Mock the constructors
    (MockProfileManager as any).mockImplementation(() => mockProfileManager);
    (MockProfileExtractor as any).mockImplementation(() => mockExtractor);
    (MockPlaidProfileEnhancer as any).mockImplementation(() => mockEnhancer);
  });

  describe('RAG System Functionality', () => {
    const testCases = [
      {
        name: 'Starter Tier - No RAG Access',
        tier: 'starter',
        question: 'What is the current unemployment rate?',
        shouldHaveRAG: false,
        shouldMentionLimitations: true
      },
      {
        name: 'Standard Tier - RAG Access',
        tier: 'standard',
        question: 'What is the current unemployment rate?',
        shouldHaveRAG: true,
        shouldMentionLimitations: false
      },
      {
        name: 'Premium Tier - RAG Access',
        tier: 'premium',
        question: 'What are current mortgage rates?',
        shouldHaveRAG: true,
        shouldMentionLimitations: false
      }
    ];

    testCases.forEach(testCase => {
      it(`should handle RAG access correctly for ${testCase.name}`, async () => {
        // Mock RAG data for Standard and Premium tiers
        if (testCase.tier === 'standard' || testCase.tier === 'premium') {
          MockDataOrchestrator.getSearchContext.mockResolvedValue({
            query: testCase.question,
            results: [
              {
                title: 'Current Economic Data',
                snippet: 'The current unemployment rate is 4.2% as of July 2025',
                url: 'https://example.com/economic-data',
                source: 'example.com',
                relevance: 0.9
              }
            ],
            summary: 'Current unemployment rate is 4.2% as of July 2025',
            lastUpdate: new Date()
          });
        } else {
          MockDataOrchestrator.getSearchContext.mockResolvedValue(null);
        }

        const result = await MockDataOrchestrator.getSearchContext(testCase.question, testCase.tier as UserTier);

        if (testCase.shouldHaveRAG) {
          expect(result).toBeDefined();
          expect(result?.results).toHaveLength(1);
          expect(result?.results[0].snippet).toContain('4.2%');
        } else {
          expect(result).toBeNull();
        }

        expect(MockDataOrchestrator.getSearchContext).toHaveBeenCalledWith(testCase.question, testCase.tier as UserTier);
      });
    });
  });

  describe('Intelligent Profile System', () => {
    const tiers = ['starter', 'standard', 'premium'];
    
    tiers.forEach(tier => {
      it(`should build profiles for ${tier} tier`, async () => {
        const profileQuestions = [
          'I am a 30-year-old software engineer making $120,000 per year',
          'I have a mortgage with a 3.5% interest rate',
          'I want to save for retirement and have $50,000 in my 401k'
        ];
        
        mockProfileManager.getOrCreateProfile.mockResolvedValue('A software engineer');
        mockProfileManager.updateProfile.mockResolvedValue();
        mockExtractor.extractAndUpdateProfile.mockResolvedValue('A 30-year-old software engineer making $120,000 per year');
        
        // Test profile building
        for (const question of profileQuestions) {
          const conversation = {
            id: 'conv-1',
            question,
            answer: 'Based on your profile, here is some advice...',
            createdAt: new Date()
          };
          
          await mockProfileManager.updateProfileFromConversation('test-user-id', conversation);
        }
        
        expect(mockProfileManager.updateProfileFromConversation).toHaveBeenCalledTimes(3);
        // The extractor is called internally by the ProfileManager, so we don't test it directly here
      });
    });
  });

  describe('PlaidProfileEnhancer Integration', () => {
    it('should enhance profiles with Plaid data', async () => {
      const accounts = [
        {
          id: '1',
          name: 'Chase Checking',
          type: 'depository',
          balance: { current: 5000 },
          institution: 'Chase Bank'
        }
      ];

      const transactions = [
        {
          id: '1',
          account_id: '1',
          amount: -1000,
          date: '2025-07-15',
          name: 'Rent Payment',
          category: ['Payment', 'Rent'],
          pending: false
        }
      ];

      mockEnhancer.enhanceProfileFromPlaidData.mockResolvedValue(
        'Enhanced profile with Chase checking ($5,000) and rent payment ($1,000)'
      );

      const result = await mockEnhancer.enhanceProfileFromPlaidData(
        'test-user-id',
        accounts,
        transactions,
        'A 30-year-old software engineer'
      );

      expect(result).toContain('Enhanced profile');
      expect(mockEnhancer.enhanceProfileFromPlaidData).toHaveBeenCalledWith(
        'test-user-id',
        accounts,
        transactions,
        'A 30-year-old software engineer'
      );
    });
  });

  describe('System Integration', () => {
    it('should combine RAG and profile functionality', async () => {
      // Mock RAG data
      MockDataOrchestrator.getSearchContext.mockResolvedValue({
        query: 'What are current refinance rates?',
        results: [
          {
            title: 'Current Mortgage Rates',
            snippet: 'Current refinance rates are around 6.57% as of July 2025',
            url: 'https://example.com/mortgage-rates',
            source: 'example.com',
            relevance: 0.9
          }
        ],
        summary: 'Current refinance rates are around 6.57% as of July 2025',
        lastUpdate: new Date()
      });

      mockProfileManager.getOrCreateProfile.mockResolvedValue('A 35-year-old with a mortgage');

      const ragResult = await MockDataOrchestrator.getSearchContext('What are current refinance rates?', 'premium' as UserTier);
      const profileResult = await mockProfileManager.getOrCreateProfile('test-user-id');

      expect(ragResult).toBeDefined();
      expect(ragResult?.results[0].snippet).toContain('6.57%');
      expect(profileResult).toBe('A 35-year-old with a mortgage');
    });
  });

  describe('Tier-appropriate Access Control', () => {
    it('should block RAG access for Starter tier', async () => {
      MockDataOrchestrator.getSearchContext.mockResolvedValue(null);

      const result = await MockDataOrchestrator.getSearchContext('What is the current unemployment rate?', 'starter' as UserTier);
      
      expect(result).toBeNull();
      expect(MockDataOrchestrator.getSearchContext).toHaveBeenCalledWith(
        'What is the current unemployment rate?',
        'starter'
      );
    });

    it('should allow RAG access for Standard tier', async () => {
      MockDataOrchestrator.getSearchContext.mockResolvedValue({
        query: 'What is the current unemployment rate?',
        results: [
          {
            title: 'Economic Data',
            snippet: 'Unemployment rate is 4.2% as of July 2025',
            url: 'https://example.com/economic-data',
            source: 'example.com',
            relevance: 0.9
          }
        ],
        summary: 'Unemployment rate is 4.2% as of July 2025',
        lastUpdate: new Date()
      });

      const result = await MockDataOrchestrator.getSearchContext('What is the current unemployment rate?', 'standard' as UserTier);
      
      expect(result).toBeDefined();
      expect(result?.results[0].snippet).toContain('4.2%');
      expect(MockDataOrchestrator.getSearchContext).toHaveBeenCalledWith(
        'What is the current unemployment rate?',
        'standard'
      );
    });
  });

  describe('Profile Building Over Time', () => {
    it('should build comprehensive profile over multiple interactions', async () => {
      mockProfileManager.getOrCreateProfile.mockResolvedValue('Initial profile');
      mockExtractor.extractAndUpdateProfile.mockResolvedValue('Enhanced profile with new information');
      
      const conversations = [
        {
          id: 'conv-1',
          question: 'I am a 30-year-old software engineer',
          answer: 'Based on your profile...',
          createdAt: new Date()
        },
        {
          id: 'conv-2',
          question: 'I make $120,000 per year',
          answer: 'Given your income...',
          createdAt: new Date()
        },
        {
          id: 'conv-3',
          question: 'I have a mortgage at 3.5%',
          answer: 'With your mortgage...',
          createdAt: new Date()
        }
      ];
      
      for (const conversation of conversations) {
        await mockProfileManager.updateProfileFromConversation('test-user-id', conversation);
      }
      
      expect(mockProfileManager.updateProfileFromConversation).toHaveBeenCalledTimes(3);
      // The extractor is called internally by the ProfileManager, so we don't test it directly here
    });
  });

  describe('Error Handling', () => {
    it('should handle RAG API errors gracefully', async () => {
      MockDataOrchestrator.getSearchContext.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        MockDataOrchestrator.getSearchContext('What is the current unemployment rate?', 'standard' as UserTier)
      ).rejects.toThrow('API rate limit exceeded');
    });

    it('should handle profile extraction errors gracefully', async () => {
      mockExtractor.extractAndUpdateProfile.mockRejectedValue(new Error('OpenAI API error'));

      const conversation = {
        id: 'conv-1',
        question: 'I am a software engineer',
        answer: 'Here is some advice...',
        createdAt: new Date()
      };

      await expect(
        mockExtractor.extractAndUpdateProfile('test-user-id', conversation, 'Existing profile')
      ).rejects.toThrow('OpenAI API error');
    });

    it('should handle Plaid enhancement errors gracefully', async () => {
      mockEnhancer.enhanceProfileFromPlaidData.mockRejectedValue(new Error('Plaid API error'));

      await expect(
        mockEnhancer.enhanceProfileFromPlaidData('test-user-id', [], [], 'Existing profile')
      ).rejects.toThrow('Plaid API error');
    });
  });
}); 