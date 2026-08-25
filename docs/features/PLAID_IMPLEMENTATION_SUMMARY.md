# Plaid Implementation Summary

## Quick Reference

### What We Implemented ✅
- **Seamless user experience** - no upfront product selection
- **Maximum institution coverage** - starts with `["transactions"]` only
- **Future-proof consent** - collects consent for all products upfront
- **Product data on the ingestion path** - holdings, transactions and liabilities are fetched by snapshot ingestion, not at link time
- **Simple UI** - just a "Connect More Accounts" button and account list

### Key Files Changed
- `src/plaid.ts` - Backend implementation with seamless approach
- `frontend/src/components/PlaidLinkButton.tsx` - Simple connect button (already existed)
- `frontend/src/app/profile/page.tsx` - Updated to use simple PlaidLinkButton
- `frontend/src/components/SeamlessPlaidLink.tsx` - Created but not used (kept for reference)

### Core Implementation
```typescript
// Link token creation
products: [Products.Transactions], // Minimal for max coverage
additional_consented_products: [
  Products.Investments,  // Future access
  Products.Liabilities,  // Future access  
  Products.Auth,         // Future access
],

// After linking, exchange_public_token reads accounts, reconciles them against
// existing rows, and schedules a snapshot revision. It no longer probes product
// endpoints: those calls discarded every response, so they cost a Plaid request
// and stored nothing.
//
// The scheduled revision is what loads product data, through the only path that
// persists what it reads:
//   FinancialDataService.getUserFinancialData({
//     includeInvestments: true,   // -> /investments/holdings/get, /investments/transactions/get
//     includeLiabilities: true,   // -> /liabilities/get
//     includeTransactions: true,  // -> /transactions/sync
//   })
```

### Frontend Implementation
- **Simple approach**: Just a "Connect More Accounts" button
- **No verbose explanations**: Users see the button and account list
- **Clean UI**: Minimal text, maximum functionality
- **Account display**: Shows connected accounts with balances

### New Endpoints
- `POST /plaid/sync` - Comprehensive data sync based on account types
- Enhanced `/plaid/create_link_token` - Seamless approach
- Enhanced `/plaid/exchange_public_token` - Account reconciliation, then schedules a revision (product data via ingestion)

### Testing
1. Navigate to `/profile`
2. Click "Connect More Accounts" button
3. Verify Plaid Link opens with minimal selection
4. Connect test institution
5. Verify accounts appear and the revision scheduled by the link loads product data

### Documentation
- **This summary**: `docs/features/PLAID_IMPLEMENTATION_SUMMARY.md`
- **Environment modes**: `docs/guides/PLAID_MODE_README.md`

---

## Disconnecting a connection

### Revoking the Item is not optional

Deleting the local `AccessToken` row only makes *us* forget a connection. The
Plaid Item stays live: the consent stands, Plaid keeps refreshing it, and it
keeps counting against billing. Every path that removes a connection therefore
calls `itemRemove` **before** deleting the row — the access token is the only
thing that can revoke the Item, so dropping it first strands the Item at Plaid
permanently with nothing left to address it.

The paths that revoke:

| Path | Scope |
|---|---|
| `DELETE /plaid/connections/:accessTokenId` | One institution |
| `DELETE /plaid/disconnect_accounts` | Every Plaid connection |
| `POST /privacy/disconnect-accounts` | Every connection, both providers |
| `DELETE /privacy/delete-all-data` | Everything |
| `DELETE /admin/delete-user-account/:userId` | Everything, admin-initiated |

A token whose Item Plaid would *not* revoke is deliberately kept on the
**disconnect** paths (`DELETE /plaid/connections/:id`, `DELETE /plaid/disconnect_accounts`,
and `POST /privacy/disconnect-accounts`), so the revocation can be retried rather
than the connection being stranded. Account-deletion sweeps
(`DELETE /privacy/delete-all-data`, `DELETE /admin/delete-user-account/:userId`)
still drop every token after attempting revoke — blocking deletion on one bank
error is worse; any survivor is loud in the log.

Only `ITEM_NOT_FOUND` counts as revoked. `INVALID_ACCESS_TOKEN` deliberately
does **not**: the codebase pairs the two elsewhere, but that pairing answers
"must the user re-link", while the question here is "is the Item gone". A
rejected credential — malformed, corrupted, or from another environment — says
nothing about that, and counting it as revoked would delete the only credential
that could ever revoke the Item. It is reported as *unconfirmed*, kept rather
than deleted, and logged loudly, since no retry resolves it and the Item may
still be live.

Deletions on the disconnect paths are written as positive `accessTokenId` filters
rather than one negated `NOT { in }`, because Prisma's negated filters do not
match NULL columns — manual and SnapTrade accounts carry no `accessTokenId`, so a
negation would silently spare them whenever an unrelated bank failed to revoke.

Every disconnect path also deletes the accounts and transactions belonging to
the connections it revoked, and queues a snapshot rebuild. `Account.accessTokenId`
is `onDelete: SetNull`, so deleting a token alone would leave its accounts behind
with a null connection — and a null `accessTokenId` is how manual and SnapTrade
accounts are identified, so orphaned bank accounts would quietly start passing
for hand-entered ones. Without the rebuild, Ask Linc keeps answering from a
snapshot that still contains the disconnected banks.

### Per-institution disconnect

`GET /plaid/connections` lists one row per Item (a database-only read —
`/profile/tokens` answers a similar question but revalidates every token against
Plaid, which is far too heavy for a picker). **Accounts & context → Connected
institutions** exposes the removal.

Removing one institution revokes its Item, then deletes only that connection's
accounts, transactions, and category overrides, then queues a snapshot rebuild
so it leaves the user's totals and the model's view. Within the cleanup
transaction, transactions are cleared before the accounts they reference:
`Transaction.account` has no `onDelete: Cascade`.

### Known gap: superseded connections

When a re-link fully covers an older connection to the same institution,
`supersedeDuplicateInstitutionConnections` marks the old token superseded and
deletes its accounts — but does **not** revoke its Item. Those Items stay live
and billable at Plaid until the user disconnects everything or deletes their
account, both of which sweep superseded tokens too. Revoking at supersede time
would be irreversible on an automatic path, so it is a deliberate open question
rather than an oversight.

---

*This implementation follows Plaid best practices for maximum institution coverage and cost efficiency, with a clean, simple user interface.*
