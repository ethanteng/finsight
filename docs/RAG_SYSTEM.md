# 🤖 RAG System Documentation

## Overview

The Retrieval-Augmented Generation (RAG) system is the core intelligence engine of the Finsight platform, providing enhanced financial insights by combining real-time market data with AI-powered analysis.

## Architecture

### Core Components

#### 1. Data Orchestrator
- **Purpose**: Central coordinator for all data sources
- **Location**: `src/data/orchestrator.ts`
- **Responsibilities**:
  - Fetch market data from multiple sources
  - Manage search context
  - Coordinate data retrieval
  - Cache responses for performance

#### 2. Data Providers
- **FRED Provider**: Federal Reserve Economic Data
- **Alpha Vantage Provider**: Market data and economic indicators
- **Search Provider**: Web search for real-time context
- **Brave Search**: Financial news and market updates

#### 3. Profile System
- **Profile Manager**: User profile management
- **Profile Extractor**: Conversation analysis
- **PlaidProfileEnhancer**: Account-based insights

### Data Flow

```
User Question → Profile Context → Data Orchestrator → Multiple Sources → Enhanced Response
     ↓              ↓                    ↓                    ↓              ↓
  Question    User Profile    Market Data + Search    AI Processing    Final Answer
```

## Tier-Based Access Control

### Starter Tier
- **RAG Access**: ❌ Blocked
- **Features**: Basic financial questions
- **Upgrade Prompt**: "Upgrade to Standard for enhanced market insights"

### Standard Tier
- **RAG Access**: ✅ Limited
- **Features**: 
  - Enhanced market context
  - Real-time data integration
  - Search-based insights
- **Data Sources**: FRED, Alpha Vantage, Search

### Premium Tier
- **RAG Access**: ✅ Full
- **Features**:
  - All Standard features
  - Advanced data sources
  - Personalized insights
  - Account integration
- **Data Sources**: All available sources

## Implementation Details

### Data Sources Integration

#### FRED (Federal Reserve Economic Data)
```typescript
// Example: Federal Funds Rate
const fedRate = await fredProvider.getDataPoint('FEDFUNDS');
// Returns: { value: 4.33, date: '2024-01-01', source: 'FRED' }
```

#### Alpha Vantage
```typescript
// Example: Market data
const marketData = await alphaVantageProvider.getLiveMarketData();
// Returns: Real-time market indicators
```

#### Search Integration
```typescript
// Example: Enhanced search
const searchResults = await searchProvider.enhanceFinancialQuery(query);
// Returns: Contextual financial information
```

### Profile Integration

#### User Profile Management
```typescript
// Profile creation and updates
const profile = await profileManager.getOrCreateProfile(userId);
// Returns: User profile with financial context
```

#### Conversation Analysis
```typescript
// Extract insights from conversations
const insights = await profileExtractor.extractProfileData(conversation);
// Returns: Financial preferences and patterns
```

#### Demo Profile Integration
```typescript
// Demo profile integration for enhanced AI responses
export async function askOpenAIWithEnhancedContext(
  question: string, 
  conversationHistory: Conversation[] = [], 
  userTier: UserTier | string = UserTier.STARTER, 
  isDemo: boolean = false, 
  userId?: string,
  model?: string,
  demoProfile?: string
): Promise<string> {
  // Get user profile if available
  let userProfile: string = '';
  if (isDemo && demoProfile) {
    // Use provided demo profile
    userProfile = demoProfile;
    console.log('OpenAI Enhanced: Using provided demo profile, length:', userProfile.length);
  } else if (userId && !isDemo) {
    // ... existing production profile logic ...
  }

  // Build enhanced system prompt with proactive market context
  const systemPrompt = buildEnhancedSystemPrompt(tierContext, accountSummary, transactionSummary, marketContextSummary, searchContext, userProfile);
  
  // ... rest of function ...
}
```

#### Demo Profile Content
The demo profile provides realistic financial context for AI responses:

```typescript
const demoProfile = `I am Sarah Chen, a 35-year-old software engineer living in Austin, TX with my husband Michael (37, Marketing Manager) and our two children (ages 5 and 8). 

Our household income is $157,000 annually, with me earning $85,000 as a software engineer and Michael earning $72,000 as a marketing manager. We have a stable dual-income household with good job security in the tech industry.

We own our home with a $485,000 mortgage at 3.25% interest rate, and we're focused on building our emergency fund, saving for our children's education, and planning for retirement. Our financial goals include:
- Building a $50,000 emergency fund (currently at $28,450)
- Saving for a family vacation to Europe ($8,000 target, currently at $3,200)
- Building a house down payment fund ($100,000 target, currently at $45,000)
- Long-term retirement planning (currently have $246,200 in retirement accounts)

