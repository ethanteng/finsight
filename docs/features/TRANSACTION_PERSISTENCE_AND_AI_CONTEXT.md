# Transaction Persistence & AI Context Debugging

## Overview

This feature enables automatic persistence of Plaid transactions and SnapTrade activities to the database, stores both original and AI-generated categories for comparison, and provides UI and logging capabilities to view the full GPT context for debugging AI responses.

## Features

### 1. Transaction & Activity Persistence

**Environment Variable:** `PERSIST_TRANSACTIONS=true`

When enabled, all Plaid transactions and SnapTrade activities are automatically persisted to the database when fetched for AI analysis.

**Benefits:**
- Transactions are stored with original Plaid categories and enriched data
- SnapTrade activities are stored with original activity types
- AI-generated categories can be compared against originals
- Historical data is preserved for analysis
- Deduplication ensures no duplicate records

**Implementation:**
- `src/data/persistence.ts` - Persistence logic for transactions and activities
- `src/openai.ts` - Hooks to trigger persistence after fetching data
- Database schema includes `enriched_data` field to store enhanced transaction data

### 2. AI Category Comparison

New database fields added to store AI-generated categories:

**Transaction Model:**
- `aiCategory` - AI-generated category
- `aiCategoryReason` - AI's reasoning for the categorization
- `categoryComparedAt` - Timestamp when AI categorization was performed

**SnapTradeActivity Model:**
- `aiCategory` - AI-generated category
- `aiCategoryReason` - AI's reasoning for the categorization
- `categoryComparedAt` - Timestamp when AI categorization was performed

**API Endpoints:**
- `POST /api/ai/categorize-transactions` - Generate AI categories for selected transactions
- `GET /api/ai/transactions/comparison` - Get transactions with category comparison data
  - Filters: `all`, `matched`, `mismatched`, `uncategorized`
  - Limit: Configurable (default 100)

### 3. GPT Context Logging

**Environment Variable:** `PERSIST_GPT_CONTEXT=true`

When enabled, the full GPT context (system prompt, user data, market context, etc.) is logged to persistent storage for debugging.

**Log Location:**
- Production (Render): `/opt/render/project/src/logs`
- Development: `./logs` (in project root)

**Log Format:**
```json
{
  "userId": "user_id",
  "timestamp": "2025-10-20T02:04:10.000Z",
  "question": "user's question",
  "systemPrompt": "full system prompt sent to GPT",
  "conversationHistory": [
    {
      "question": "previous question",
      "answer": "previous answer (truncated)",
      "createdAt": "timestamp"
    }
  ],
  "context": {
    "accountSummary": "account data summary",
    "transactionSummary": "transaction data summary (truncated)",
    "investmentSummary": "investment data summary (truncated)",
    "marketContextSummary": "market context (truncated)",
    "searchContext": "search results (truncated)"
  },
  "metadata": {
    "systemPromptLength": 12345,
    "conversationHistoryLength": 5,
    "accountSummaryLength": 500,
    "transactionSummaryLength": 10000,
    "investmentSummaryLength": 2000,
    "marketContextSummaryLength": 1500,
    "searchContextLength": 3000
  }
}
```

**Log Rotation:**
- Automatically keeps last 100 logs per user
- Old logs are deleted to prevent disk space issues

**API Endpoints:**
- `GET /api/ai/context/latest` - Get the latest GPT context for current user
- `GET /api/ai/context/:contextId` - Get a specific context by ID (timestamp)

### 4. Frontend UI Components

#### View AI Context Modal

**Location:** `frontend/src/components/debug/ViewAIContext.tsx`

**Features:**
- Modal interface to view full GPT context
- Sectioned view with navigation:
  - System Prompt
  - Question
  - Account Summary
  - Transaction Summary
  - Investment Summary
  - Market Context
  - Search Context
  - Conversation History
  - Metadata
- Copy to clipboard functionality
- Shows character counts for each section
- Timestamp display

**Access:**
- Visible only when `NEXT_PUBLIC_PERSIST_GPT_CONTEXT=true`
- Button appears in the FinanceQA component (main chat interface)
- Only for authenticated users (not demo mode)

#### Transaction Category Comparison

**Location:** `frontend/src/components/transactions/CategoryComparison.tsx`

**Features:**
- Table view of all transactions with category comparison
- Filters: All, Matched, Mismatched, Uncategorized
- Bulk selection and categorization
- Shows:
  - Transaction name and merchant
  - Amount and date
  - Account name
  - Original Plaid category
  - AI-generated category with reasoning
  - Match status indicator
- Real-time categorization with GPT-4o-mini
- Automatic refresh after categorization

**Page:** `frontend/src/app/transactions/page.tsx`
- Full page dedicated to transaction analysis
- Authentication required
- Accessible at `/transactions` route

## Environment Variables

### Backend (.env)

```bash
# Toggle transaction/activity persistence to database
PERSIST_TRANSACTIONS=false

# Toggle GPT context logging to /opt/render/project/src/logs
PERSIST_GPT_CONTEXT=false
```

### Frontend (frontend/.env.local)

```bash
# GPT Context Logging (should match backend setting)
NEXT_PUBLIC_PERSIST_GPT_CONTEXT=false
```

