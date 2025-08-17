# 🚀 Stripe Subscription Integration Specification

## **Overview**

This specification outlines the integration of Stripe subscriptions with the Ask Linc tier system, enabling users to subscribe to monthly plans, manage their subscriptions, and automatically maintain tier-based access control.

## **Business Requirements**

### **Subscription Plans**
- **Starter Tier**: $X/month - Basic financial analysis
- **Standard Tier**: $Y/month - Enhanced with economic context and RAG system
- **Premium Tier**: $Z/month - Complete market insights with Polygon.io integration

### **User Experience Requirements**
- Users can subscribe to plans directly from the app
- Self-service plan changes (upgrade/downgrade) via Stripe Customer Portal
- Prorated billing for plan changes
- Failed payments automatically deactivate user access
- Expired subscriptions prevent login until renewal

### **Technical Requirements**
- Real-time subscription status synchronization via webhooks
- Automatic tier access management based on subscription state
- Secure webhook verification and event handling
- Database integration for subscription tracking
- Customer portal integration for subscription management

## **Architecture Overview**

### **System Components**
1. **Stripe Checkout** - Initial subscription creation
2. **Webhook Endpoints** - Real-time subscription event handling
3. **Customer Portal** - Self-service subscription management
4. **Database Integration** - Subscription state tracking
5. **Tier Enforcement** - Access control based on subscription status

### **Data Flow**
```
User Action → Stripe → Webhook → Backend → Database → Tier Access
```

## **Implementation Details**

### **1. Stripe Checkout Integration**

#### **Frontend Implementation**
- Replace payment links with Stripe Checkout sessions
- Create checkout session on backend before redirect
- Handle successful payment redirects to `/register`

#### **Backend Checkout Session Creation**
```typescript
// POST /api/stripe/create-checkout-session
{
  "priceId": "price_xxx", // Stripe price ID for tier
  "successUrl": "https://yourapp.com/register?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://yourapp.com/pricing"
}
```

#### **Checkout Session Configuration**
- **Mode**: `subscription` (not one-time payment)
- **Billing Cycle**: Monthly
- **Proration**: Enabled for plan changes
- **Metadata**: Include tier information for webhook processing

### **2. Webhook System Implementation**

#### **Webhook Endpoint**
- **URL**: `POST /api/stripe/webhooks`
- **Security**: Stripe signature verification
- **Events**: All subscription lifecycle events

#### **Required Webhook Events**

**Subscription Creation:**
- `customer.subscription.created` - New subscription activated
- `invoice.payment_succeeded` - Payment successful

**Subscription Updates:**
- `customer.subscription.updated` - Plan changes, upgrades/downgrades
- `customer.subscription.trial_will_end` - Trial ending (if applicable)

**Subscription Cancellation:**
- `customer.subscription.deleted` - Subscription expired/cancelled
- `customer.subscription.paused` - Subscription paused

**Payment Issues:**
- `invoice.payment_failed` - Failed payment
- `invoice.payment_action_required` - Payment requires action

#### **Webhook Event Processing**

**Subscription Created:**
```typescript
// customer.subscription.created
{
  action: 'activate_subscription',
  customerId: 'cus_xxx',
  subscriptionId: 'sub_xxx',
  tier: 'premium', // from metadata
  status: 'active',
  currentPeriodEnd: '2025-02-01T00:00:00Z'
}
```

**Subscription Updated:**
```typescript
// customer.subscription.updated
{
  action: 'update_subscription',
  customerId: 'cus_xxx',
  subscriptionId: 'sub_xxx',
  newTier: 'standard', // from metadata
  status: 'active',
  prorationAmount: 500 // in cents
}
```

**Payment Failed:**
```typescript
// invoice.payment_failed
{
  action: 'deactivate_user',
  customerId: 'cus_xxx',
  subscriptionId: 'sub_xxx',
  reason: 'payment_failed',
  gracePeriod: 7 // days before access revoked
}
```

