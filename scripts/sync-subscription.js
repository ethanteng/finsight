const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

// Environment-aware price to tier mapping
const PRICE_TO_TIER = {
  [process.env.STRIPE_PRICE_STARTER || 'price_starter']: 'starter',
  [process.env.STRIPE_PRICE_STANDARD || 'price_standard']: 'standard',
  [process.env.STRIPE_PRICE_PREMIUM || 'price_premium']: 'premium'
};

async function syncSubscription(subscriptionId) {
  try {
    console.log(`Syncing subscription: ${subscriptionId}`);
    
    // Get subscription from database
    const subscription = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
      include: { user: true }
    });
    
    if (!subscription) {
      console.log('Subscription not found in database');
      return;
    }
    
    console.log('Current subscription:', {
      id: subscription.id,
      tier: subscription.tier,
      status: subscription.status,
      userId: subscription.userId
    });
    
    // Get current Stripe subscription to check price
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    console.log('Stripe subscription:', {
      id: stripeSubscription.id,
      status: stripeSubscription.status,
      metadata: stripeSubscription.metadata,
      price: stripeSubscription.items.data[0]?.price?.id
    });
    
    // Determine correct tier based on price
    const currentPrice = stripeSubscription.items.data[0]?.price?.id;
    const correctTier = PRICE_TO_TIER[currentPrice] || 'starter';
    
    console.log(`Price ${currentPrice} maps to tier: ${correctTier}`);
    
    if (correctTier !== subscription.tier) {
      console.log(`Updating tier from ${subscription.tier} to ${correctTier}`);
      
      // Update subscription tier
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { tier: correctTier }
      });
      
      // Update user tier
      if (subscription.user) {
        await prisma.user.update({
          where: { id: subscription.user.id },
          data: { tier: correctTier }
        });
        
        console.log(`Updated user ${subscription.user.email} tier to ${correctTier}`);
      }
      
      console.log('Subscription synced successfully');
    } else {
      console.log('Subscription tier is already correct');
    }
    
  } catch (error) {
    console.error('Error syncing subscription:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get subscription ID from command line or use default
const subscriptionId = process.argv[2] || 'sub_1Rwu9lB0fNhwjxZItgbuqOHs';

if (!subscriptionId) {
  console.error('Please provide a subscription ID');
  process.exit(1);
}

syncSubscription(subscriptionId);
