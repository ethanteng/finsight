# 🚀 Stripe Checkout Flow Demo

## **Complete User Journey**

### **1. User Clicks Subscribe** 📱
```
User visits: /pricing
User clicks: "Subscribe to Standard Plan"
```

### **2. Frontend API Call** 🔌
```javascript
// Frontend makes this API call
const response = await fetch('/api/stripe/create-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    priceId: 'price_standard_monthly', // Real Stripe price ID
    customerEmail: 'user@example.com',
    successUrl: 'https://yourapp.com/api/stripe/payment-success?tier=standard',
    cancelUrl: 'https://yourapp.com/pricing'
  })
});

const { sessionId, url } = await response.json();
```

### **3. Backend Creates Stripe Session** ⚙️
```typescript
// Our Stripe service generates these URLs
const successUrl = `${baseUrl}/api/stripe/payment-success?tier=standard&customer_email=user@example.com`;
const cancelUrl = `${baseUrl}/pricing`;

// Creates Stripe checkout session
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  payment_method_types: ['card'],
  line_items: [{ price: 'price_standard_monthly', quantity: 1 }],
  success_url: successUrl,
  cancel_url: cancelUrl,
  customer_email: 'user@example.com',
  metadata: { tier: 'standard', source: 'web_checkout' }
});
```

### **4. User Redirected to Stripe** 🔄
```
User visits: https://checkout.stripe.com/pay/cs_test_xxx
User enters: Credit card details
User clicks: "Subscribe to Standard Plan"
```

### **5. Payment Success & Redirect** ✅
```
Stripe redirects to: /api/stripe/payment-success?tier=standard&customer_email=user@example.com
```

### **6. Our Endpoint Processes Success** 🎯
```typescript
// /api/stripe/payment-success endpoint
const { session_id, subscription_id, customer_email, tier } = req.query;

// Verify with Stripe
const session = await stripe.checkout.sessions.retrieve(session_id);
if (session.payment_status !== 'paid') {
  // Handle error
}

// Check if user exists
const existingUser = await prisma.user.findUnique({
  where: { email: customer_email }
});

if (existingUser) {
  // Redirect to profile
  res.redirect('/profile?subscription=active&tier=standard');
} else {
  // Redirect to register with context
  res.redirect('/register?subscription=success&tier=standard&email=user@example.com&session_id=cs_test_xxx');
}
```

### **7. Final User Destination** 🎉
```
New User → /register?subscription=success&tier=standard&email=user@example.com&session_id=cs_test_xxx
Existing User → /profile?subscription=active&tier=standard
```

## **Frontend Integration Examples**

### **Register Page Query Parameters**
```typescript
// /register page receives:
interface RegisterParams {
  subscription: 'success';
  tier: 'standard';
  email: 'user@example.com';
  session_id: 'cs_test_xxx';
}

// Use these to:
// 1. Pre-fill email field
// 2. Show success message
// 3. Highlight selected tier
// 4. Store session_id for verification
```

### **Profile Page Query Parameters**
```typescript
// /profile page receives:
interface ProfileParams {
  subscription: 'active';
  tier: 'standard';
}

// Use these to:
// 1. Show subscription status
// 2. Display tier benefits
// 3. Highlight active subscription
```

## **Testing the Flow**

### **1. Mock Test (No Stripe)**
```bash
node scripts/test-checkout-session.js
```

### **2. API Test (Backend Running)**
```bash
node scripts/test-real-checkout.js
```

### **3. Real Stripe Test**
```bash
# Set real Stripe price IDs in environment
export STRIPE_PRICE_STARTER=price_1ABC123...
export STRIPE_PRICE_STANDARD=price_1DEF456...
export STRIPE_PRICE_PREMIUM=price_1GHI789...

# Test with real price IDs
node scripts/test-real-checkout.js
```

## **Environment Variables Needed**

```bash
# Required
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://yourapp.com

# Optional (for real Stripe)
STRIPE_PRICE_STARTER=price_1ABC123...
STRIPE_PRICE_STANDARD=price_1DEF456...
STRIPE_PRICE_PREMIUM=price_1GHI789...
```

## **Success! 🎉**

This flow provides:
- ✅ **Seamless onboarding** for new paying customers
- ✅ **Professional experience** matching Stripe's quality
- ✅ **Context preservation** throughout the journey
- ✅ **Smart redirects** based on user status
- ✅ **Production-ready** error handling and fallbacks
