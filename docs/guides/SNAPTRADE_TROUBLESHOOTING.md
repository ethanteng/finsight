# 🔧 SnapTrade Troubleshooting Guide

## 🚨 **Production Error: SnapTrade Initialization Failed (400 Error)**

### **Error Description**
```
XHRPOST https://finsight-backend-hrel.onrender.com/snaptrade/init [HTTP/3 400 424ms]
SnapTrade initialization failed: Object { success: false, error: 'Request failed with status code 400' }
```

### **Root Cause Analysis**

The 400 error indicates that the SnapTrade API is rejecting the request. This is typically caused by:

1. **Environment Variable Loading Issue**: Production app loading from `.env` files instead of Render environment variables
2. **Missing or Invalid Credentials**: SnapTrade API credentials not properly configured in Render
3. **Environment Configuration**: Wrong environment mode or missing production variables
4. **API Request Format**: Invalid request parameters or format
5. **Network/Connectivity**: API endpoint accessibility issues

### **Most Common Issue: Environment Variable Loading**

**CRITICAL**: In production, the app should use Render's environment variables, NOT `.env` files. If the app is loading from `.env` files in production, it will use development credentials or no credentials at all.

**FIX IMPLEMENTED**: The application has been updated to only load `.env.local` files in non-production environments. In production, it will use Render's environment variables exclusively.

## 🔍 **Diagnostic Steps**

### **Step 1: Check SnapTrade Configuration**

Run the diagnostic script on your production server:

```bash
# On your production server (Render)
node scripts/diagnose-snaptrade.js
```

Or check the configuration endpoint:

```bash
curl https://finsight-backend-hrel.onrender.com/snaptrade/config
```

### **Step 2: Verify Environment Variables**

Ensure these environment variables are set in your Render dashboard:

#### **For Production Mode:**
```bash
SNAPTRADE_MODE=production
SNAPTRADE_CLIENT_ID_PROD=your_production_client_id
SNAPTRADE_CONSUMER_KEY_PROD=your_production_consumer_key
SNAPTRADE_ENV_PROD=production
```

#### **For Sandbox Mode:**
```bash
SNAPTRADE_MODE=sandbox
SNAPTRADE_CLIENT_ID=your_sandbox_client_id
SNAPTRADE_CONSUMER_KEY=your_sandbox_consumer_key
```

### **Step 3: Check SnapTrade API Status**

Test the SnapTrade API connectivity:

```bash
curl https://finsight-backend-hrel.onrender.com/snaptrade/status
```

### **Step 4: Verify Database Schema**

Ensure the SnapTrade users table exists:

```sql
-- Check if table exists
SELECT table_name FROM information_schema.tables WHERE table_name = 'snaptrade_users';

-- Check table structure
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'snaptrade_users' ORDER BY ordinal_position;
```

## 🛠️ **Common Solutions**

### **Solution 1: Missing Production Credentials**

If you're running in production mode but missing production credentials:

1. **Get Production Credentials** from SnapTrade dashboard
2. **Set Environment Variables** in Render:
   - `SNAPTRADE_CLIENT_ID_PROD`
   - `SNAPTRADE_CONSUMER_KEY_PROD`
3. **Restart the Application** to load new environment variables

### **Solution 2: Switch to Sandbox Mode**

If you don't have production credentials yet:

1. **Set Environment Variable** in Render:
   ```bash
   SNAPTRADE_MODE=sandbox
   ```
2. **Ensure Sandbox Credentials** are set:
   ```bash
   SNAPTRADE_CLIENT_ID=your_sandbox_client_id
   SNAPTRADE_CONSUMER_KEY=your_sandbox_consumer_key
   ```
3. **Restart the Application**

### **Solution 3: Database Migration Issues**

If the SnapTrade users table doesn't exist (error: `The table 'public.snaptrade_users' does not exist`):

1. **Run Database Migrations** (Recommended):
   ```bash
   npx prisma migrate deploy
   ```

2. **Or use the provided script**:
   ```bash
   node scripts/apply-production-migration.js
   ```

3. **Or Push Schema Changes** (Alternative):
   ```bash
   npx prisma db push
   ```

**Note**: The `snaptrade_users` table was added in migration `20250901002129_add_snaptrade_user_model`. If this migration hasn't been applied to production, you'll get the table not found error.

### **Migration Conflict Resolution**

If you get an error like `column "algorithm" of relation "encrypted_profile_data" already exists` when running `npx prisma migrate deploy`:

1. **Use the conflict resolution script**:
   ```bash
   node scripts/resolve-migration-conflict.js
   ```

2. **Or run the SQL directly**:
   ```bash
   npx prisma db execute --file scripts/create-snaptrade-table.sql
   ```

3. **Or use the bash script**:
   ```bash
   bash scripts/fix-snaptrade-table.sh
   ```

This will create only the `snaptrade_users` table without trying to modify existing columns that are already present.

### **Solution 4: Invalid API Credentials**

If credentials are set but still failing:

1. **Verify Credentials** with SnapTrade support
2. **Check Credential Format** (no extra spaces, correct format)
3. **Test Credentials** using SnapTrade's API documentation
4. **Regenerate Credentials** if necessary

## 📋 **Environment Variable Checklist**

### **Required Variables for Production:**

