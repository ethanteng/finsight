# Plaid Balance API Optimization

## Overview

This document describes the comprehensive optimization implemented to reduce Plaid Balance API costs by implementing smart caching and limiting API calls to once per day per account.

## Problem

The Plaid Balance API was being called multiple times per user interaction:
- **4+ API calls** per user session
- **High costs** due to frequent API usage
- **Redundant data fetching** for the same account balances

## Solution

### 1. Database Schema Enhancement

**Added `balanceLastFetched` field to Account model:**
```sql
ALTER TABLE "Account" ADD COLUMN "balanceLastFetched" TIMESTAMP(3);
```

This field tracks when balances were last fetched from Plaid, enabling smart refresh logic.

### 2. BalanceService Implementation

**Location:** `src/services/balance-service.ts`

**Key Features:**
- **24-hour caching** per account
- **Smart fetch logic** - only calls Plaid API if data is stale
- **Database fallback** - uses recent database data when available
- **Force refresh option** for real-time data when needed

**Cache Strategy:**
```typescript
// Cache key format: balance_{accessToken}_{date}
const cacheKey = `balance_${accessToken}_${today}`;

// TTL: 24 hours
const CACHE_TTL = 24 * 60 * 60 * 1000;
```

**Smart Fetch Logic:**
1. Check in-memory cache first
2. Check database for recent data (within 24 hours)
3. Only call Plaid API if both are stale/missing
4. Update both cache and database with fresh data

### 3. Updated API Endpoints

**All balance API calls now use BalanceService:**

#### Main Accounts Endpoint (`/api/plaid/accounts`)
```typescript
// Before: Direct Plaid API call
const balancesResponse = await plaidClient.accountsBalanceGet({
  access_token: tokenRecord.token,
});

// After: Optimized with caching
const balancesData = await BalanceService.getAccountBalances(
  tokenRecord.token,
  plaidClient
);
```

#### AI Context Calls (`src/openai.ts`)
- Both instances updated to use BalanceService
- Maintains same data structure for AI processing

#### Real-time Sync Calls
- Uses `forceRefresh: true` for real-time data when explicitly requested
- Still respects caching for normal operations

### 4. Background Refresh System

**Daily Cron Job:**
- **Script:** `scripts/run-balance-refresh-cron.js`
- **Schedule:** Daily at 6:00 AM
- **Setup:** `scripts/setup-balance-refresh-cron.sh`

**Features:**
- Refreshes all active user balances
- Comprehensive error handling and logging
- Cache statistics monitoring
- Graceful failure handling

### 5. Management Endpoints

**New API endpoints for monitoring and control:**

#### Manual Balance Refresh
```http
POST /api/plaid/refresh-balances
Authorization: Bearer <token>
```
- Manually refresh balances for authenticated user
- Useful for testing and emergency situations

#### Cache Statistics
```http
GET /api/plaid/balance-cache-stats
```
- Monitor cache performance
- View cache size and keys

#### Clear Cache
```http
POST /api/plaid/clear-balance-cache
Authorization: Bearer <token>
```
- Clear all balance cache entries
- Useful for debugging and testing

## Cost Savings

### Before Optimization
- **~4 API calls** per user interaction
- **High frequency** of redundant calls
- **No caching** mechanism

### After Optimization
- **~1 API call** per account per day (regardless of user interactions)
- **75-90% reduction** in Balance API calls
- **Smart caching** prevents redundant calls

### Example Scenario
**User with 3 accounts, 10 daily interactions:**
- **Before:** 40 API calls per day
- **After:** 3 API calls per day
- **Savings:** 92.5% reduction

## Implementation Details

### Cache Hierarchy
1. **In-Memory Cache** (fastest, 24-hour TTL)
2. **Database Cache** (recent data within 24 hours)
3. **Plaid API** (only when both caches are stale)

### Error Handling
- Graceful fallback to database data
- Comprehensive error logging
- User-friendly error messages
- Automatic retry logic for transient failures

### Monitoring
- Cache hit/miss statistics
- API call frequency tracking
- Performance metrics logging
- Error rate monitoring

## Usage Examples

### Basic Balance Fetching
```typescript
// Get balances with smart caching
const balances = await BalanceService.getAccountBalances(
  accessToken,
  plaidClient
);

// Force refresh for real-time data
const freshBalances = await BalanceService.getAccountBalances(
  accessToken,
  plaidClient,
  true // forceRefresh
);
```

### Check if Balance is Fresh
```typescript
const isFresh = await BalanceService.isBalanceFresh(plaidAccountId);
if (!isFresh) {
  // Refresh balance data
}
```

### Refresh All User Balances
```typescript
await BalanceService.refreshAllUserBalances(userId, plaidClient);
```

## Setup Instructions

### 1. Database Migration
```bash
npx prisma migrate dev --name add_balance_last_fetched
```

### 2. Setup Cron Job
```bash
./scripts/setup-balance-refresh-cron.sh
```

### 3. Test the System
```bash
# Test manual refresh
curl -X POST http://localhost:3000/api/plaid/refresh-balances \
  -H "Authorization: Bearer <your-token>"

# Check cache stats
curl http://localhost:3000/api/plaid/balance-cache-stats
```

## Monitoring and Maintenance

### Daily Monitoring
- Check cron job logs: `logs/balance-refresh.log`
- Monitor cache statistics via API endpoint
- Review error rates and performance metrics

### Troubleshooting
- **Cache issues:** Use clear cache endpoint
- **Stale data:** Check `balanceLastFetched` timestamps
- **API errors:** Review Plaid API logs and error messages

### Performance Tuning
- Adjust cache TTL if needed (currently 24 hours)
- Monitor memory usage for in-memory cache
- Consider Redis for distributed caching in production

## Future Enhancements

### Potential Improvements
1. **Redis Integration** for distributed caching
2. **Webhook Integration** for real-time balance updates
3. **Predictive Caching** based on user behavior patterns
4. **A/B Testing** for optimal cache TTL values

### Scalability Considerations
- Monitor cache memory usage as user base grows
- Consider database partitioning for balance data
- Implement cache warming strategies for peak usage

## Conclusion

This optimization significantly reduces Plaid Balance API costs while maintaining data freshness and user experience. The smart caching system ensures that users get fast, accurate balance information while minimizing expensive API calls.

**Key Benefits:**
- ✅ **75-90% cost reduction** in Balance API calls
- ✅ **Improved performance** with in-memory caching
- ✅ **Data freshness** with daily background refresh
- ✅ **Monitoring capabilities** for ongoing optimization
- ✅ **Graceful fallbacks** for reliability