**Subscription Deleted:**
```typescript
// customer.subscription.deleted
{
  action: 'revoke_access',
  customerId: 'cus_xxx',
  subscriptionId: 'sub_xxx',
  reason: 'subscription_ended',
  immediate: true
}
```

### **3. Database Schema Updates**

#### **New Tables**

**Subscriptions Table:**
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripeCustomerId TEXT NOT NULL,
  stripeSubscriptionId TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK (tier IN ('starter', 'standard', 'premium')),
  status TEXT NOT NULL,
  currentPeriodStart TIMESTAMP NOT NULL,
  currentPeriodEnd TIMESTAMP NOT NULL,
  cancelAtPeriodEnd BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

**Subscription Events Table:**
```sql
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriptionId UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  stripeEventId TEXT NOT NULL UNIQUE,
  eventType TEXT NOT NULL,
  eventData JSONB NOT NULL,
  processedAt TIMESTAMP DEFAULT NOW()
);
```

#### **User Table Updates**
```sql
-- Add subscription-related fields to existing users table
ALTER TABLE users ADD COLUMN stripeCustomerId TEXT;
ALTER TABLE users ADD COLUMN subscriptionStatus TEXT DEFAULT 'inactive';
ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'starter';
ALTER TABLE users ADD COLUMN subscriptionExpiresAt TIMESTAMP;
```

### **4. Customer Portal Integration**

#### **Portal Session Creation**
- **Endpoint**: `POST /api/stripe/create-portal-session`
- **Purpose**: Generate Stripe Customer Portal URL for logged-in users
- **Return**: Stripe Customer Portal URL

#### **Portal Configuration**
- **Features**: Plan changes, payment method updates, cancellation
- **Return URL**: Back to user's profile or dashboard
- **Proration**: Enabled for immediate plan changes

#### **User Flow**
1. User clicks "Manage Subscription" in profile
2. Backend creates portal session
3. User redirected to Stripe Customer Portal
4. User makes changes (upgrade/downgrade/cancel)
5. Stripe sends webhook with changes
6. Backend updates user tier and access

### **5. Tier Enforcement System**

#### **Access Control Middleware**
- **Purpose**: Verify subscription status before allowing access
- **Location**: Applied to tier-restricted endpoints
- **Logic**: Check subscription status and tier access

#### **Tier Access Rules**
```typescript
const tierAccess = {
  starter: ['basic-analysis', 'account-balances'],
  standard: ['basic-analysis', 'account-balances', 'economic-indicators', 'rag-system'],
  premium: ['basic-analysis', 'account-balances', 'economic-indicators', 'rag-system', 'live-market-data']
};
```

#### **Subscription Status Checks**
- **Active**: Full tier access
- **Past Due**: Limited access with payment reminder
- **Canceled**: No access, redirect to pricing
- **Inactive**: No access, redirect to pricing

### **6. Webhook Auto-Sync System**

#### **Automatic Tier Synchronization**
- **Purpose**: Real-time correction of tier mismatches between Stripe and database
- **Trigger Events**: All subscription lifecycle webhooks
- **Logic**: Price-driven tier detection with metadata validation
- **Coverage**: Handles upgrades, downgrades, and any tier inconsistencies

#### **Auto-Sync Implementation**
```typescript
// Price to tier mapping for accurate detection
const PRICE_TO_TIER: Record<string, string> = {
  'price_1RwVHYB0fNhwjxZIorwBKpVN': 'starter',
  'price_1RwVJqB0fNhwjxZIV4ORHT6H': 'standard', 
  'price_1RwVKKB0fNhwjxZIT7P4laDk': 'premium'
};

// Auto-sync method integrated into webhook handlers
private async autoSyncSubscriptionTier(
  subscriptionId: string, 
  metadataTier: string
): Promise<void>
```

#### **Sync Process Flow**
1. **Webhook Received**: Stripe sends subscription event
2. **Price Detection**: Extract current subscription price from Stripe
3. **Tier Mapping**: Map price to correct tier using PRICE_TO_TIER
4. **Mismatch Detection**: Compare with current metadata tier
5. **Automatic Correction**: Update Stripe metadata, database subscription, and user tier
6. **Real-Time Sync**: Changes reflected immediately in user experience

