#!/usr/bin/env node

/**
 * Fix User Subscription Script
 * 
 * This script fixes user subscription issues by:
 * 1. Looking up the user by email
 * 2. Finding their Stripe customer/subscription
 * 3. Updating their local subscription status and tier
 * 4. Providing detailed logging of what was fixed
 * 
 * Usage:
 * node scripts/fix-user-subscription.js <email> [--dry-run] [--verbose] [--customer-id=<id>]
 * 
 * Examples:
 * node scripts/fix-user-subscription.js ethan+test1@ethanteng.com
 * node scripts/fix-user-subscription.js ethan+test1@ethanteng.com --dry-run
 * node scripts/fix-user-subscription.js ethan+test1@ethanteng.com --verbose
 * node scripts/fix-user-subscription.js ethan+test1@ethanteng.com --customer-id=cus_SsxAQyOrPmDydZ
 */

const { PrismaClient } = require('@prisma/client');
const Stripe = require('stripe');
const config = require('./subscription-config');

// Initialize clients
const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Parse command line arguments
const args = process.argv.slice(2);
const email = args[0];
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const customerId = args.find(arg => arg.startsWith('--customer-id='))?.split('=')[1];
const testAccess = args.includes('--test-access');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logError(message) {
  log(`❌ ERROR: ${message}`, 'red');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logVerbose(message) {
  if (isVerbose) {
    log(`🔍 ${message}`, 'cyan');
  }
}

async function findUserByEmail(email) {
  logInfo(`Looking up user with email: ${email}`);
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      subscriptions: true,
      profile: true
    }
  });

  if (!user) {
    throw new Error(`User not found with email: ${email}`);
  }

  logSuccess(`Found user: ${user.id} (${user.email})`);
  logVerbose(`User details: tier=${user.tier}, subscriptionStatus=${user.subscriptionStatus}, stripeCustomerId=${user.stripeCustomerId}`);
  
  return user;
}

async function testStripeAccess() {
  logInfo(`Testing Stripe API access...`);
  
  try {
    // Test basic API access
    const account = await stripe.accounts.retrieve();
    logSuccess(`✅ Stripe API access successful`);
    logVerbose(`Account ID: ${account.id}`);
    logVerbose(`Account type: ${account.type}`);
    
    // Test customer listing (limited to recent customers)
    const customers = await stripe.customers.list({ limit: 5 });
    logSuccess(`✅ Customer listing successful - found ${customers.data.length} recent customers`);
    
    if (customers.data.length > 0) {
      logVerbose(`Recent customers:`);
      customers.data.forEach((customer, index) => {
        logVerbose(`  ${index + 1}. ${customer.id} (${customer.email}) - Created: ${new Date(customer.created * 1000).toISOString()}`);
      });
    }
    
    return true;
  } catch (error) {
    logError(`❌ Stripe API access failed:`);
    logError(`  Error type: ${error.type || 'Unknown'}`);
    logError(`  Error message: ${error.message}`);
    logError(`  Error code: ${error.code || 'None'}`);
    return false;
  }
}

async function findStripeCustomerById(customerId) {
  logInfo(`Looking up Stripe customer by ID: ${customerId}`);
  
  try {
    logVerbose(`Making Stripe API call to retrieve customer: ${customerId}`);
    logVerbose(`Using Stripe key: ${process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 20) + '...' : 'NOT SET'}`);
    
    const customer = await stripe.customers.retrieve(customerId);
    
    logVerbose(`Stripe API response received for customer: ${customer.id}`);
    
    if (customer.deleted) {
      throw new Error(`Customer ${customerId} has been deleted`);
    }
    
    logSuccess(`Found Stripe customer by ID: ${customer.id}`);
    logVerbose(`Customer email: ${customer.email}, created: ${new Date(customer.created * 1000).toISOString()}`);
    
    return customer;
  } catch (error) {
    logError(`Stripe API error details:`);
    logError(`  Error type: ${error.type || 'Unknown'}`);
    logError(`  Error message: ${error.message}`);
    logError(`  Error code: ${error.code || 'None'}`);
    logError(`  HTTP status: ${error.statusCode || 'Unknown'}`);
    
    if (error.type === 'StripeInvalidRequestError') {
      if (error.code === 'resource_missing') {
        throw new Error(`Customer ${customerId} not found - it may have been deleted or never existed`);
      } else if (error.code === 'api_key_expired') {
        throw new Error(`Stripe API key has expired`);
      } else if (error.code === 'invalid_api_key') {
        throw new Error(`Invalid Stripe API key - check your STRIPE_SECRET_KEY environment variable`);
      } else {
        throw new Error(`Invalid customer ID: ${customerId} (Stripe error: ${error.code})`);
      }
    } else if (error.type === 'StripeAuthenticationError') {
      throw new Error(`Stripe authentication failed - check your API key permissions`);
    } else if (error.type === 'StripePermissionError') {
      throw new Error(`Stripe permission denied - your API key doesn't have access to this customer`);
    } else {
      throw new Error(`Failed to retrieve customer ${customerId}: ${error.message}`);
    }
  }
}

