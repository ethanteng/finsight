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