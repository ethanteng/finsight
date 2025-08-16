# Stripe URL Configuration Guide

## Overview
This document outlines all the URLs that should be configured for a complete Stripe integration.

## Environment Variables

### Required URLs

```bash
# Frontend base URL
FRONTEND_URL=https://yourdomain.com

# Stripe webhook secret
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### Optional URL Overrides

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

## URL Flow Diagram

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

## URL Purposes

### 1. Checkout Success URL (`/api/stripe/payment-success`)
- **Purpose**: Handles post-payment flow
- **Action**: Verifies payment and redirects user
- **Redirects to**: 
  - `/register` (new users)
  - `/profile` (existing users)

### 2. Checkout Cancel URL (`/pricing`)
- **Purpose**: When user cancels payment
- **Action**: Shows pricing page with option to retry
- **User Experience**: Clear path to try again

### 3. Customer Portal Return URL (`/profile`)
- **Purpose**: After managing subscription in Stripe portal
- **Action**: Returns user to their profile
- **Context**: Shows updated subscription status

### 4. Portal Cancel Return URL (`/profile?subscription=canceled`)
- **Purpose**: After canceling subscription in portal
- **Action**: Shows cancellation confirmation
- **User Experience**: Clear feedback about subscription status

### 5. Portal Update Return URL (`/profile?subscription=updated`)
- **Purpose**: After updating subscription in portal
- **Action**: Shows update confirmation
- **User Experience**: Confirms changes were applied

## Frontend Integration

### Register Page (`/register`)
The register page receives these query parameters:
```typescript
interface RegisterPageParams {
  subscription: 'success';
  tier: 'starter' | 'standard' | 'premium';
  email?: string;
  session_id?: string;
}
```

### Profile Page (`/profile`)
The profile page receives these query parameters:
```typescript
interface ProfilePageParams {
  subscription?: 'active' | 'canceled' | 'updated';
  tier?: string;
}
```

## Security Considerations

1. **Webhook Verification**: All webhook events are verified with Stripe signature
2. **Session Validation**: Payment success endpoint validates Stripe session
3. **User Authentication**: Portal access requires authenticated users
4. **HTTPS Required**: All URLs should use HTTPS in production

## Testing

Use the test script to verify URL flow:
```bash
node scripts/test-payment-flow.js
```

## Production Deployment

1. Set `FRONTEND_URL` to your production domain
2. Configure `STRIPE_WEBHOOK_SECRET` in your production environment
3. Test all URL flows in Stripe test mode before going live
4. Monitor webhook delivery and success rates
