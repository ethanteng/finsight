# Finsight Tier-Based System

## Overview

The tier-based system provides differentiated access to financial data sources based on user subscription levels. This system ensures users get appropriate data access while encouraging upgrades through intelligent upgrade suggestions.

## Architecture

### Data Source Classification

Data sources are classified into three categories:

1. **Account Data** (All tiers)
   - Account balances and transactions
   - Financial institutions
   - Basic financial analysis

2. **Economic Indicators** (Standard+)
   - CPI, Fed rates, mortgage rates
   - Credit card APR data
   - Economic context for decisions

3. **Live Market Data** (Premium only)
   - CD rates and Treasury yields
   - Real-time mortgage rates
   - Stock market data

### Tier Levels

| Tier | Account Data | Economic Data | Live Market Data | Features |
|------|-------------|---------------|------------------|----------|
| **Starter** | ✅ Full access | ❌ None | ❌ None | Basic financial analysis |
| **Standard** | ✅ Full access | ✅ Full access | ❌ None | Economic context + analysis |
| **Premium** | ✅ Full access | ✅ Full access | ✅ Full access | Complete market insights |

## Implementation Details

### 1. Data Source Registry (`src/data/sources.ts`)

The registry defines all available data sources with their tier access levels:

```typescript
export const dataSourceRegistry: Record<string, DataSourceConfig> = {
  'account-balances': {
    id: 'account-balances',
    name: 'Account Balances',
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    category: 'account',
    provider: 'plaid',
    // ...
  },
  'fred-cpi': {
    id: 'fred-cpi',
    name: 'Consumer Price Index',
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    category: 'economic',
    provider: 'fred',
    upgradeBenefit: 'Track inflation impact on your savings'
  },
  // ...
};
```

### 2. Tier-Aware Context Builder (`src/data/orchestrator.ts`)

The orchestrator builds context based on user tier:

```typescript
async buildTierAwareContext(
  tier: UserTier, 
  accounts: any[], 
  transactions: any[],
  isDemo: boolean = false
): Promise<TierAwareContext> {
  const availableSources = DataSourceManager.getSourcesForTier(tier);
  const unavailableSources = DataSourceManager.getUnavailableSourcesForTier(tier);
  const upgradeSuggestions = DataSourceManager.getUpgradeSuggestions(tier);
  
  // Fetch market context based on available sources
  const marketContext = await this.getMarketContextForSources(availableSources, tier, isDemo);
  
  return {
    accounts,
    transactions,
    marketContext,
    tierInfo: { /* ... */ },
    upgradeHints: [ /* ... */ ]
  };
}
```

### 3. Enhanced OpenAI Integration (`src/openai.ts`)

The AI system now receives tier-aware context and provides upgrade suggestions:

```typescript
function buildTierAwareSystemPrompt(tierContext: TierAwareContext): string {
  return `You are Linc, an AI-powered financial analyst.

USER TIER: ${tierContext.tierInfo.currentTier.toUpperCase()}

AVAILABLE DATA SOURCES:
${tierContext.tierInfo.availableSources.map(source => `• ${source}`).join('\n')}

${tierContext.tierInfo.unavailableSources.length > 0 ? 
`UNAVAILABLE DATA SOURCES (upgrade to access):
${tierContext.tierInfo.unavailableSources.map(source => `• ${source}`).join('\n')}` : ''}

TIER LIMITATIONS:
${tierContext.tierInfo.limitations.map(limitation => `• ${limitation}`).join('\n')}

