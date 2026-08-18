# Retirement Portfolio Analysis - Local Setup Guide

This guide walks you through setting up and testing the Retirement Portfolio Analysis module locally.

## Prerequisites

- Node.js installed
- PostgreSQL database running
- Existing Finsight project setup

## Step 1: Environment Variables

Add these to your `.env.local` file:

```bash
# Required for retirement analytics
TIINGO_API_KEY=your_tiingo_api_key_here
FMP_API_KEY=your_fmp_api_key_here

# Used by other market-context features, not the retirement stress-test engine:
FRED_API_KEY=your_fred_api_key_here
ALPHA_VANTAGE_API_KEY=062AEP9BK5045MT1
```

**Note**: If you don't have API keys yet, the module will use mock data for testing (keys starting with `test_`).

## Step 2: Database Migration

Run Prisma migrations to create the new tables:

```bash
# Generate Prisma client with new schema
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name add_retirement_analytics

# Verify migration succeeded
npx prisma migrate status
```

This creates three new tables:
- `retirement_analyses` - Stores analysis results
- `asset_price_history` - Caches historical price data
- `security_metadata` - Caches security metadata

## Step 3: Create Test Endpoint

Create a test route to call the retirement analysis module. Add this to `src/routes/ai.ts`:

```typescript
import { analyzeRetirementPortfolio } from '../retirement-analytics';
import { getFinancialData } from '../services/financial-data-service';

// Add this route to the router
router.post('/retirement-analysis', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    
    // Get user's financial data
    const financialData = await getFinancialData(userId);
    
    if (!financialData.investments?.holdings || financialData.investments.holdings.length === 0) {
      return res.status(400).json({
        error: 'No holdings found',
        message: 'User must have investment holdings to run retirement analysis'
      });
    }

    // Extract required inputs from request body
    const {
      currentAge,
      retirementAge,
      lifeExpectancy = 95,
      annualWithdrawalAmount,
      withdrawalStartAge
    } = req.body;

    // Validate required fields
    if (!currentAge || !annualWithdrawalAmount || !withdrawalStartAge) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Required: currentAge, annualWithdrawalAmount, withdrawalStartAge'
      });
    }

    // Prepare analysis input
    const analysisInput = {
      holdings: financialData.investments.holdings,
      securities: financialData.investments.securities || [],
      currentAge,
      retirementAge: retirementAge || null,
      lifeExpectancy,
      annualWithdrawalAmount,
      withdrawalStartAge
    };

    // Run analysis
    console.log('Running retirement analysis for user:', userId);
    const result = await analyzeRetirementPortfolio(analysisInput);

    res.json({
      success: true,
      analysis: result
    });
  } catch (error) {
    console.error('Error running retirement analysis:', error);
    res.status(500).json({
      error: 'Failed to run retirement analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

## Step 4: Test the Endpoint

### Option A: Using curl

```bash
# First, get an auth token (login via your auth endpoint)
# Then run:

curl -X POST http://localhost:3000/api/ai/retirement-analysis \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "currentAge": 45,
    "retirementAge": 65,
    "lifeExpectancy": 95,
    "annualWithdrawalAmount": 50000,
    "withdrawalStartAge": 65
  }'
```

### Option B: Using Postman/Thunder Client

1. **Method**: POST
2. **URL**: `http://localhost:3000/api/ai/retirement-analysis`
3. **Headers**:
   - `Content-Type: application/json`
   - `Authorization: Bearer YOUR_AUTH_TOKEN`
4. **Body** (JSON):
```json
{
  "currentAge": 45,
  "retirementAge": 65,
  "lifeExpectancy": 95,
  "annualWithdrawalAmount": 50000,
  "withdrawalStartAge": 65
}
```

### Option C: Direct Function Test (No API)

Create a test file `src/retirement-analytics/__tests__/test-analysis.ts`:

```typescript
import { analyzeRetirementPortfolio } from '../index';
import { getFinancialData } from '../../services/financial-data-service';

async function testRetirementAnalysis() {
  try {
    // Replace with a real user ID from your database
    const userId = 'your-test-user-id';
    
    // Get financial data
    const financialData = await getFinancialData(userId);
    
    if (!financialData.investments?.holdings) {
      console.error('No holdings found for user');
      return;
    }

    // Run analysis
    const result = await analyzeRetirementPortfolio({
      holdings: financialData.investments.holdings,
      securities: financialData.investments.securities || [],
      currentAge: 45,
      retirementAge: 65,
      lifeExpectancy: 95,
      annualWithdrawalAmount: 50000,
      withdrawalStartAge: 65
    });

    console.log('Analysis Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testRetirementAnalysis();
```

