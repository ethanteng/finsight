# 🔄 Stripe Subscription Integration Specification

## Overview

This document specifies the complete subscription lifecycle behavior for the Finsight platform, including upgrades, downgrades, cancellations, post-expiration handling, email notifications, and real-time webhook synchronization.

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

## 🚀 Webhook Auto-Sync System

### **Overview**
The webhook auto-sync system provides **real-time tier synchronization** that automatically detects and corrects subscription tier mismatches between Stripe and the database. This system handles both upgrades and downgrades automatically via webhooks with zero manual intervention required.

### **Key Features**
- **Real-time detection** of tier mismatches between Stripe price and metadata
- **Bidirectional support** for upgrades and downgrades
- **Price-driven logic** that maps Stripe price IDs to internal tiers
- **Zero manual intervention** required for basic tier synchronization

### **Comprehensive Webhook Coverage**
- **`customer.subscription.created`** - New subscription validation
- **`customer.subscription.updated`** - Plan change detection and sync
- **`invoice.payment_succeeded`** - Post-payment tier verification
- **`customer.subscription.paused`** - Pause event tier consistency
- **`customer.subscription.trial_will_end`** - Trial end tier validation

### **Technical Implementation**

#### **Core Auto-Sync Method**
```typescript
private async autoSyncSubscriptionTier(
  subscriptionId: string, 
  metadataTier: string
): Promise<void>
```

#### **Price Mapping System**
```typescript
// Environment-aware price ID mapping
const { getSubscriptionPlans } = await import('../types/stripe');
const plans = getSubscriptionPlans();

// Create reverse mapping from price ID to tier
const PRICE_TO_TIER: Record<string, string> = {};
for (const [tier, plan] of Object.entries(plans)) {
  PRICE_TO_TIER[plan.stripePriceId] = tier;
}
```

**Environment Variables Required:**
```bash
STRIPE_PRICE_STARTER=price_1RwVHYB0fNhwjxZIorwBKpVN
STRIPE_PRICE_STANDARD=price_1RwVJqB0fNhwjxZIV4ORHT6H
STRIPE_PRICE_PREMIUM=price_1RwVKKB0fNhwjxZIT7P4laDk
```

#### **Integration Points**
- **StripeService** - Core webhook handling and auto-sync logic
- **Webhook Routes** - Event processing and auto-sync triggering
- **Database Models** - User and Subscription tier updates
- **Middleware** - Subscription status validation and access control

### **How Auto-Sync Works**

1. **Webhook Event Received**: Stripe sends a subscription event (e.g., plan change)
2. **Auto-Sync Triggered**: The `autoSyncSubscriptionTier` method is called automatically
3. **Price Detection**: System extracts current subscription price from Stripe
4. **Tier Mapping**: Price is mapped to correct tier using `PRICE_TO_TIER`
5. **Mismatch Detection**: Current metadata tier is compared with correct tier
6. **Automatic Correction**: If mismatch detected:
   - Stripe metadata updated
   - Database subscription tier updated
   - User tier updated
   - All changes reflected immediately

### **Fallback Options Available**
While the auto-sync system handles everything automatically, we maintain:

#### **Manual Sync Scripts**
- `enhanced-sync-subscription.js` - Sync individual or all subscriptions
- `run-sync-cron.js` - Periodic sync as cron job backup

#### **CLI Tools**
- Single subscription sync: `node scripts/enhanced-sync-subscription.js sync <subscription_id>`
- User subscription sync: `node scripts/enhanced-sync-subscription.js sync-user <user_id>`
- All subscriptions sync: `node scripts/enhanced-sync-subscription.js sync-all`

## 📧 Email Notification System

### **Overview**
The Stripe Email Notification System automatically sends professional, branded emails to users when they complete Stripe payments. This system provides immediate communication and clear next steps for both new and existing users.

### **Features**
- **Automatic Email Triggers**: New subscriptions, tier changes, cancellations
- **Professional Branding**: Ask Linc design system with brain icon and primary green colors
- **Responsive Design**: Mobile-optimized email templates
- **Real-time Delivery**: Emails sent immediately when webhooks fire

### **Email Templates**

