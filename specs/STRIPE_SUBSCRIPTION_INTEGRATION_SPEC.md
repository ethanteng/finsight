# 🔄 Stripe Subscription Integration Specification

## Overview

This document specifies the complete subscription lifecycle behavior for the Finsight platform, including upgrades, downgrades, cancellations, and post-expiration handling.

## 📋 Subscription Lifecycle States

### 1. **Active Subscription**
- **Status**: `subscriptionStatus: 'active'`
- **Access**: Full access based on tier (starter/standard/premium)
- **Billing**: Active monthly billing
- **Database State**: 
  - `User.subscriptionStatus: 'active'`
  - `Subscription.status: 'active'`
  - `Subscription.cancelAtPeriodEnd: false`

### 2. **Cancelled but Active Period**
- **Status**: `subscriptionStatus: 'active'` (still active until period end)
- **Access**: Full access based on tier until period expires
- **Billing**: No further billing, but current period remains active
- **Database State**:
  - `User.subscriptionStatus: 'active'`
  - `Subscription.status: 'active'`
  - `Subscription.cancelAtPeriodEnd: true`

### 3. **Expired Subscription**
- **Status**: `subscriptionStatus: 'canceled'`
- **Access**: **Cannot log in** - blocked at authentication level
- **Billing**: No billing
- **Database State**:
  - `User.subscriptionStatus: 'canceled'`
  - `User.tier: [original tier]` (preserved)
  - `Subscription.status: 'canceled'`

## 🔄 Subscription Lifecycle Events

### **Upgrade (Tier Change)**
**Trigger**: User upgrades from one tier to another
**Webhook**: `customer.subscription.updated`
**Behavior**:
1. ✅ **Update subscription record** with new tier
2. ✅ **Update user tier** to new tier
3. ✅ **Send tier change email** (e.g., "starter → standard")
4. ✅ **Maintain active status** (`subscriptionStatus: 'active'`)
5. ✅ **Full access** to new tier features immediately

**Email Sent**: `sendTierChangeEmail(newTier, oldTier)`
**Database Changes**:
- `User.tier: newTier`
- `Subscription.tier: newTier`
- `User.subscriptionStatus: 'active'`

### **Downgrade (Tier Change)**
**Trigger**: User downgrades from one tier to another
**Webhook**: `customer.subscription.updated`
**Behavior**:
1. ✅ **Update subscription record** with new tier
2. ✅ **Update user tier** to new tier
3. ✅ **Send tier change email** (e.g., "premium → standard")
4. ✅ **Maintain active status** (`subscriptionStatus: 'active'`)
5. ✅ **Immediate access change** to new tier features

**Email Sent**: `sendTierChangeEmail(newTier, oldTier)`
**Database Changes**:
- `User.tier: newTier`
- `Subscription.tier: newTier`
- `User.subscriptionStatus: 'active'`

### **Cancellation (User-Initiated)**
**Trigger**: User cancels subscription in Stripe dashboard
**Webhook**: `customer.subscription.updated` with `cancel_at_period_end: true`
**Behavior**:
1. ✅ **Detect cancellation** (`wasJustCancelled = true`)
2. ✅ **Update subscription record** (`cancelAtPeriodEnd: true`)
3. ✅ **Keep user subscription status** (`subscriptionStatus: 'active'`)
4. ✅ **Send cancellation email** (`sendCancellationEmail`)
5. ✅ **Skip tier change email** (prevent duplicates)
6. ✅ **User retains full access** until period expires

**Email Sent**: `sendCancellationEmail(email, tier)`
**Database Changes**:
- `Subscription.cancelAtPeriodEnd: true`
- `User.subscriptionStatus: 'active'` (unchanged)
- `User.tier: [current tier]` (unchanged)

### **Period Expiration**
**Trigger**: Cancelled subscription period ends
**Webhook**: `customer.subscription.deleted`
**Behavior**:
1. ✅ **Update subscription status** (`status: 'canceled'`)
2. ✅ **Update user subscription status** (`subscriptionStatus: 'canceled'`)
3. ✅ **Preserve user tier** (keep what they paid for)
4. ✅ **Send final cancellation email** (`sendCancellationEmail`)
5. ✅ **Block user login** at authentication level

**Email Sent**: `sendCancellationEmail(email, tier)`
**Database Changes**:
- `Subscription.status: 'canceled'`
- `User.subscriptionStatus: 'canceled'`
- `User.tier: [original tier]` (preserved)

## 🔐 Authentication & Access Control

### **Login Access by Subscription Status**

| Subscription Status | Can Log In | Access Level | Notes |
|-------------------|------------|--------------|-------|
| `'active'` | ✅ Yes | Full tier access | Normal operation |
| `'canceled'` | ❌ No | None | Blocked with clear message |
| `'past_due'` | ❌ No | None | Same as canceled |
| `'inactive'` | ✅ Yes | Starter tier only | Admin-created users |