Run it:
```bash
npx ts-node src/retirement-analytics/__tests__/test-analysis.ts
```

## Step 5: Verify It's Working

### Expected Output Structure

The analysis should return a JSON object with:

```json
{
  "success": true,
  "analysis": {
    "summary": {
      "characteristics": {
        "growthPotential": "high|moderate|low",
        "drawdownResistance": "high|moderate|low",
        "withdrawalFragility": "high|moderate|low",
        "inflationProtection": "high|moderate|low"
      },
      "tradeoffs": {
        "upside": "...",
        "downside": "..."
      },
      "primaryObservation": "...",
      "confidence": "high|medium|low",
      "timelineBucket": "10|20|30"
    },
    "metrics": {
      "equityAllocation": 75.5,
      "withdrawalRate": 0.04,
      "yearsOfExpenses": 25.0,
      "historicalWithdrawalRates": {
        "p10": 0.028,
        "p25": 0.034,
        "p50": 0.040,
        "p75": 0.046,
        "p90": 0.051
      }
    },
    "stressTest": {
      "totalSequences": 300,
      "survivalRate": 0.78,
      "depletionPercentiles": {...},
      "worstSequences": {...}
    },
    "dataQuality": {...},
    "disclaimers": [...]
  }
}
```

### Check Logs

Watch for:
- ✅ "Running retirement analysis for user: ..."
- ✅ Provider initialization messages (Tiingo and FMP)
- ✅ Sequence generation progress
- ❌ Any error messages

## Step 6: Common Issues & Solutions

### Issue: "No holdings found"
**Solution**: Make sure the user has investment accounts connected via Plaid/SnapTrade with actual holdings.

### Issue: "TIINGO_API_KEY not found"
**Solution**: The module will use mock data. For real data, add `TIINGO_API_KEY` to `.env.local`.

### Issue: "Database migration fails"
**Solution**: 
```bash
# Reset Prisma client
npx prisma generate

# Check migration status
npx prisma migrate status

# If needed, reset database (⚠️ WARNING: deletes data)
npx prisma migrate reset
```

### Issue: "TypeScript compilation errors"
**Solution**:
```bash
# Clean and rebuild
rm -rf dist node_modules/.prisma
npm install
npx prisma generate
npx tsc --noEmit
```

### Issue: "Analysis takes too long"
**Solution**: This is expected for the first run. The module:
- Fetches historical data (cached after first run)
- Generates hundreds of rolling sequences
- Runs simulations

Subsequent runs will be faster due to caching.

## Step 7: Integration with LLM

The retirement analysis is automatically included in LLM prompts when available. To test:

1. Run a retirement analysis (stores result in `retirement_analyses` table)
2. Ask a question via `/api/ai/ask` endpoint
3. The LLM will have access to retirement analysis context

The analysis is included in the `FinancialContextSnapshot` when:
- User has retirement analysis results
- Question is related to retirement planning

## Step 8: Next Steps

1. **Add UI**: Create frontend components to display analysis results
2. **Schedule Updates**: Set up periodic analysis updates
3. **Enhance Data**: Integrate with more data providers for better accuracy
4. **Add Tests**: Write unit and integration tests for the module

## Troubleshooting

### Check Database Tables

```sql
-- Verify tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('retirement_analyses', 'asset_price_history', 'security_metadata');

-- Check if analysis was stored
SELECT id, "computedAt", "dataQualityScore" 
FROM retirement_analyses 
ORDER BY "computedAt" DESC 
LIMIT 5;
```

### Check Cache

The module caches:
- Price history (24 hours)
- Security metadata (7 days)

Clear cache by restarting the server (in-memory cache) or manually deleting cache entries.

### Performance Tips

- First run: ~30-60 seconds (fetching data)
- Subsequent runs: ~5-10 seconds (using cache)
- With real API keys: May be slower due to rate limits

## Related Documentation

- [Stress Test Approach](features/STRESS_TEST_APPROACH.md) — How the stress test works (sequences, simulation, outcomes)
- [Historical Withdrawal Rate Solver](features/HISTORICAL_WITHDRAWAL_RATE_SOLVER.md) — How withdrawal rate percentiles are computed

## Support

If you encounter issues:
1. Check logs for error messages
2. Verify environment variables are set
3. Ensure database migrations completed
4. Check that user has investment holdings
5. Review the plan document: `.cursor/plans/retirement_portfolio_analysis_module_design_d0d71975.plan.md`