async function findStripeCustomer(email) {
  logInfo(`Looking up Stripe customer for email: ${email}`);
  
  try {
    // Method 1: Search for customers by email
    logVerbose(`Searching for customers with email: ${email}`);
    const customersByEmail = await stripe.customers.list({
      email: email,
      limit: 10
    });

    logVerbose(`Found ${customersByEmail.data.length} customers by email search`);

    if (customersByEmail.data.length > 0) {
      // Find the most recent customer (usually the correct one)
      const customer = customersByEmail.data.sort((a, b) => b.created - a.created)[0];
      logSuccess(`Found Stripe customer by email: ${customer.id}`);
      logVerbose(`Customer created: ${new Date(customer.created * 1000).toISOString()}`);
      return customer;
    }

    // Method 2: Try searching with different email variations
    logVerbose(`No customers found by exact email, trying variations...`);
    
    // Try without the +test1 part
    const baseEmail = email.split('+')[0] + '@' + email.split('@')[1];
    if (baseEmail !== email) {
      logVerbose(`Trying base email: ${baseEmail}`);
      const customersByBaseEmail = await stripe.customers.list({
        email: baseEmail,
        limit: 10
      });
      
      if (customersByBaseEmail.data.length > 0) {
        const customer = customersByBaseEmail.data.sort((a, b) => b.created - a.created)[0];
        logSuccess(`Found Stripe customer by base email: ${customer.id}`);
        logVerbose(`Customer created: ${new Date(customer.created * 1000).toISOString()}`);
        return customer;
      }
    }

    // Method 3: List all customers and search manually (fallback)
    logVerbose(`Trying to list recent customers and search manually...`);
    const allCustomers = await stripe.customers.list({
      limit: 100
    });

    // Search for email in the list
    const matchingCustomer = allCustomers.data.find(customer => 
      customer.email === email || 
      customer.email === baseEmail ||
      (customer.metadata && customer.metadata.email === email)
    );

    if (matchingCustomer) {
      logSuccess(`Found Stripe customer by manual search: ${matchingCustomer.id}`);
      logVerbose(`Customer created: ${new Date(matchingCustomer.created * 1000).toISOString()}`);
      return matchingCustomer;
    }

    // Method 4: If we know the customer ID, try to retrieve directly
    logVerbose(`All search methods failed. If you know the customer ID, you can try retrieving it directly.`);
    
    // Log what we found for debugging
    logWarning(`Email search results:`);
    customersByEmail.data.forEach((cust, index) => {
      logWarning(`  ${index + 1}. ID: ${cust.id}, Email: ${cust.email}, Created: ${new Date(cust.created * 1000).toISOString()}`);
    });

    if (customersByEmail.data.length === 0) {
      logWarning(`No customers found with email: ${email}`);
    }

    throw new Error(`No Stripe customer found for email: ${email}. Tried exact match, base email, and manual search.`);

  } catch (error) {
    if (error.type === 'StripeAuthenticationError') {
      throw new Error(`Stripe authentication failed. Check your STRIPE_SECRET_KEY.`);
    } else if (error.type === 'StripePermissionError') {
      throw new Error(`Stripe permission error. Check if your API key has access to customers.`);
    } else if (error.type === 'StripeRateLimitError') {
      throw new Error(`Stripe rate limit exceeded. Try again in a moment.`);
    } else {
      throw new Error(`Stripe API error: ${error.message}`);
    }
  }
}