## Database Migration

The following migration was created and applied:

**Migration:** `20251020020410_add_ai_category_fields`

**Changes:**
1. Added to `Transaction` model:
   - `enriched_data` (Json, nullable) - Plaid enriched transaction data
   - `aiCategory` (String, nullable) - AI-generated category
   - `aiCategoryReason` (String, nullable) - AI reasoning
   - `categoryComparedAt` (DateTime, nullable) - Timestamp

2. Created new `SnapTradeActivity` model:
   - `id` (String, primary key)
   - `snapTradeUserId` (String, foreign key)
   - `activityId` (String, unique)
   - Activity fields: `accountId`, `amount`, `currency`, `description`, `fee`, etc.
   - `rawData` (Json) - Full activity data
   - `aiCategory` (String, nullable)
   - `aiCategoryReason` (String, nullable)
   - `categoryComparedAt` (DateTime, nullable)
   - Timestamps: `createdAt`, `updatedAt`

## Usage

### Enable Features

1. Set environment variables:
   ```bash
   PERSIST_TRANSACTIONS=true
   PERSIST_GPT_CONTEXT=true
   ```

2. Frontend environment:
   ```bash
   NEXT_PUBLIC_PERSIST_GPT_CONTEXT=true
   ```

3. Restart backend and frontend servers

### View GPT Context

1. Ask a question in the chat interface
2. Click "View AI Context" button (top right of chat area)
3. Browse different sections of the context
4. Copy any section to clipboard for analysis

### Analyze Transaction Categories

1. Navigate to `/transactions` page
2. View all transactions with their categories
3. Select transactions you want to categorize
4. Click "Categorize Selected"
5. AI will generate categories and reasoning
6. Use filters to find matches/mismatches
7. Compare Plaid vs AI categorizations

### Access Logs (Production)

SSH into Render instance:
```bash
# Logs are in /opt/render/project/src/logs
cd /opt/render/project/src/logs
ls -lh
cat gpt-context-[userId]-[timestamp].json | jq .
```

### Access Logs (Development)

```bash
# Logs are in ./logs directory
cd logs
ls -lh
cat gpt-context-[userId]-[timestamp].json | jq .
```

## Security Considerations

1. **GPT Context Logs:**
   - Contain tokenized data (not real names)
   - Should only be enabled for debugging
   - Automatically rotate to prevent disk space issues
   - Only accessible to authenticated users via API

2. **AI Categorization:**
   - Uses GPT-4o-mini for cost efficiency
   - Processes transactions in batches
   - Includes reasoning for transparency

3. **API Endpoints:**
   - All endpoints require authentication (`requireAuth` middleware)
   - User can only access their own data
   - Proper error handling and validation

## Testing

### Test Transaction Persistence

1. Enable `PERSIST_TRANSACTIONS=true`
2. Connect a Plaid account or SnapTrade account
3. Ask a question that triggers data fetching
4. Check database:
   ```sql
   SELECT COUNT(*) FROM "Transaction";
   SELECT COUNT(*) FROM snaptrade_activities;
   ```

### Test GPT Context Logging

1. Enable `PERSIST_GPT_CONTEXT=true`
2. Ask a question in the chat
3. Check logs directory for new file
4. Verify JSON structure is complete

### Test Category Comparison

1. Ensure transactions are persisted
2. Navigate to `/transactions` page
3. Select some transactions
4. Click "Categorize Selected"
5. Verify AI categories appear with reasoning
6. Test filters (Matched, Mismatched, Uncategorized)

## Troubleshooting

### No logs appearing

- Verify `PERSIST_GPT_CONTEXT=true` is set
- Check logs directory exists and has write permissions
- Check backend logs for errors during logging

### Transactions not persisting

- Verify `PERSIST_TRANSACTIONS=true` is set
- Check database connection
- Verify Plaid/SnapTrade data is being fetched
- Check backend logs for persistence errors

### View AI Context button not showing

- Verify `NEXT_PUBLIC_PERSIST_GPT_CONTEXT=true` in frontend
- Ensure you're logged in (not in demo mode)
- Restart frontend server after environment change

### AI categorization failing

- Check OpenAI API key is valid
- Verify sufficient OpenAI credits
- Check backend logs for API errors
- Ensure transactions exist in database

## Future Enhancements

1. **Category Learning:**
   - Train custom categorization model based on user corrections
   - Allow users to override AI categories
   - Learn from historical corrections

2. **Batch Processing:**
   - Categorize all uncategorized transactions at once
   - Background job for automatic categorization
   - Scheduled re-categorization with improved models

3. **Analytics Dashboard:**
   - Spending trends by AI categories
   - Category accuracy metrics
   - Confidence scores for AI categorizations

4. **Export Capabilities:**
   - Export transactions with categories to CSV
   - Download GPT context logs in bulk
   - Integration with accounting software

## Related Documentation

- `docs/DEVELOPMENT_WORKFLOW.md` - Development workflow
- `docs/TESTING.md` - Testing guidelines
- `prisma/schema.prisma` - Database schema
- `src/openai.ts` - AI integration logic

