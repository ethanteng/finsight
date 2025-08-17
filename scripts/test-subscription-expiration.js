const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function testSubscriptionExpiration() {
  try {
    console.log('🧪 Testing subscription expiration scenarios...\n');

    // Find the user
    let user = await prisma.user.findUnique({
      where: { email: 'ethanteng+test17@gmail.com' },
      include: {
        subscriptions: true
      }
    });

    if (!user) {
      console.log('❌ User not found. Creating test user first...');
      
      // Create the user if it doesn't exist
      user = await prisma.user.create({
        data: {
          email: 'ethanteng+test17@gmail.com',
          passwordHash: 'test_hash',
          tier: 'standard',
          subscriptionStatus: 'active'
        }
      });
      console.log('✅ Created test user:', user.email);
    }

    // Find or create subscription
    let subscription = await prisma.subscription.findFirst({
      where: { userId: user.id }
    });

    if (!subscription) {
      console.log('❌ No subscription found. Creating test subscription...');
      
      subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeSubscriptionId: 'sub_test_expired',
          stripeCustomerId: 'cus_test_expired',
          status: 'active',
          tier: 'standard',
          currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          currentPeriodEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),   // 1 day ago
          cancelAtPeriodEnd: false
        }
      });
      console.log('✅ Created test subscription');
    }

    console.log('\n📊 Current subscription status:', subscription.status);
    console.log('📅 Current period end:', subscription.currentPeriodEnd);

    // Test different expiration scenarios
    const scenarios = [
      {
        name: 'Past Due (Failed Payment)',
        status: 'past_due',
        description: 'Payment failed, user in grace period'
      },
      {
        name: 'Unpaid (Grace Period Ended)',
        status: 'unpaid',
        description: 'Grace period ended, subscription suspended'
      },
      {
        name: 'Canceled (User Cancelled)',
        status: 'canceled',
        description: 'User cancelled subscription'
      },
      {
        name: 'Incomplete (Initial Payment Failed)',
        status: 'incomplete',
        description: 'Initial payment failed during setup'
      }
    ];

    console.log('\n🔄 Testing different subscription states:');
    
    for (const scenario of scenarios) {
      console.log(`\n--- ${scenario.name} ---`);
      console.log(`Description: ${scenario.description}`);
      
      // Update subscription status
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { 
          status: scenario.status,
          currentPeriodEnd: scenario.status === 'canceled' ? new Date() : subscription.currentPeriodEnd
        }
      });

      // Update user subscription status
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          subscriptionStatus: scenario.status === 'active' ? 'active' : 'inactive'
        }
      });

      console.log(`✅ Updated subscription to: ${scenario.status}`);
      console.log(`✅ Updated user status to: ${scenario.status === 'active' ? 'active' : 'inactive'}`);
      
      // Test what the user would see
      console.log(`\n👤 User Experience:`);
      if (scenario.status === 'past_due') {
        console.log('   - User sees limited access (grace period)');
        console.log('   - Payment update prompt shown');
        console.log('   - 7-day grace period active');
      } else if (scenario.status === 'unpaid') {
        console.log('   - User sees payment required message');
        console.log('   - Access restricted to basic features');
        console.log('   - Redirected to payment update');
      } else if (scenario.status === 'canceled') {
        console.log('   - User sees subscription ended message');
        console.log('   - Access restricted to starter tier');
        console.log('   - Option to resubscribe shown');
      } else if (scenario.status === 'incomplete') {
        console.log('   - User sees setup incomplete message');
        console.log('   - Access restricted until payment setup');
        console.log('   - Redirected to complete setup');
      }

      // Wait a moment between scenarios
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Reset to active for normal testing
    console.log('\n🔄 Resetting to active status...');
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { 
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: 'active' }
    });

    console.log('✅ Reset subscription to active status');
    console.log('✅ Reset user status to active');

    console.log('\n🎯 Test Complete!');
    console.log('You can now test the different subscription states by:');
    console.log('1. Running this script with different scenarios');
    console.log('2. Logging in as ethanteng+test17@gmail.com');
    console.log('3. Observing the different access levels and messages');

  } catch (error) {
    console.error('❌ Error testing subscription expiration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testSubscriptionExpiration();