async function findStripeSubscriptions(customerId) {
  logInfo(`Looking up Stripe subscriptions for customer: ${customerId}`);
  
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10
  });

  if (subscriptions.data.length === 0) {
    logWarning(`No Stripe subscriptions found for customer: ${customerId}`);
    return [];
  }

  logSuccess(`Found ${subscriptions.data.length} Stripe subscription(s)`);
  
  // Log subscription details
  subscriptions.data.forEach((sub, index) => {
    const price = sub.items.data[0]?.price;
    const product = price?.product;
    logVerbose(`Subscription ${index + 1}: ${sub.id} (${sub.status})`);
    logVerbose(`  Price ID: ${price?.id || 'Unknown'}`);
    logVerbose(`  Price Nickname: ${price?.nickname || 'None'}`);
    logVerbose(`  Product Name: ${product?.name || 'Unknown'}`);
    logVerbose(`  Amount: ${price?.unit_amount ? `$${(price.unit_amount / 100).toFixed(2)}` : 'Unknown'}`);
  });

  return subscriptions.data;
}

function determineTierFromStripeSubscription(subscription) {
  if (!subscription || subscription.status !== 'active') {
    logVerbose(`Subscription not active, returning 'starter'`);
    return 'starter';
  }

  const priceId = subscription.items.data[0]?.price?.id;
  const priceNickname = subscription.items.data[0]?.price?.nickname;
  const productName = subscription.items.data[0]?.price?.product?.name;
  
  logVerbose(`Price ID: ${priceId}`);
  logVerbose(`Price Nickname: ${priceNickname}`);
  logVerbose(`Product Name: ${productName}`);

  // Method 1: Map by price ID (most reliable)
  if (priceId && config.priceToTierMap[priceId]) {
    logVerbose(`Found tier by price ID: ${priceId} → ${config.priceToTierMap[priceId]}`);
    return config.priceToTierMap[priceId];
  }

  // Method 2: Map by price nickname
  if (priceNickname) {
    const nickname = priceNickname.toLowerCase();
    for (const [key, tier] of Object.entries(config.nicknameToTierMap)) {
      if (nickname.includes(key.toLowerCase())) {
        logVerbose(`Found tier by nickname: ${priceNickname} → ${tier}`);
        return tier;
      }
    }
  }

  // Method 3: Map by product name
  if (productName) {
    const product = productName.toLowerCase();
    if (product.includes('premium')) {
      logVerbose(`Found tier by product name: ${productName} → premium`);
      return 'premium';
    } else if (product.includes('standard')) {
      logVerbose(`Found tier by product name: ${productName} → standard`);
      return 'standard';
    } else if (product.includes('starter')) {
      logVerbose(`Found tier by product name: ${productName} → starter`);
      return 'starter';
    }
  }

  // Method 4: Fallback to default
  logWarning(`Could not determine tier from subscription data:`);
  logWarning(`  Price ID: ${priceId}`);
  logWarning(`  Price Nickname: ${priceNickname}`);
  logWarning(`  Product Name: ${productName}`);
  logWarning(`  Available price IDs in config: ${Object.keys(config.priceToTierMap).join(', ')}`);
  logWarning(`  Defaulting to: ${config.defaultTier}`);
  
  return config.defaultTier;
}