Our investment strategy is conservative with a mix of index funds in our 401(k) and Roth IRA. We prioritize saving and are working to increase our monthly savings rate. We're also focused on paying down our credit card debt and maintaining good credit scores.`;
```

## Performance Optimization

### Caching Strategy
- **Market Data**: 30-minute TTL
- **Search Results**: 15-minute TTL
- **Profile Data**: Session-based caching
- **Response Cache**: 5-minute TTL

### Rate Limiting
- **FRED API**: 120 requests per minute
- **Alpha Vantage**: 5 requests per minute
- **Search APIs**: 100 requests per minute
- **Graceful Degradation**: Fallback to cached data

## Testing Strategy

### Unit Tests
- **RAG Components**: Individual provider testing
- **Profile System**: Profile management and extraction
- **Tier System**: Access control validation
- **Error Handling**: Network failures and API limits

### Integration Tests
- **End-to-End Workflows**: Complete user journeys
- **Data Source Integration**: Real API testing
- **Performance Testing**: Response time validation
- **Error Scenarios**: Graceful failure handling

### Test Coverage
- **Unit Tests**: 302 tests, 100% passing
- **Integration Tests**: 85 tests, 68% passing
- **Coverage**: 80%+ threshold maintained
- **Performance**: < 2 seconds response time

## Error Handling

### Network Failures
```typescript
try {
  const data = await dataOrchestrator.getMarketContext();
  return data;
} catch (error) {
  // Fallback to cached data
  return getCachedMarketData();
}
```

### API Rate Limiting
```typescript
// Implement exponential backoff
const delay = Math.pow(2, attempt) * 1000;
await new Promise(resolve => setTimeout(resolve, delay));
```

### Data Source Failures
```typescript
// Graceful degradation
if (fredProvider.isAvailable()) {
  return await fredProvider.getData();
} else {
  return await alphaVantageProvider.getData();
}
```

## Configuration

### Environment Variables
```bash
# Data Source API Keys
FRED_API_KEY=your_fred_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
SEARCH_API_KEY=your_search_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_key

# Database
DATABASE_URL=your_database_url
```

### Tier Configuration
```typescript
const tierConfig = {
  starter: {
    ragEnabled: false,
    dataSources: [],
    features: ['basic_questions']
  },
  standard: {
    ragEnabled: true,
    dataSources: ['fred', 'alpha_vantage', 'search'],
    features: ['enhanced_context', 'market_data']
  },
  premium: {
    ragEnabled: true,
    dataSources: ['all'],
    features: ['all_features', 'account_integration']
  }
};
```

## Monitoring and Analytics

### Key Metrics
- **Response Time**: Average < 2 seconds
- **Success Rate**: > 95% successful requests
- **Cache Hit Rate**: > 80% for market data
- **Error Rate**: < 5% for API calls

### Logging
```typescript
// Structured logging
logger.info('RAG request processed', {
  userId,
  tier,
  responseTime,
  dataSources: usedSources,
  cacheHit: isCacheHit
});
```

## Security Considerations

### Data Privacy
- **User Data**: Encrypted at rest
- **API Keys**: Environment variables only
- **Profile Data**: User-specific isolation
- **Audit Trail**: Request logging for compliance

### Access Control
- **Tier Enforcement**: Server-side validation
- **Rate Limiting**: Per-user and per-tier limits
- **Data Isolation**: User-specific data access
- **API Security**: HTTPS and authentication

## Future Enhancements

### Planned Features
- **Advanced Analytics**: Machine learning insights
- **Real-time Alerts**: Market movement notifications
- **Portfolio Integration**: Direct account linking
- **Custom Dashboards**: Personalized financial views

### Scalability Improvements
- **Microservices**: Service decomposition
- **Caching Layer**: Redis implementation
- **Load Balancing**: Multiple API endpoints
- **CDN Integration**: Global content delivery

## Demo Profile Integration Benefits

### Enhanced User Experience
- **Realistic Context**: Demo profile provides comprehensive financial background
- **Personalized Responses**: AI generates context-aware financial advice
- **Goal-Oriented Guidance**: Responses aligned with demo user's stated objectives
- **Risk-Free Exploration**: Full platform functionality without real data

### Technical Advantages
- **Consistent Architecture**: Same profile system works in demo and production
- **Performance Optimized**: No database queries needed for demo profile
- **Type Safety**: Full TypeScript support with proper interfaces
- **Error Resilience**: Graceful fallbacks for missing profile data

### Business Value
- **Feature Demonstration**: Shows personalization capabilities to potential users
- **Conversion Optimization**: Realistic experience increases sign-up likelihood
- **Reduced Friction**: No account creation required for demo access
- **User Education**: Helps users understand profile feature benefits

### Implementation Benefits
- **Code Reuse**: Single UserProfile component serves both modes
- **Maintainability**: Clear separation between demo and production logic
- **Scalability**: Easy to extend with additional demo profiles
- **Testing**: Comprehensive test coverage for profile functionality

## Troubleshooting

### Common Issues

#### Slow Response Times
1. **Check cache hit rate**
2. **Verify API response times**
3. **Review database performance**
4. **Monitor network latency**

#### API Failures
1. **Verify API keys**
2. **Check rate limits**
3. **Test network connectivity**
4. **Review error logs**

#### Data Inconsistencies
1. **Validate data sources**
2. **Check cache freshness**
3. **Verify tier permissions**
4. **Review user profiles**

### Debug Commands
```bash
# Test data sources
npm run test:rag-system

# Check API connectivity
npm run test:integration

# Validate tier access
npm run test:tier-system

# Performance testing
npm run test:performance
```

This RAG system provides the foundation for intelligent financial insights while maintaining performance, security, and scalability standards. 