- [ ] `SNAPTRADE_MODE=production`
- [ ] `SNAPTRADE_CLIENT_ID_PROD` (or `SNAPTRADE_CLIENT_ID`)
- [ ] `SNAPTRADE_CONSUMER_KEY_PROD` (or `SNAPTRADE_CONSUMER_KEY`)
- [ ] `SNAPTRADE_ENV_PROD=production` (optional)

### **Required Variables for Sandbox:**

- [ ] `SNAPTRADE_MODE=sandbox`
- [ ] `SNAPTRADE_CLIENT_ID`
- [ ] `SNAPTRADE_CONSUMER_KEY`

## 🔧 **Debugging Commands**

### **Check Environment Variables**
```bash
# On production server
echo "SNAPTRADE_MODE: $SNAPTRADE_MODE"
echo "SNAPTRADE_CLIENT_ID: ${SNAPTRADE_CLIENT_ID:+SET}"
echo "SNAPTRADE_CONSUMER_KEY: ${SNAPTRADE_CONSUMER_KEY:+SET}"
echo "SNAPTRADE_CLIENT_ID_PROD: ${SNAPTRADE_CLIENT_ID_PROD:+SET}"
echo "SNAPTRADE_CONSUMER_KEY_PROD: ${SNAPTRADE_CONSUMER_KEY_PROD:+SET}"
```

### **Test SnapTrade API Directly**
```bash
# Test with curl (replace with your actual credentials)
curl -X POST "https://api.snaptrade.com/api/v1/snapTrade/listUserAccount" \
  -H "Content-Type: application/json" \
  -H "clientId: YOUR_CLIENT_ID" \
  -H "consumerKey: YOUR_CONSUMER_KEY" \
  -d '{"userId": "test-user"}'
```

### **Check Application Logs**
```bash
# On Render, check the logs for SnapTrade-related errors
# Look for messages starting with "🔍" or "❌"
```

## 🚀 **Quick Fix Steps**

1. **Check Configuration**:
   ```bash
   curl https://finsight-backend-hrel.onrender.com/snaptrade/config
   ```

2. **If credentials are missing**, add them to Render environment variables

3. **If in wrong mode**, change `SNAPTRADE_MODE` to `sandbox` or `production`

4. **Restart the application** after making changes

5. **Test the fix**:
   ```bash
   curl https://finsight-backend-hrel.onrender.com/snaptrade/status
   ```

## 🕰️ **Account balances frozen at an old date**

### **Symptom**

One or more SnapTrade accounts show a balance that no longer matches the
brokerage, while other accounts on the *same* connection are current. The
connection is not disabled, so nothing prompts a reconnect, and activities for
the frozen accounts keep arriving normally.

### **Root cause**

Without real-time data access, SnapTrade serves cached brokerage state and
refreshes it on its own schedule; how long it caches varies by brokerage. When
that schedule stops advancing for an account, every read returns the same
holdings indefinitely. `sync_status.holdings.last_successful_sync` is the
authoritative signal, and it is per account — not per connection — so one
account can freeze while its siblings keep syncing.

### **Diagnosis**

Read the persisted snapshot rather than re-querying the provider:

```sql
SELECT a->>'name'  AS account,
       a->'syncStatus'->'holdings'->>'last_successful_sync' AS holdings_synced
FROM financial_summary_snapshots s, jsonb_array_elements(s.accounts::jsonb) a
WHERE s."userId" = '<user id>' AND a->>'source' = 'snaptrade';
```

The snapshot already records the same conclusion: `quality.staleSourceIds`
lists every `account:{id}` whose observation is past its max age. The Finances
page marks those rows stale from that list, and dates each row from the
account's confirmed provider sync (`lastSyncedAt`) — never from our own fetch
time, which can look "today" even when SnapTrade has not completed a holdings
sync.

### **Fix**

Ask SnapTrade to re-sync the brokerage authorization:

```
POST /snaptrade/connections/:authorizationId/refresh
```

The Finances account detail modal exposes this as **Refresh from institution**.
SnapTrade schedules the syncs and returns before they finish, so new balances
appear on the next snapshot rebuild, not immediately. The endpoint is metered:
a per-connection cooldown guards repeat clicks, and SnapTrade's own 425/429
responses are surfaced as "refreshed recently".

If refreshing does not advance `last_successful_sync`, the connection itself
needs to be removed and re-linked.

## 📞 **Getting Help**

If the issue persists:

1. **Check SnapTrade Documentation**: [SnapTrade API Docs](https://docs.snaptrade.com/)
2. **Contact SnapTrade Support**: For credential or API issues
3. **Check Render Logs**: For detailed error messages
4. **Run Diagnostic Script**: `node scripts/diagnose-snaptrade.js`

## 🔄 **Prevention**

To prevent this issue in the future:

1. **Always test credentials** before deploying to production
2. **Use environment-specific credentials** (sandbox vs production)
3. **Monitor application logs** for SnapTrade-related errors
4. **Set up health checks** to detect configuration issues early
5. **Document credential requirements** for team members

---

**Note**: This troubleshooting guide assumes you have access to the SnapTrade dashboard and can generate API credentials. If you don't have SnapTrade credentials, you'll need to sign up for a SnapTrade account first.
