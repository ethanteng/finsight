# Tier Testing Guide

## Overview

You can easily test different account tiers (Starter, Standard, Premium) by setting an environment variable. This allows you to see how the AI responds with different levels of market data and features.

## How to Test Different Tiers

### 1. Local Development

Add the environment variable to your `.env.local` file:

```bash
# For Starter tier (basic features only)
TEST_USER_TIER=starter

# For Standard tier (with market context)
TEST_USER_TIER=standard

# For Premium tier (full market data & simulations)
TEST_USER_TIER=premium
```

### 2. Production (Vercel)

Add the environment variable in your Vercel dashboard:

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add a new variable:
   - **Name**: `TEST_USER_TIER`
   - **Value**: `starter`, `standard`, or `premium`
   - **Environment**: Production (and Preview if desired)

### 3. Backend (Render)

Add the environment variable in your Render dashboard:

1. Go to your Render service dashboard
2. Navigate to Environment → Environment Variables
3. Add a new variable:
   - **Key**: `TEST_USER_TIER`
   - **Value**: `starter`, `standard`, or `premium`

## What Each Tier Includes

### Starter Tier
- Basic financial analysis
- Account balances and transactions (Plaid)
- Financial institutions data
- No economic indicators
- No live market data
- No RAG system access

### Standard Tier
- All Starter features
- Economic indicators (FRED API):
  - Consumer Price Index (CPI)
  - Federal Reserve Rate
  - Mortgage Rates
  - Credit Card APR
- RAG system access (real-time financial search)
- No live market data

### Premium Tier
- All Standard features
- Live market data (Alpha Vantage):
  - CD Rates
  - Treasury Yields
  - Live Mortgage Rates
  - Stock Market Data
- Full RAG system access
- "What-if" scenario testing
- Forward-looking planning tools

## Tier-Based Data Source Configuration

The tier system is configured in `src/data/sources.ts` using the `dataSourceRegistry`. Each data source has a `tiers` array that defines which user tiers can access it:

```typescript
export const dataSourceRegistry: Record<string, DataSourceConfig> = {
  // Account Data (all tiers)
  'account-balances': {
    tiers: [UserTier.STARTER, UserTier.STANDARD, UserTier.PREMIUM],
    // Available to all tiers
  },
  
  // Economic Indicators (Standard+)
  'fred-cpi': {
    tiers: [UserTier.STANDARD, UserTier.PREMIUM],
    // Available to Standard+ users
  },
  
  // Live Market Data (Premium only)
  'alpha-vantage-cd-rates': {
    tiers: [UserTier.PREMIUM],
    // Premium only
  }
};
```

### Modifying Tier Access

To change which tiers can access a data source:

1. **Open** `src/data/sources.ts`
2. **Find** the data source in `dataSourceRegistry`
3. **Modify** the `tiers` array to include/exclude tiers
4. **Test** the changes using the tier testing environment

### Adding New Data Sources

To add a new data source with tier restrictions:

```typescript
'new-data-source': {
  id: 'new-data-source',
  name: 'New Data Source',
  description: 'Description of the data source',
  tiers: [UserTier.STANDARD, UserTier.PREMIUM], // Choose which tiers get access
  category: 'external',
  provider: 'internal',
  cacheDuration: 30 * 60 * 1000, // 30 minutes
  isLive: true,
  upgradeBenefit: 'Get access to this new data source'
}
```

## Testing Interface

When you visit the app (`/app`), you'll see a "Tier Testing" panel that shows:
- Current test tier setting
- Backend tier being used
- Instructions for changing tiers

## API Endpoints

- `GET /test/current-tier` - Check current tier setting
- `GET /test/market-data/:tier` - Test market data for specific tier

## Example Usage

1. Set `TEST_USER_TIER=premium` in your environment
2. Ask a question like "Should I refinance my mortgage?"
3. The AI will respond with premium features including live rates and simulations
4. Change to `TEST_USER_TIER=starter` and ask the same question
5. The AI will respond with basic analysis only

This makes it easy to test and demonstrate the different value propositions of each tier! 