### **Authentication Middleware Behavior**

```typescript
// Check if subscription has expired (same treatment as failed payments)
if (user.subscriptionStatus === 'canceled') {
  console.log('🔐 User subscription expired - blocking access');
  res.status(401).json({ error: 'Subscription expired. Please renew to continue.' });
  return;
}
```

**Error Message**: "Subscription expired. Please renew to continue."

## 📧 Email Notifications

### **Tier Change Emails**
- **Trigger**: Any tier change (upgrade/downgrade)
- **Function**: `sendTierChangeEmail(newTier, oldTier)`
- **Content**: "Your subscription has been updated from [oldTier] to [newTier]"

### **Cancellation Emails**
- **Trigger**: User cancels subscription
- **Function**: `sendCancellationEmail(email, tier)`
- **Content**: "Your [tier] subscription has been cancelled and will end on [period end date]"

### **Final Expiration Emails**
- **Trigger**: Cancelled subscription period ends
- **Function**: `sendCancellationEmail(email, tier)`
- **Content**: "Your [tier] subscription has ended. Thank you for using our service."

## 🗄️ Database Schema Requirements

### **User Table**
```prisma
model User {
  id                 String @id @default(cuid())
  email              String @unique
  tier               String @default("starter")
  subscriptionStatus String @default("inactive")
  // ... other fields
}
```

### **Subscription Table**
```prisma
model Subscription {
  id                  String   @id @default(cuid())
  stripeSubscriptionId String  @unique
  tier                String
  status              String
  cancelAtPeriodEnd   Boolean  @default(false)
  // ... other fields
}
```

## 🔄 Webhook Event Handling

### **Event Priority & Order**
1. **Check cancellation first** (`cancel_at_period_end`)
2. **Handle tier changes** (if no cancellation)
3. **Update database** based on event type
4. **Send appropriate emails**
5. **Log all actions** for debugging

### **Webhook Event Mapping**

| Stripe Event | Handler Method | Primary Action |
|--------------|----------------|----------------|
| `customer.subscription.updated` | `handleSubscriptionUpdated` | Tier sync, cancellation detection |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | Mark as canceled, block access |
| `invoice.payment_succeeded` | `handlePaymentSucceeded` | Tier auto-sync |
| `invoice.payment_failed` | `handlePaymentFailed` | Mark as past_due |

## 🧪 Testing Scenarios

### **Upgrade Flow**
1. User upgrades from starter to standard
2. Verify tier change email sent
3. Verify database updated correctly
4. Verify immediate access to new features

### **Downgrade Flow**
1. User downgrades from premium to standard
2. Verify tier change email sent
3. Verify database updated correctly
4. Verify access restricted to new tier

### **Cancellation Flow**
1. User cancels subscription
2. Verify cancellation email sent
3. Verify `cancelAtPeriodEnd: true` set
4. Verify user retains access until period end
5. Verify no duplicate emails sent

### **Expiration Flow**
1. Cancelled subscription period ends
2. Verify final cancellation email sent
3. Verify `subscriptionStatus: 'canceled'` set
4. Verify user cannot log in
5. Verify clear error message shown

## 🚨 Error Handling

### **Webhook Failures**
- **Email failures** should not fail webhook processing
- **Database failures** should be logged and retried
- **Invalid webhook data** should be logged and ignored

### **Authentication Failures**
- **Expired subscriptions** return 401 with clear message
- **Invalid tokens** return 401 with generic message
- **Database errors** return 500 with generic message

## 📝 Implementation Notes

### **Key Principles**
1. **User experience first** - clear messaging and predictable behavior
2. **Data consistency** - database always reflects Stripe state
3. **No duplicate emails** - prevent spam during webhook storms
4. **Graceful degradation** - system continues working even if emails fail

### **Performance Considerations**
- **Webhook processing** should be fast (< 1 second)
- **Database updates** should be atomic
- **Email sending** should be asynchronous when possible

### **Security Considerations**
- **Webhook signature verification** in production
- **Rate limiting** on authentication endpoints
- **Audit logging** for all subscription changes

## 🔮 Future Enhancements

### **Potential Improvements**
1. **Subscription reactivation** without new checkout
2. **Prorated billing** for mid-period changes
3. **Subscription pausing** for temporary holds
4. **Advanced email templates** with branding
5. **Webhook retry logic** for failed processing

### **Monitoring & Analytics**
1. **Subscription conversion rates** by tier
2. **Churn analysis** for cancelled subscriptions
3. **Webhook processing metrics**
4. **Email delivery success rates**