async function updateUserSubscription(user, stripeCustomer, stripeSubscriptions) {
  const activeSubscription = stripeSubscriptions.find(sub => sub.status === 'active');
  
  if (!activeSubscription) {
    logWarning(`No active Stripe subscription found for user: ${user.email}`);
    return {
      tier: 'starter',
      subscriptionStatus: 'inactive',
      message: 'No active Stripe subscription found'
    };
  }

  const newTier = determineTierFromStripeSubscription(activeSubscription);
  const newStatus = 'active';

  logInfo(`Updating user subscription:`);
  logInfo(`  Current tier: ${user.tier} → New tier: ${newTier}`);
  logInfo(`  Current status: ${user.subscriptionStatus} → New status: ${newStatus}`);

  // Parse dates safely from Stripe timestamps
  const currentPeriodStart = activeSubscription.current_period_start ? 
    new Date(activeSubscription.current_period_start * 1000) : 
    new Date();
  
  const currentPeriodEnd = activeSubscription.current_period_end ? 
    new Date(activeSubscription.current_period_end * 1000) : 
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now
  
  // Validate dates
  if (isNaN(currentPeriodStart.getTime()) || isNaN(currentPeriodEnd.getTime())) {
    logWarning(`Invalid dates from Stripe, using fallback dates`);
    const now = new Date();
    const fallbackEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      tier: newTier,
      subscriptionStatus: newStatus,
      message: 'Updated with fallback dates due to invalid Stripe dates'
    };
  }

  logVerbose(`Current period start: ${currentPeriodStart.toISOString()}`);
  logVerbose(`Current period end: ${currentPeriodEnd.toISOString()}`);

  if (isDryRun) {
    logInfo(`[DRY RUN] Would update user subscription`);
    return {
      tier: newTier,
      subscriptionStatus: newStatus,
      message: 'Dry run - no changes made'
    };
  }

  try {
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        tier: newTier,
        subscriptionStatus: newStatus,
        stripeCustomerId: stripeCustomer.id
      }
    });

    logSuccess(`Updated user: tier=${updatedUser.tier}, status=${updatedUser.subscriptionStatus}, stripeCustomerId=${updatedUser.stripeCustomerId}`);

    // Check if subscription record exists
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        stripeSubscriptionId: activeSubscription.id
      }
    });

    if (!existingSubscription) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: stripeCustomer.id,
          stripeSubscriptionId: activeSubscription.id,
          tier: newTier,
          status: newStatus,
          currentPeriodStart: currentPeriodStart,
          currentPeriodEnd: currentPeriodEnd,
          cancelAtPeriodEnd: activeSubscription.cancel_at_period_end || false
        }
      });
      logSuccess(`Created new subscription record: ${activeSubscription.id}`);
    } else {
      await prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          tier: newTier,
          status: newStatus,
          currentPeriodStart: currentPeriodStart,
          currentPeriodEnd: currentPeriodEnd,
          cancelAtPeriodEnd: activeSubscription.cancel_at_period_end || false
        }
      });
      logSuccess(`Updated existing subscription record: ${activeSubscription.id}`);
    }

    return {
      tier: newTier,
      subscriptionStatus: newStatus,
      message: 'Subscription updated successfully'
    };

  } catch (error) {
    logError(`Failed to update user subscription: ${error.message}`);
    throw error;
  }
}

async function main() {
  try {
    if (!email && !testAccess) {
      console.error('❌ Error: Email is required');
      console.error('Usage: node scripts/fix-user-subscription.js <email> [--dry-run] [--verbose] [--customer-id=<id>] [--test-access]');
      process.exit(1);
    }

    if (testAccess) {
      logInfo('🧪 Testing Stripe API access...');
      const accessOk = await testStripeAccess();
      if (accessOk) {
        logSuccess('✅ Stripe API access test completed successfully');
      } else {
        logError('❌ Stripe API access test failed');
        process.exit(1);
      }
      return;
    }

    logInfo(`🚀 Starting subscription fix for user: ${email}`);
    
    if (isDryRun) {
      logWarning(`⚠️  DRY RUN MODE - No changes will be made`);
    }
    
    if (isVerbose) {
      logInfo(`ℹ️  VERBOSE MODE - Detailed logging enabled`);
    }

    // Find user in local database
    const user = await findUserByEmail(email);
    
    // Find Stripe customer
    let stripeCustomer;
    if (customerId) {
      stripeCustomer = await findStripeCustomerById(customerId);
    } else {
      stripeCustomer = await findStripeCustomer(email);
    }
    
    // Find Stripe subscriptions
    const stripeSubscriptions = await findStripeSubscriptions(stripeCustomer.id);
    
    // Update user subscription
    const result = await updateUserSubscription(user, stripeCustomer, stripeSubscriptions);
    
    logSuccess(`✅ Subscription fix completed successfully!`);
    logInfo(`Result: ${result.message}`);
    
  } catch (error) {
    logError(`❌ ERROR: Script failed: ${error.message}`);
    if (isVerbose) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logInfo('Received SIGINT, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  findUserByEmail,
  findStripeCustomer,
  findStripeSubscriptions,
  determineTierFromStripeSubscription,
  updateUserSubscription
};
