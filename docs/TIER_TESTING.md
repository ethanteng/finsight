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
- No market data
- No external context

### Standard Tier
- Basic financial analysis
- Market context (CPI, Fed rates, average APRs)
- No live rates or simulations

### Premium Tier
- Everything in Standard
- Live CD, Treasury, and mortgage rates
- "What-if" scenario testing
- Forward-looking planning tools

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