#### **Supported Webhook Events**
- **`customer.subscription.created`**: New subscription tier validation
- **`customer.subscription.updated`**: Plan change detection and sync
- **`invoice.payment_succeeded`**: Post-payment tier verification
- **`customer.subscription.paused`**: Pause event tier consistency
- **`customer.subscription.trial_will_end`**: Trial end tier validation

### **7. Failed Payment Handling**

#### **Grace Period System**
- **Default Grace Period**: 7 days after failed payment
- **User Experience**: Warning messages, payment method updates
- **Access Control**: Gradual restriction of features

#### **Dunning Management**
- **Stripe Handles**: Payment retry attempts
- **Backend Handles**: Access control based on retry results
- **User Communication**: Clear status updates and next steps

#### **Deactivation Process**
1. **Day 1-3**: Warning messages, payment method updates
2. **Day 4-6**: Limited access to core features
3. **Day 7+**: Full access revocation, login blocked

## **Security Considerations**

### **Webhook Security**
- **Signature Verification**: Verify all webhook requests using Stripe signatures
- **Event Idempotency**: Prevent duplicate event processing
- **Rate Limiting**: Protect webhook endpoints from abuse

### **Data Protection**
- **PCI Compliance**: No payment data stored in our database
- **Customer ID Mapping**: Secure mapping between Stripe customers and users
- **Access Control**: Subscription data only accessible to authenticated users

### **Error Handling**
- **Webhook Failures**: Retry mechanism for failed webhook processing
- **Database Errors**: Graceful fallback for subscription status
- **Stripe API Failures**: Fallback to last known subscription state

## **Testing Strategy**

### **Webhook Testing**
- **Stripe CLI**: Local webhook testing during development
- **Test Events**: Comprehensive testing of all webhook event types
- **Error Scenarios**: Test webhook failures and retry mechanisms

### **Integration Testing**
- **Subscription Flow**: End-to-end subscription creation and management
- **Plan Changes**: Test upgrade/downgrade scenarios with proration
- **Payment Failures**: Test failed payment handling and deactivation
- **Tier Enforcement**: Verify access control based on subscription status

### **Security Testing**
- **Webhook Verification**: Test signature validation and security
- **Access Control**: Verify subscription-based access restrictions
- **Data Isolation**: Ensure users can't access other users' subscription data

## **Deployment Considerations**

### **Environment Configuration**
- **Stripe Keys**: Separate keys for development, staging, and production
- **Webhook URLs**: Environment-specific webhook endpoint URLs
- **Database Migrations**: Safe deployment of new subscription tables

### **Monitoring & Alerting**
- **Webhook Failures**: Alert on webhook processing failures
- **Subscription Issues**: Monitor failed payments and subscription problems
- **Performance Metrics**: Track webhook processing times and success rates

### **Rollback Plan**
- **Database Rollback**: Ability to revert subscription schema changes
- **Feature Flags**: Gradual rollout of subscription features
- **Fallback Mode**: Graceful degradation if Stripe integration fails

## **Implementation Timeline**

### **Phase 1: Foundation ✅ COMPLETED**
- ✅ Database schema updates (Subscription & SubscriptionEvent models)
- ✅ Basic Stripe integration setup (types, configuration, service)
- ✅ Webhook endpoint creation (API routes and handlers)
- ✅ Prisma client integration with subscription models
- ✅ Comprehensive unit tests for Stripe service

### **Phase 2: Core Features ✅ COMPLETED**
- ✅ Stripe Checkout integration (create-checkout-session endpoint)
- ✅ Webhook event processing (all subscription lifecycle events)
- ✅ Customer Portal integration (create-portal-session endpoint)
- ✅ Database integration for subscription tracking
- ✅ API endpoints for plans and configuration
- ✅ Integration with main application
- ✅ Live pricing from Stripe API (sandbox and production)

