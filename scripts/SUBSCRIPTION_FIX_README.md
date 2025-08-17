# 🔧 Subscription Fix Script

## Overview

This script fixes user subscription issues by syncing local database records with Stripe subscription data. It's designed to resolve issues where users have valid Stripe subscriptions but incorrect local subscription status or tier.

## 🚨 When to Use This Script

- **User has active Stripe subscription but shows as "inactive" locally**
- **User tier doesn't match what they paid for in Stripe**
- **User account was recreated after database issues**
- **Subscription sync between Stripe and local database is out of sync**

## 📋 Prerequisites

1. **Environment Variables:**
   ```bash
   STRIPE_SECRET_KEY=sk_live_...  # Your Stripe secret key
   DATABASE_URL=postgresql://...   # Your database connection string
   ```

2. **Dependencies:**
   ```bash
   npm install @prisma/client stripe
   ```

3. **Database Access:**
   - Ensure your database is accessible
   - Prisma client should be generated (`npx prisma generate`)

## 🚀 Usage

### Basic Usage
```bash
node scripts/fix-user-subscription.js <email>
```

### Examples
```bash
# Fix subscription for specific user
node scripts/fix-user-subscription.js ethan+test1@ethanteng.com

# Dry run (see what would happen without making changes)
node scripts/fix-user-subscription.js ethan+test1@ethanteng.com --dry-run

# Verbose logging (see detailed information)
node scripts/fix-user-subscription.js ethan+test1@ethanteng.com --verbose

# Both dry run and verbose
node scripts/fix-user-subscription.js ethan+test1@ethanteng.com --dry-run --verbose
```

## ⚙️ Configuration

### Update Price ID Mappings

Edit `scripts/subscription-config.js` to add your Stripe price IDs:

```javascript
priceToTierMap: {
  'price_1RwzrlBDHiWEJZBMbLKSPb3N': 'standard',  // Standard plan
  'price_YOUR_PREMIUM_PRICE_ID': 'premium',        // Premium plan
  'price_YOUR_STARTER_PRICE_ID': 'starter',        // Starter plan
}
```

### Find Your Stripe Price IDs

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Click on your product
3. Copy the price ID (starts with `price_`)

## 🔍 What the Script Does

### 1. User Lookup
- Finds user in local database by email
- Checks current subscription status and tier

### 2. Stripe Customer Lookup
- Searches Stripe for customers with matching email
- Finds the most recent customer (usually the correct one)

### 3. Subscription Analysis
- Lists all Stripe subscriptions for the customer
- Identifies active subscriptions
- Maps subscription details to local tier system

### 4. Database Updates
- Updates user tier and subscription status
- Creates/updates Stripe customer record
- Creates/updates subscription record
- Links everything together

## 📊 Expected Output

### Successful Fix
```
🚀 Starting subscription fix for user: ethan+test1@ethanteng.com

ℹ️  Looking up user with email: ethan+test1@ethanteng.com
✅ Found user: cmeg3a5ez0000ry2hz6xlgtgo (ethan+test1@ethanteng.com)

ℹ️  Looking up Stripe customer for email: ethan+test1@ethanteng.com
✅ Found Stripe customer: cus_SsyLnUxNKxkGpA

ℹ️  Looking up Stripe subscriptions for customer: cus_SsyLnUxNKxkGpA
✅ Found 1 Stripe subscription(s)

ℹ️  Updating user subscription:
ℹ️    Current tier: starter → New tier: premium
ℹ️    Current status: inactive → New status: active

✅ Created Stripe customer record: cus_SsyLnUxNKxkGpA
✅ Created subscription record: sub_1RxCOyBDHiWEJZBMA8jQJShT

✅ Subscription fix completed for: ethan+test1@ethanteng.com
ℹ️  Result: User subscription updated successfully
ℹ️  Tier: premium
ℹ️  Status: active
```

### Dry Run Mode
```
⚠️  DRY RUN MODE - No changes will be made
⚠️  This was a dry run. Run without --dry-run to apply changes.
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. "User not found with email"
- Check if the email is correct
- Verify the user exists in your database
- Check if the email has typos or different formatting

#### 2. "No Stripe customer found for email"
- Verify the email in Stripe matches exactly
- Check if the customer was created with a different email
- Look for variations (e.g., +test1 vs +test2)

#### 3. "No active Stripe subscription found"
- Check if the subscription is actually active in Stripe
- Verify the subscription hasn't been cancelled
- Check if the subscription is paused or past due

#### 4. "Could not determine tier from subscription"
- Update the `priceToTierMap` in the config file
- Check if the price nickname contains tier information
- Verify the subscription has the expected structure

### Debug Mode

Use `--verbose` flag to see detailed information:

```bash
node scripts/fix-user-subscription.js ethan+test1@ethanteng.com --verbose
```

This will show:
- Detailed Stripe API responses
- Database queries and results
- Step-by-step process information

### Database Connection Issues

If you get database connection errors:

1. **Check DATABASE_URL:**
   ```bash
   echo $DATABASE_URL
   ```

2. **Test Prisma connection:**
   ```bash
   npx prisma db pull
   ```

3. **Regenerate Prisma client:**
   ```bash
   npx prisma generate
   ```

## 🔒 Security Considerations

- **Never commit your STRIPE_SECRET_KEY** to version control
- **Use environment variables** for sensitive configuration
- **Test with dry-run mode** before making actual changes
- **Verify changes** in your database after running the script

## 📝 Logging

The script provides colored output for different types of messages:

- 🚀 **Bright**: Script start and major milestones
- ✅ **Green**: Success messages
- ⚠️ **Yellow**: Warnings
- ❌ **Red**: Errors
- ℹ️ **Blue**: Information
- 🔍 **Cyan**: Verbose/debug information (only with --verbose)

## 🔄 Reusability

This script is designed to be reusable for future subscription issues:

1. **Update configuration** in `subscription-config.js`
2. **Run for different users** by changing the email parameter
3. **Use dry-run mode** to preview changes
4. **Import functions** into other scripts if needed

## 📞 Support

If you encounter issues:

1. **Check the troubleshooting section** above
2. **Run with --verbose** to get detailed error information
3. **Verify your configuration** matches your Stripe setup
4. **Check database connectivity** and Prisma setup

## 🎯 Next Steps

After running the script:

1. **Verify the user's subscription status** in your admin panel
2. **Test the user's access** to premium features
3. **Check if the subscription syncs** with future Stripe webhooks
4. **Monitor for similar issues** with other users