#### **Welcome Email (New Users)**
- **Subject**: "Welcome to Ask Linc! Complete Your [Tier] Account Setup"
- **Content**:
  - Welcome message with tier confirmation
  - Feature list for the selected plan
  - Complete account setup link with pre-filled parameters
  - Security and privacy information
  - Next steps guidance

#### **Tier Change Email (Existing Users)**
- **Subject**: "Ask Linc Plan Updated: [Old Tier] → [New Tier]"
- **Content**:
  - Plan change confirmation
  - New feature list
  - Access account button
  - Upgrade/downgrade specific messaging
  - Billing information

#### **Cancellation Email**
- **Subject**: "Your [Tier] Subscription Has Been Cancelled"
- **Content**:
  - Cancellation confirmation
  - Period end date information
  - Account access until expiration
  - Renewal instructions

### **Technical Implementation**

#### **Email Service Location**
```
src/services/stripe-email.ts
```

#### **Key Functions**
```typescript
// Send welcome email for new users
sendWelcomeEmail(email: string, tier: string, customerName?: string): Promise<boolean>

// Send tier change confirmation
sendTierChangeEmail(email: string, newTier: string, oldTier: string, customerName?: string): Promise<boolean>

// Send cancellation email
sendCancellationEmail(email: string, tier: string): Promise<boolean>

// Test email configuration
testStripeEmailConfiguration(): Promise<boolean>
```

#### **Integration Points**
- **StripeService**: Automatically calls email functions in webhook handlers
- **Webhook Events**: 
  - `customer.subscription.created` → Welcome email
  - `customer.subscription.updated` → Tier change email (if tier changed)
  - `customer.subscription.updated` → Cancellation email (if cancelled)
  - `customer.subscription.deleted` → Final cancellation email
- **Error Handling**: Email failures don't break webhook processing

### **Email Template Features**

#### **Design Elements**
- **Header**: Ask Linc logo with brain icon and tagline
- **Gradient Backgrounds**: Primary green gradients for headers
- **Feature Lists**: Tier-specific capabilities with checkmarks
- **Call-to-Action Buttons**: Prominent setup/access buttons
- **Footer**: Links to homepage, pricing, privacy, and blog
- **Social Links**: Placeholder social media icons

#### **Responsive Design**
- **Mobile-First**: Optimized for mobile devices
- **Flexible Layout**: Adapts to different screen sizes
- **Touch-Friendly**: Large buttons and readable text