### **Phase 3: User Experience ✅ COMPLETED**
- ✅ Failed payment handling (webhook handlers implemented with grace period system)
- ✅ Tier enforcement middleware (implemented with comprehensive access control)
- ✅ User interface updates (API endpoints for subscription management)
- ✅ Subscription status display (subscription status and feature access endpoints)
- ✅ **Webhook Infrastructure**: COMPLETED - Full webhook processing working
- ✅ **Grace Period System**: COMPLETED - 7-day grace period with gradual access restriction
- ✅ **Access Control Middleware**: COMPLETED - Tier-based access control with subscription status validation
- ✅ **Subscription Management APIs**: COMPLETED - Status checking and feature access validation

### **Phase 4: Testing & Polish 🚧 IN PROGRESS**
- ✅ **Unit Testing**: COMPLETED - Comprehensive tests for all new components
- ✅ **Integration Testing**: COMPLETED - API endpoints tested and working
- ✅ **URL Configuration**: COMPLETED - Complete Stripe URL configuration with smart redirects
- ✅ **Payment Success Flow**: COMPLETED - Post-payment redirect to /register with subscription context
- ✅ **Post-Payment User Experience**: COMPLETED - Complete user flow from payment to app access
- ✅ **Business Intelligence**: COMPLETED - Detection and tracking of "Payment Completed, Account Setup Required" users
- ✅ **Admin Panel Enhancement**: COMPLETED - Status summary dashboard with user categorization
- ✅ **Data Consistency & Recovery**: COMPLETED - Fixed data inconsistencies and restored Stripe user links
- ✅ **Schema Simplification**: COMPLETED - Removed subscriptionExpiresAt column and streamlined logic
- ✅ **Webhook Auto-Sync System**: COMPLETED - Real-time tier synchronization for upgrades/downgrades
- 🔄 **Security Validation**: IN PROGRESS - Middleware security testing
- 🔄 **Performance Optimization**: PLANNED - Load testing and optimization
- 📋 **Production Deployment**: PLANNED - Final deployment and monitoring setup

### **Latest Development Milestone: Webhook Auto-Sync System! 🚀**
**✅ Real-Time Tier Synchronization Completed:**
- **Automatic Mismatch Detection**: System now automatically detects when Stripe price doesn't match metadata tier
- **Bidirectional Support**: Handles both upgrades and downgrades automatically via webhooks
- **Price-Driven Logic**: Compares actual Stripe subscription price with stored metadata for accurate tier detection
- **Comprehensive Coverage**: Auto-sync triggers on all major subscription lifecycle events
- **Zero Manual Intervention**: No more manual scripts needed for basic tier synchronization

**✅ Technical Implementation:**
- **Webhook Integration**: `autoSyncSubscriptionTier` method integrated into all major webhook handlers
- **Price Mapping**: `PRICE_TO_TIER` constant maps Stripe price IDs to internal tiers
- **Database Consistency**: Ensures user tier, subscription tier, and Stripe metadata are always synchronized
- **Real-Time Updates**: Changes reflected immediately in both Stripe and local database
- **Fallback Support**: Manual sync scripts still available as backup options

**✅ Previous Milestone - Data Consistency & System Recovery:**
- **Data Inconsistency Identified**: Discovered 10 users with real Stripe subscriptions incorrectly marked as inactive
- **Emergency Recovery**: Successfully restored all Stripe user links and subscription records
- **System Validation**: Verified webhook system is working correctly and creating proper subscriptions
- **Database Cleanup**: Successfully removed `subscriptionExpiresAt` column to simplify subscription logic
- **User Access Restoration**: All 10 ethanteng+test* users now have proper active subscription access

**✅ Technical Improvements:**
- **Schema Simplification**: Removed unnecessary `subscriptionExpiresAt` field, relying solely on Stripe status
- **Subscription Logic Cleanup**: Streamlined access control to trust Stripe's subscription status
- **Database Consistency**: All users now have accurate subscription status and Stripe customer ID links
- **Admin Panel Accuracy**: Status counts now correctly reflect real subscription data