INSTRUCTIONS:
- Provide clear, actionable financial advice based on available data
- When relevant, mention upgrade benefits for unavailable features
- Focus on the user's specific financial situation and goals`;
}
```

### 4. Upgrade Suggestions

Responses are enhanced with upgrade suggestions when relevant:

```typescript
function enhanceResponseWithUpgrades(answer: string, tierContext: TierAwareContext): string {
  if (tierContext.upgradeHints.length === 0) return answer;

  const upgradeSection = `

💡 **Want more insights?** Upgrade your plan to access:
${tierContext.upgradeHints.map(hint => `• **${hint.feature}**: ${hint.benefit}`).join('\n')}

*Your current tier: ${tierContext.tierInfo.currentTier}*
`;

  return answer + upgradeSection;
}
```

## API Endpoints

### New Tier-Aware Endpoints

1. **`POST /ask/tier-aware`** - Enhanced AI responses with tier context
2. **`GET /tier-info`** - Get user's tier information and upgrade suggestions

### Example Usage

```typescript
// Get tier information
const tierInfo = await fetch('/tier-info', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Ask with tier-aware context
const response = await fetch('/ask/tier-aware', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ question: 'What are current CD rates?' })
});
```

## Frontend Components

### TierInfo Component (`frontend/src/components/TierInfo.tsx`)

Displays comprehensive tier information:

- Current tier badge
- Available features with icons
- Current limitations
- Upgrade suggestions with benefits
- Upgrade button (when applicable)

### Features

- **Real-time tier detection** from backend
- **Visual categorization** with icons
- **Upgrade benefits** clearly explained
- **Responsive design** for all screen sizes

## Testing

Comprehensive test suite (`src/__tests__/tier-system.test.ts`) covers:

- Data source classification
- Tier access validation
- Upgrade suggestion generation
- Context building
- API endpoint functionality

Run tests with:
```bash
npm test -- --testPathPattern=tier-system.test.ts
```

## Configuration

### Environment Variables

```bash
# Tier system configuration
ENABLE_TIER_ENFORCEMENT=true
TEST_USER_TIER=starter  # For demo mode

# Data source API keys
FRED_API_KEY=your_fred_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
```

### Feature Flags

```typescript
// src/config/features.ts
export const ENABLE_TIER_ENFORCEMENT = process.env.ENABLE_TIER_ENFORCEMENT === 'true';
```

## Migration Guide

### For Existing Users

1. **Starter tier** - Default for new users
2. **Standard tier** - Available for upgrade
3. **Premium tier** - Full access to all features

### Database Schema

Users have a `tier` field in the database:
```sql
ALTER TABLE users ADD COLUMN tier VARCHAR(20) DEFAULT 'starter';
```

## Benefits

### For Users

- **Clear value proposition** at each tier
- **Intelligent upgrade suggestions** based on usage
- **Transparent limitations** and benefits
- **Seamless experience** with appropriate data access

### For Business

- **Revenue optimization** through tiered pricing
- **User engagement** through upgrade incentives
- **Scalable architecture** for future features
- **Data cost management** through tier restrictions

## Future Enhancements

1. **Payment Integration** - Connect tier upgrades to payment processing
2. **Usage Analytics** - Track feature usage to optimize tier boundaries
3. **Dynamic Pricing** - Adjust tier benefits based on market conditions
4. **A/B Testing** - Test different tier configurations
5. **Enterprise Features** - Custom tiers for business users

## Monitoring

### Key Metrics

- Tier distribution across users
- Upgrade conversion rates
- Feature usage by tier
- API call patterns by tier
- User satisfaction scores

### Logging

The system logs tier-related activities:
```typescript
console.log('DataOrchestrator: Built tier-aware context:', {
  tier: context.tierInfo.currentTier,
  availableSourcesCount: context.tierInfo.availableSources.length,
  unavailableSourcesCount: context.tierInfo.unavailableSources.length,
  upgradeHintsCount: context.upgradeHints.length
});
```

## Security Considerations

1. **Tier validation** on all API endpoints
2. **Data access control** based on user tier
3. **Upgrade verification** through authentication
4. **Rate limiting** by tier level
5. **Audit logging** for tier changes

## Performance Optimization

1. **Caching** - Tier information cached to reduce API calls
2. **Lazy loading** - Data sources loaded only when needed
3. **Batch processing** - Multiple data sources fetched in parallel
4. **CDN integration** - Static tier information served from CDN

---

*This tier system provides a solid foundation for monetizing Finsight while maintaining user satisfaction through clear value propositions and intelligent upgrade suggestions.* 