#### **Brand Consistency**
- **Typography**: System fonts matching homepage
- **Color Scheme**: Primary green (#10b981) and neutral grays
- **Spacing**: Consistent padding and margins
- **Icons**: Brain emoji and checkmark symbols

### **Configuration**

#### **Environment Variables**
```bash
# Email Configuration (Resend)
RESEND_API_KEY=re_...                              # Your Resend API key

# Frontend URL
FRONTEND_URL=https://yourdomain.com
```

#### **Development vs Production**
- **Development**: Uses `http://localhost:3001` (default fallback)
- **Production**: Uses `FRONTEND_URL` environment variable
- **Automatic Detection**: Based on `NODE_ENV` and URL patterns

### **URL Generation**

#### **Setup Link for New Users**
```
/register?email=user@example.com&tier=premium&source=stripe
```

#### **Parameters**
- **email**: Pre-filled email address from Stripe
- **tier**: Selected subscription tier
- **source**: Identifies payment source as Stripe

#### **Account Access for Existing Users**
```
/app
```

## 🎨 Email Template System

### **Overview**
All email templates in the Ask Linc system have been upgraded to match our new branding and design system. This includes email verification, password reset, and Stripe payment notification emails.

### **What Was Updated**

#### ✅ **Email Verification Template**
- **File**: `src/auth/email.ts` - `sendEmailVerificationCode` function
- **Old Design**: Basic Arial font with blue/purple gradients
- **New Design**: Ask Linc branding with brain icon and primary green colors

#### ✅ **Password Reset Template**
- **File**: `src/auth/email.ts` - `sendPasswordResetEmail` function
- **Old Design**: Basic Arial font with blue/purple gradients
- **New Design**: Ask Linc branding with brain icon and primary green colors

#### ✅ **Stripe Payment Emails**
- **File**: `src/services/stripe-email.ts`
- **Design**: Ask Linc branding with brain icon and primary green colors

### **Design Improvements**

#### 🎨 **Visual Branding**
- **Logo**: Brain emoji (🧠) in circular icon
- **Typography**: Modern system fonts (San Francisco, Segoe UI, etc.)
- **Color Scheme**: Primary green (#10b981) with consistent gradients
- **Layout**: Professional card-based design with rounded corners

#### 📱 **Responsive Design**
- **Mobile-First**: Optimized for mobile devices
- **Flexible Layout**: Adapts to different screen sizes
- **Touch-Friendly**: Large buttons and readable text
- **Media Queries**: Responsive breakpoints for various devices

#### 🔧 **Technical Improvements**
- **HTML5 Structure**: Proper DOCTYPE and semantic HTML
- **CSS Styling**: Modern CSS with gradients and shadows
- **Accessibility**: Better contrast and readable fonts
- **Cross-Platform**: Compatible with major email clients

### **Color Scheme Updates**

#### **Primary Colors**
- **Old**: Blue (#667eea) and Purple (#764ba2)
- **New**: Green (#10b981) and Dark Green (#059669)

#### **Supporting Colors**
- **Background**: Light gray (#f8f9fa)
- **Text**: Dark gray (#1a1a1a) and Medium gray (#4b5563)
- **Accents**: Blue (#0ea5e9) for security notes
- **Footer**: Dark gray (#1f2937) with light gray text (#9ca3af)

### **Component Improvements**

#### **Header Section**
- **Logo**: Brain emoji with circular background
- **Typography**: Bold, modern font with proper spacing
- **Gradient**: Primary green gradient for brand consistency
- **Subtitle**: "Your AI Financial Assistant" tagline

#### **Content Section**
- **Typography**: System fonts for better readability
- **Spacing**: Consistent padding and margins
- **Buttons**: Hover effects with shadows and transforms
- **Layout**: Clean, organized information hierarchy

#### **Footer Section**
- **Navigation**: Links to Home, Pricing, Privacy, and Blog
- **Branding**: Consistent with homepage footer
- **Information**: Copyright and email context
- **Styling**: Dark background with light text

### **Email-Specific Features**

#### **Email Verification**
- **Verification Code**: Large, prominent display with green styling
- **Expiration Notice**: Clear 15-minute expiration warning
- **Security Note**: Blue-bordered security information box
- **CTA Button**: "Visit Ask Linc →" with arrow indicator

#### **Password Reset**
- **Reset Button**: Large, prominent "Reset Password →" button
- **Fallback Link**: Copy-paste fallback for button issues
- **Time Limit**: Clear 1-hour expiration notice
- **Security Note**: Blue-bordered security information box

#### **Stripe Payment Emails**
- **Welcome Email**: Tier-specific features and setup instructions
- **Tier Change**: Upgrade/downgrade confirmation with feature lists
- **Setup Links**: Pre-filled registration URLs with parameters
- **Feature Lists**: Tier-specific capabilities with checkmarks

### **Email Client Compatibility**

#### **Supported Clients**
- **Desktop**: Outlook, Apple Mail, Thunderbird
- **Mobile**: iOS Mail, Gmail, Samsung Email
- **Web**: Gmail, Yahoo Mail, Outlook.com
- **Business**: Microsoft 365, Google Workspace

#### **Responsive Features**
- **Mobile Optimization**: Touch-friendly buttons and text
- **Flexible Layout**: Adapts to various screen sizes
- **Readable Text**: Proper contrast and font sizes
- **Button Sizing**: Large enough for mobile interaction

### **Brand Consistency**

#### **Visual Elements**
- **Logo**: Consistent brain icon across all emails
- **Colors**: Primary green (#10b981) used throughout
- **Typography**: System fonts matching homepage
- **Layout**: Card-based design with consistent spacing

#### **Messaging**
- **Tone**: Professional yet friendly
- **Language**: Clear, actionable instructions
- **Branding**: "Your AI Financial Assistant" tagline
- **Security**: Consistent security and privacy messaging

## 🔗 Stripe URL Configuration

### **Overview**
This section outlines all the URLs that should be configured for a complete Stripe integration, including checkout flows, customer portal returns, and webhook endpoints.

### **Environment Variables**

#### **Required URLs**
```bash
# Frontend base URL
FRONTEND_URL=https://yourdomain.com

# Stripe webhook secret
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

#### **Optional URL Overrides**
```bash
# Checkout session URLs
STRIPE_CHECKOUT_SUCCESS_URL=/api/stripe/payment-success
STRIPE_CHECKOUT_CANCEL_URL=/pricing

# Customer portal URLs
STRIPE_PORTAL_RETURN_URL=/profile
STRIPE_PORTAL_CANCEL_RETURN_URL=/profile?subscription=canceled
STRIPE_PORTAL_UPDATE_RETURN_URL=/profile?subscription=updated

# Account link URLs (for Connect accounts)
STRIPE_ACCOUNT_REFRESH_URL=/stripe/account/refresh
STRIPE_ACCOUNT_RETURN_URL=/stripe/account/return
```

### **URL Flow Diagram**

```
User Payment Flow:
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────┐
│   Stripe        │───▶│  /api/stripe/       │───▶│   /register     │
│   Checkout      │    │  payment-success    │    │   (new user)    │
│   Success       │    │                     │    │                 │
└─────────────────┘    └─────────────────────┘    └─────────────────┘

User Cancels Payment:
┌─────────────────┐    ┌─────────────────┐
│   Stripe        │───▶│   /pricing      │
│   Checkout      │    │                 │
│   Cancel        │    │                 │
└─────────────────┘    └─────────────────┘

Customer Portal:
┌─────────────────┐    ┌─────────────────┐
│   Stripe        │───▶│   /profile      │
│   Portal        │    │                 │
│   Return        │    │                 │
└─────────────────┘    └─────────────────┘
```

### **URL Purposes**

#### **1. Checkout Success URL (`/api/stripe/payment-success`)**
- **Purpose**: Handles post-payment flow
- **Action**: Verifies payment and redirects user
- **Redirects to**: 
  - `/register` (new users)
  - `/profile` (existing users)

#### **2. Checkout Cancel URL (`/pricing`)**
- **Purpose**: When user cancels payment
- **Action**: Shows pricing page with option to retry
- **User Experience**: Clear path to try again

#### **3. Customer Portal Return URL (`/profile`)**
- **Purpose**: After managing subscription in Stripe portal
- **Action**: Returns user to their profile
- **Context**: Shows updated subscription status

#### **4. Portal Cancel Return URL (`/profile?subscription=canceled`)**
- **Purpose**: After canceling subscription in portal
- **Action**: Shows cancellation confirmation
- **User Experience**: Clear feedback about subscription status

#### **5. Portal Update Return URL (`/profile?subscription=updated`)**
- **Purpose**: After updating subscription in portal
- **Action**: Shows update confirmation
- **User Experience**: Confirms changes were applied

### **Frontend Integration**

#### **Register Page (`/register`)**
The register page receives these query parameters:
```typescript
interface RegisterPageParams {
  subscription: 'success';
  tier: 'starter' | 'standard' | 'premium';
  email?: string;
  session_id?: string;
}
```

#### **Profile Page (`/profile`)**
The profile page receives these query parameters:
```typescript
interface ProfilePageParams {
  subscription?: 'active' | 'canceled' | 'updated';
  tier?: string;
}
```

### **Security Considerations**
1. **Webhook Verification**: All webhook events are verified with Stripe signature
2. **Session Validation**: Payment success endpoint validates Stripe session
3. **User Authentication**: Portal access requires authenticated users
4. **HTTPS Required**: All URLs should use HTTPS in production

### **Testing**
Use the test script to verify URL flow:
```bash
node scripts/test-payment-flow.js
```

### **Production Deployment**
1. Set `FRONTEND_URL` to your production domain
2. Configure `STRIPE_WEBHOOK_SECRET` in your production environment
3. Test all URL flows in Stripe test mode before going live
4. Monitor webhook delivery and success rates

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
| `customer.subscription.created` | `handleSubscriptionCreated` | Welcome email, tier sync |
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

### **Auto-Sync Testing**
1. Change subscription tier in Stripe dashboard
2. Verify webhook fires and auto-sync triggers
3. Verify database tier updated automatically
4. Verify user sees new tier immediately
5. Verify appropriate email sent

### **Email Template Testing**
1. Test email configuration with `testStripeEmailConfiguration()`
2. Verify all email templates render correctly
3. Test responsive design across devices
4. Verify email delivery and formatting

## 🚨 Error Handling

### **Webhook Failures**
- **Email failures** should not fail webhook processing
- **Database failures** should be logged and retried
- **Invalid webhook data** should be logged and ignored

### **Authentication Failures**
- **Expired subscriptions** return 401 with clear message
- **Invalid tokens** return 401 with generic message
- **Database errors** return 500 with generic message

### **Email Failures**
- **SMTP Configuration**: Check email credentials and settings
- **Network Issues**: Verify internet connectivity
- **Rate Limiting**: Respect email provider limits

## 🔧 Environment Variables Configuration

### **Overview**
This section details all environment variables required for the Stripe subscription integration, organized by deployment environment and file location.

### **Frontend Environment Variables**

#### **Localhost Development** (`frontend/.env.local`)
```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000

# Stripe Customer Portal
NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/test_9B63cueur9GTcpU0s18og00
```

#### **Production Frontend** (Vercel Environment Variables)
```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://your-backend-domain.com

# Stripe Customer Portal (Production)
NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/prod_your_production_portal_id
```

### **Backend Environment Variables**

#### **Localhost Development** (`.env`)
```bash
# Stripe API Credentials
STRIPE_SECRET_KEY=sk_test_your_test_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_test_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_test_webhook_secret

# Stripe Price IDs
STRIPE_PRICE_STARTER=price_your_starter_price_id
STRIPE_PRICE_STANDARD=price_your_standard_price_id
STRIPE_PRICE_PREMIUM=price_your_premium_price_id

# Frontend URL
FRONTEND_URL=http://localhost:3001

# Customer Portal URLs
STRIPE_PORTAL_RETURN_URL=/profile
STRIPE_PORTAL_CANCEL_RETURN_URL=/profile?subscription=canceled
STRIPE_PORTAL_UPDATE_RETURN_URL=/profile?subscription=updated

# Checkout URLs
STRIPE_CHECKOUT_SUCCESS_URL=/api/stripe/payment-success
STRIPE_CHECKOUT_CANCEL_URL=/pricing

# Account Link URLs
STRIPE_ACCOUNT_REFRESH_URL=/stripe/account/refresh
STRIPE_ACCOUNT_RETURN_URL=/stripe/account/return
```

#### **Production Backend** (Render Environment Variables)
```bash
# Stripe API Credentials (Production)
STRIPE_SECRET_KEY=sk_live_your_production_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_production_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret

# Stripe Price IDs (Production)
STRIPE_PRICE_STARTER=price_your_prod_starter_price_id
STRIPE_PRICE_STANDARD=price_your_prod_standard_price_id
STRIPE_PRICE_PREMIUM=price_your_prod_premium_price_id

# Frontend URL (Production)
FRONTEND_URL=https://your-frontend-domain.com

# Customer Portal URLs (Production)
STRIPE_PORTAL_RETURN_URL=/profile
STRIPE_PORTAL_CANCEL_RETURN_URL=/profile?subscription=canceled
STRIPE_PORTAL_UPDATE_RETURN_URL=/profile?subscription=updated

# Checkout URLs (Production)
STRIPE_CHECKOUT_SUCCESS_URL=/api/stripe/payment-success
STRIPE_CHECKOUT_CANCEL_URL=/pricing

# Account Link URLs (Production)
STRIPE_ACCOUNT_REFRESH_URL=/stripe/account/refresh
STRIPE_ACCOUNT_RETURN_URL=/stripe/account/return
```

### **CI/CD Environment Variables**

#### **GitHub Actions** (`.github/workflows/ci.yml` secrets)
```bash
# Test Environment (for CI/CD tests)
STRIPE_SECRET_KEY=sk_test_fake_key_for_tests
STRIPE_PUBLISHABLE_KEY=pk_test_fake_key_for_tests
STRIPE_WEBHOOK_SECRET=whsec_fake_webhook_secret

# Test Price IDs
STRIPE_PRICE_STARTER=price_test_starter
STRIPE_PRICE_STANDARD=price_test_standard
STRIPE_PRICE_PREMIUM=price_test_premium

# Test Frontend URL
FRONTEND_URL=http://localhost:3001
```

### **Environment-Specific Configuration**

#### **Test vs Production Keys**
- **Localhost**: Uses test keys from `.env`
- **CI/CD**: Uses fake test keys for automated testing
- **Production**: Uses live keys from Render environment variables

#### **URL Configuration**
- **Localhost**: `http://localhost:3001` (frontend) + `http://localhost:3000` (backend)
- **Production**: Production domain URLs for both frontend and backend
- **CI/CD**: Localhost URLs for test environment

### **Security Considerations**

#### **Key Management**
- **Never commit** real API keys to version control
- **Use environment variables** for all sensitive configuration
- **Rotate keys** regularly in production
- **Monitor key usage** for suspicious activity

#### **Webhook Security**
- **Verify webhook signatures** in production
- **Use unique webhook secrets** for each environment
- **HTTPS only** for production webhook endpoints

### **Configuration Validation**

#### **Required Variables Check**
The system validates these environment variables on startup:
```typescript
// Backend validation
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

// Frontend validation
if (!process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL) {
  console.warn('NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL_URL not configured');
}
```

#### **Environment Detection**
```typescript
const isProduction = process.env.NODE_ENV === 'production';
const isCI = process.env.GITHUB_ACTIONS === 'true';
const isLocalhost = process.env.FRONTEND_URL?.includes('localhost');
```

---

## 📝 Implementation Notes

### **Key Principles**
1. **User experience first** - clear messaging and predictable behavior
2. **Data consistency** - database always reflects Stripe state
3. **No duplicate emails** - prevent spam during webhook storms
4. **Graceful degradation** - system continues working even if emails fail
5. **Real-time synchronization** - automatic tier updates via webhooks

### **Performance Considerations**
- **Webhook processing** should be fast (< 1 second)
- **Database updates** should be atomic
- **Email sending** should be asynchronous when possible
- **Auto-sync operations** should complete within webhook timeout

### **Security Considerations**
- **Webhook signature verification** in production
- **Rate limiting** on authentication endpoints
- **Audit logging** for all subscription changes
- **Email security** - no sensitive data in emails

## 🔮 Future Enhancements

### **Potential Improvements**
1. **Subscription reactivation** without new checkout
2. **Prorated billing** for mid-period changes
3. **Subscription pausing** for temporary holds
4. **Advanced email templates** with branding
5. **Webhook retry logic** for failed processing
6. **A/B testing** for email content and layouts
7. **Personalization** based on user behavior
8. **Localization** for multi-language support

### **Monitoring & Analytics**
1. **Subscription conversion rates** by tier
2. **Churn analysis** for cancelled subscriptions
3. **Webhook processing metrics**
4. **Email delivery success rates**
5. **Auto-sync performance metrics**
6. **User engagement with emails**

## 📋 Testing & Validation

### **Test Scripts Available**
```bash
# Test webhook auto-sync functionality
node scripts/test-webhook-auto-sync.js

# Test updated email templates
node scripts/test-updated-emails.js

# Test Stripe email system
node scripts/test-stripe-emails.js

# Test overall email configuration
node -e "require('./dist/auth/email').testEmailConfiguration().then(console.log)"
```

### **Test Scenarios**
1. **Webhook Auto-Sync**: Verify automatic tier synchronization
2. **Email Configuration**: Verify SMTP settings
3. **Verification Template**: Test new user email verification
4. **Password Reset**: Test password reset email template
5. **Stripe Emails**: Test payment notification emails
6. **Responsive Design**: Test email templates across devices

## 📊 Implementation Status

### **✅ COMPLETED**
- **Webhook Auto-Sync System**: Real-time tier synchronization
- **Email Template Upgrade**: Professional branding and design
- **Stripe Email System**: Payment notification emails
- **Subscription Lifecycle**: Complete event handling
- **Test Scripts**: Comprehensive testing coverage

### **📋 NEXT STEPS**
1. **Security Validation**: Middleware security testing
2. **Performance Testing**: Load testing and optimization
3. **Production Deployment**: Final deployment and monitoring
4. **User Experience**: Frontend integration and UI polish

---

**Status: ✅ IMPLEMENTED**  
**Last Updated**: Complete Integration Specification  
**Next Phase**: Security Validation & Performance Testing
