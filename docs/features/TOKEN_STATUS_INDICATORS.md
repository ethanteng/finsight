# Token Status Indicators

## Overview

This feature displays real-time connection status for linked Plaid and SnapTrade accounts in the `/profile` page, helping users quickly identify which connections are active or need attention.

## Features

### 1. Plaid Token Status

**Display:**
- Green checkmark (✓) for active/valid connections
- Red X (✗) for invalid/expired connections
- Tooltip showing connection status on hover

**Information Shown:**
- Connection health (active or invalid)
- Error messages for common issues (e.g., "Re-authentication required" for `ITEM_LOGIN_REQUIRED`)
- Last checked timestamp

**API Endpoint:**
- `GET /profile/tokens` - Returns token status for all Plaid connections
  - Authentication: Required (JWT token)
  - Response includes: `id`, `createdAt`, `lastChecked`, `isActive`, `lastError`, `institutionName`, `itemId`

### 2. SnapTrade Connection Status

**Display:**
- Green checkmark (✓) for connected accounts
- Account name, institution name, and account number
- Automatically populated from SnapTrade holdings data

**Information Shown:**
- Account name
- Institution name
- Account number (if available)
- Connection status (always active if account is returned in holdings)

### 3. Closed Account Indicator

**Display:**
- A `Closed` badge next to the account name
- Dimmed row, sorted below the accounts that still count
- Sub-line: "Closed — not included in your Finances totals" with the date the account was last reported
- The balance is labelled "Last known balance"
- The connection ✓/✗ indicator is hidden, since it says nothing about a closed account

**Why it exists:**
Plaid stops returning an account once it is closed at the institution. The Finances page is built from the canonical snapshot, which is always produced from a live provider fetch, so closed accounts drop off it on their own. The profile list is allowed to serve persisted Plaid rows (`loadPersistedPlaidData`), and those rows outlive the account — without this indicator a closed account looks identical to an active one.

**How it is detected** (`src/services/account-closure-service.ts`):
An account is reported closed only when every one of these holds:

1. A snapshot exists, and it does not contain the account under any of its provider ids.
2. That snapshot was built without a Plaid provider error (`plaid:error:*` / `financial-data:partial` observations) — otherwise an unreachable connection is indistinguishable from closure.
3. The account has a persisted `Account` row (manual accounts have none) whose `createdAt` predates the snapshot, so the snapshot had a chance to include it.
4. No provider refreshed that row after the snapshot was computed. `balanceLastFetched` / `lastSynced` move without a snapshot rebuild (the balance refresh endpoint does exactly that), and a sighting that recent outranks the snapshot's silence. `updatedAt` is deliberately *not* consulted — it also moves for local edits such as a rename.
5. The row's connection is still active. A snapshot rebuild only queries `AccessToken` rows with `isActive: true`, so an account behind an expired connection is missing from the snapshot **without** any error observation — flagging it would tell a user their accounts were closed when the connection merely needs re-authentication. Legacy rows stored without an `accessTokenId` are placed by institution name; a row with neither is never flagged.

`GET /plaid/all-accounts` returns `isClosed` and `lastSeenAt` per account. Detection failures are logged and fall back to treating every account as open.

### 4. Token Validation in AI Context

**Backend Integration:**
The `openai.ts` module now validates Plaid tokens before fetching account data:

```typescript
// Validate token before fetching
const isValid = await validatePlaidToken(tokenRecord.token);

if (!isValid) {
  console.log(`Skipping invalid token for ${tokenRecord.institutionName}`);
  
  // Update token status in database
  await prisma.accessToken.update({
    where: { id: tokenRecord.id },
    data: {
      isActive: false,
      lastError: 'Token validation failed',
      lastChecked: new Date()
    }
  });
  
  continue; // Skip this token
}
```

**Benefits:**
- Prevents errors from invalid tokens during AI analysis
- Improves AI response reliability
- Reduces unnecessary API calls to Plaid
- Updates database with token health status

## User Experience

### Profile Page View

**Plaid Accounts Section:**
```
Your Connected Accounts (Plaid)
┌─────────────────────────────────────────┐
│ Account Name ✓                          │
│ Bank Name • checking • savings          │
│ Balance: $1,234.56                      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Investment Account ✗                    │
│ Broker Name • investment • brokerage    │
│ Re-authentication required              │
│ Balance: $45,678.90                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Old Savings  [Closed]                   │
│ Bank Name • depository • savings        │
│ Closed — not included in your Finances  │
│ totals • Last reported 3/4/2026         │
│ $0.09  (Last known balance)             │
└─────────────────────────────────────────┘
```

**SnapTrade Accounts Section:**
```
Your Connected Accounts (SnapTrade)

Connected Investment Accounts
┌─────────────────────────────────────────┐
│ Brokerage Account ✓                     │
│ TD Ameritrade • Account #12345          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Retirement Account ✓                    │
│ Fidelity • Account #67890               │
└─────────────────────────────────────────┘
```

## Database Schema

The `AccessToken` model was updated to include status fields:

```prisma
model AccessToken {
  id              String    @id @default(cuid())
  userId          String
  token           String
  itemId          String?
  createdAt       DateTime  @default(now())
  lastChecked     DateTime?
  isActive        Boolean   @default(true)
  lastError       String?
  institutionName String?
  
  user            User      @relation(fields: [userId], references: [id])
}
```

**Fields:**
- `isActive` - Boolean indicating if the token is currently valid
- `lastError` - Last error message from token validation (e.g., "ITEM_LOGIN_REQUIRED")
- `lastChecked` - Timestamp of last token validation check
- `institutionName` - Name of the financial institution

## API Endpoints

### GET /profile/tokens

Returns status information for all Plaid access tokens belonging to the authenticated user.

**Authentication:** Required (JWT Bearer token)

**Response:**
```json
{
  "tokens": [
    {
      "id": "token_id_1",
      "createdAt": "2025-10-20T12:00:00Z",
      "lastChecked": "2025-10-20T14:30:00Z",
      "isActive": true,
      "lastError": null,
      "institutionName": "Chase Bank",
      "itemId": "item_xyz"
    },
    {
      "id": "token_id_2",
      "createdAt": "2025-10-19T10:00:00Z",
      "lastChecked": "2025-10-20T14:30:00Z",
      "isActive": false,
      "lastError": "ITEM_LOGIN_REQUIRED",
      "institutionName": "Bank of America",
      "itemId": "item_abc"
    }
  ]
}
```

**Common Error Messages:**
- `ITEM_LOGIN_REQUIRED` - User needs to re-authenticate with their bank
- `Token validation failed` - Token is no longer valid
- `Invalid access token` - Token format or structure is invalid

## Implementation Details

### Frontend (React/Next.js)

**File:** `frontend/src/app/profile/page.tsx`

**Key Components:**
1. `TokenStatus` interface for type safety
2. `loadTokenStatuses()` function to fetch token data
3. Token status matching logic in account rendering
4. Visual indicators with tooltips and error messages

**State Management:**
```typescript
const [tokenStatuses, setTokenStatuses] = useState<TokenStatus[]>([]);
```

**Token Matching:**
```typescript
// Find token status for this account's institution
const tokenStatus = tokenStatuses.find(t => 
  t.institutionName === account.institution
);
```

### Backend (Node.js/Express)

**File:** `src/index.ts`

**Endpoint Implementation:**
```typescript
app.get('/profile/tokens', requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    
    const tokens = await prisma.accessToken.findMany({
      where: { userId },
      select: {
        id: true,
        createdAt: true,
        lastChecked: true,
        isActive: true,
        lastError: true,
        institutionName: true,
        itemId: true
      }
    });
    
    res.json({ tokens });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch token statuses' });
  }
});
```

**Token Validation Function:**
```typescript
async function validatePlaidToken(accessToken: string): Promise<boolean> {
  try {
    await plaidClient.itemGet({ access_token: accessToken });
    return true;
  } catch (error) {
    console.log('Token validation failed:', error);
    return false;
  }
}
```

## Security Considerations

1. **Authentication Required:** Token status endpoint requires valid JWT authentication
2. **User Isolation:** Users can only see status for their own tokens
3. **No Token Exposure:** Actual access tokens are never sent to frontend
4. **Read-Only:** Frontend only displays status, cannot modify tokens

## Testing

### Manual Testing

1. **Valid Token:**
   - Link a Plaid account
   - Navigate to `/profile`
   - Verify green checkmark appears next to account

2. **Invalid Token:**
   - Manually invalidate a token in the database
   - Navigate to `/profile`
   - Verify red X appears with error message

3. **Multiple Accounts:**
   - Link multiple Plaid accounts
   - Verify each has independent status indicator

### Testing Token Validation

1. Ask a question in the app to trigger AI analysis
2. Check backend logs for token validation messages
3. Verify invalid tokens are skipped
4. Confirm database is updated with token status

## Future Enhancements

1. **Auto-Refresh:** Automatically refresh token status when user returns to profile page
2. **Re-authentication Flow:** Direct link from error message to re-authenticate
3. **Historical Status:** Show when token last became invalid
4. **Push Notifications:** Alert users when tokens need re-authentication
5. **Batch Token Validation:** Validate all tokens on a schedule
6. **SnapTrade Token Validation:** Implement similar validation for SnapTrade connections

## Related Documentation

- `docs/features/TRANSACTION_PERSISTENCE_AND_AI_CONTEXT.md` - Transaction persistence and AI context
- `docs/DEVELOPMENT_WORKFLOW.md` - Development workflow
- `prisma/schema.prisma` - Database schema

## Changelog

### 2026-08-15
- ✅ Added closed-account detection (`src/services/account-closure-service.ts`)
- ✅ `GET /plaid/all-accounts` now returns `isClosed` and `lastSeenAt` per account
- ✅ Profile account list badges, dims, and sorts closed accounts

### 2025-10-20
- ✅ Added `isActive`, `lastError`, `lastChecked`, `institutionName` fields to `AccessToken` model
- ✅ Created `/profile/tokens` API endpoint
- ✅ Integrated token validation in `openai.ts`
- ✅ Added visual status indicators to Plaid accounts in `/profile`
- ✅ Added connection status display for SnapTrade accounts
- ✅ Documented feature implementation

