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

### **6. Failed Payment Handling**

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

### **Phase 1: Foundation (Week 1-2)**
- Database schema updates
- Basic Stripe integration setup
- Webhook endpoint creation

### **Phase 2: Core Features (Week 3-4)**
- Stripe Checkout integration
- Webhook event processing
- Basic tier enforcement

### **Phase 3: User Experience (Week 5-6)**
- Customer Portal integration
- Failed payment handling
- User interface updates

### **Phase 4: Testing & Polish (Week 7-8)**
- Comprehensive testing
- Security validation
- Performance optimization

## **Success Metrics**

### **Technical Metrics**
- **Webhook Success Rate**: >99.9% successful webhook processing
- **Response Time**: <200ms webhook processing time
- **Error Rate**: <0.1% webhook processing errors

### **Business Metrics**
- **Subscription Conversion**: Track pricing page to subscription conversion
- **Plan Changes**: Monitor upgrade/downgrade frequency
- **Churn Rate**: Track subscription cancellation rates
- **Payment Success**: Monitor failed payment rates and recovery

### **User Experience Metrics**
- **Subscription Management**: Time to complete plan changes
- **Support Tickets**: Reduction in billing-related support requests
- **User Satisfaction**: Feedback on subscription management experience

## **Future Enhancements**

### **Advanced Features**
- **Trial Periods**: Free trial for new users
- **Promotional Pricing**: Discount codes and promotional offers
- **Usage-Based Billing**: Tier upgrades based on usage patterns
- **Family Plans**: Multi-user subscription management

### **Analytics & Insights**
- **Subscription Analytics**: Detailed subscription lifecycle analysis
- **Revenue Tracking**: Comprehensive revenue and churn analysis
- **User Behavior**: Subscription patterns and upgrade triggers

### **Integration Expansions**
- **Accounting Integration**: QuickBooks, Xero integration
- **CRM Integration**: Customer relationship management
- **Marketing Automation**: Email campaigns based on subscription events

---

**This specification provides a comprehensive roadmap for implementing Stripe subscriptions with the Ask Linc tier system, ensuring reliable subscription management, automatic access control, and excellent user experience.**