**✅ Previous Milestone - Business Intelligence & User Setup Tracking:**
- **"Payment Completed, Account Setup Required" Detection**: Users who pay via Stripe but never complete account setup
- **Smart User Classification**: Clear distinction between admin-created users and setup-incomplete users
- **Admin Panel Enhancement**: Status summary dashboard with real-time user categorization
- **Business Intelligence**: Track conversion rates from payment to account activation
- **Revenue Recovery**: Identify users who paid but aren't using the service
- **Process Improvement**: Pinpoint where onboarding flow breaks down

**✅ Enhanced Admin Management:**
- **Status Summary Dashboard**: Real-time counts for Active, Admin Created, Setup Required, and Access Revoked
- **Setup Required Warning**: Orange alert box listing all affected users with email addresses
- **Smart Status Badges**: "Setup Required" (orange) for payment-without-setup users
- **Business Metrics**: Clear visibility into user conversion funnel

**✅ Latest Milestone - Webhook Auto-Sync System:**
- **Real-Time Tier Synchronization**: Automatic detection and correction of tier mismatches between Stripe and database
- **Bidirectional Support**: Handles both upgrades and downgrades automatically via webhooks
- **Price-Driven Logic**: Compares Stripe subscription price with metadata tier for accurate synchronization
- **Comprehensive Coverage**: Auto-sync triggers on subscription.created, subscription.updated, payment.succeeded, subscription.paused, and trial_will_end events
- **Database Consistency**: Ensures user tier, subscription tier, and Stripe metadata are always in sync
- **Zero Manual Intervention**: No more manual scripts or cron jobs needed for basic tier synchronization
- **Fallback Support**: Manual sync scripts still available as backup options

**✅ Previous Milestone - Complete Post-Payment User Experience:**
- **Smart Success URLs**: Dynamic success URLs with tier and email context
- **Payment Success Flow**: New `/api/stripe/payment-success` endpoint with intelligent user detection
- **Smart Redirects**: New users → `/register`, existing users → `/profile`
- **Complete URL Configuration**: All Stripe features now have proper return URLs
- **Enhanced User Experience**: Streamlined post-payment flow with email pre-filling and tier assignment
- **Security-First Flow**: All users go through email verification and login, even with subscriptions
- **Consistent Messaging**: Clean, user-friendly subscription context messages throughout the flow

**✅ Post-Payment User Journey:**
1. **Stripe Checkout Success** → Backend `/api/stripe/payment-success` endpoint
2. **User Detection** → New users redirected to `/register`, existing users to `/profile`
3. **Registration Flow** → Email pre-filled, tier assigned, subscription linked
4. **Email Verification** → Required for all users (security best practice)
5. **Login Flow** → User must authenticate to access subscription
6. **App Access** → Redirected to `/app` (main application)

**✅ User Experience Improvements:**
- **Email Pre-filling**: Automatically populated from Stripe checkout
- **Tier Assignment**: Correct subscription tier assigned during registration
- **Subscription Linking**: New users automatically linked to existing Stripe subscriptions
- **Context Preservation**: Subscription context maintained through all redirects
- **Clean Messaging**: Simplified, consistent subscription status messages
- **Security Compliance**: Mandatory email verification and login for all users

### **Next Development Priorities 📋**

**Phase 4: Testing & Polish (Current Focus)**
1. **Security Validation**: Penetration testing of subscription middleware
2. **Performance Testing**: Load testing of subscription endpoints
3. **Production Deployment**: Final deployment with monitoring
4. **User Experience**: Frontend integration and subscription management UI

**Future Enhancements (Post-Phase 4)**
1. **Advanced Features**: Trial periods, promotional pricing, usage-based billing
2. **Analytics**: Subscription analytics and revenue tracking
3. **Integration**: Accounting and CRM system integration
4. **Automation**: Marketing automation based on subscription events

---

**This specification provides a comprehensive roadmap for implementing Stripe subscriptions with the Ask Linc tier system, ensuring reliable subscription management, automatic access control, and excellent user experience.**
