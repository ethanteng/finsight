const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createTestSubscriptions() {
  try {
    console.log('🧪 Creating test users with subscription data...\n');

    // Create test users with different subscription statuses
    const testUsers = [
      {
        email: 'starter@test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        tier: 'starter',
        subscriptionStatus: 'inactive',
        stripeCustomerId: null,
        subscriptionExpiresAt: null
      },
      {
        email: 'standard@test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        tier: 'standard',
        subscriptionStatus: 'active',
        stripeCustomerId: 'cus_test_standard_123',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      {
        email: 'premium@test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        tier: 'premium',
        subscriptionStatus: 'active',
        stripeCustomerId: 'cus_test_premium_456',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      {
        email: 'past_due@test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        tier: 'standard',
        subscriptionStatus: 'past_due',
        stripeCustomerId: 'cus_test_past_due_789',
        subscriptionExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) // 5 days grace period
      },
      {
        email: 'canceled@test.com',
        passwordHash: await bcrypt.hash('password123', 10),
        tier: 'premium',
        subscriptionStatus: 'canceled',
        stripeCustomerId: 'cus_test_canceled_101',
        subscriptionExpiresAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      }
    ];

    console.log('👥 Creating test users...');
    
    for (const userData of testUsers) {
      const user = await prisma.user.create({
        data: userData
      });
      console.log(`✅ Created user: ${user.email} (${user.id}) - Tier: ${user.tier}, Status: ${user.subscriptionStatus}`);
    }

    // Create subscription records for active users
    console.log('\n💳 Creating subscription records...');
    
    const activeUsers = await prisma.user.findMany({
      where: {
        subscriptionStatus: { in: ['active', 'past_due'] }
      }
    });

    for (const user of activeUsers) {
      const subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeCustomerId: user.stripeCustomerId,
          stripeSubscriptionId: `sub_test_${user.id}`,
          tier: user.tier,
          status: user.subscriptionStatus,
          currentPeriodStart: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          currentPeriodEnd: user.subscriptionExpiresAt,
          cancelAtPeriodEnd: false
        }
      });
      console.log(`✅ Created subscription: ${subscription.id} for user ${user.email}`);
    }

    // Create some subscription events
    console.log('\n📝 Creating subscription events...');
    
    const subscriptions = await prisma.subscription.findMany();
    
    for (const subscription of subscriptions) {
      const event = await prisma.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          stripeEventId: `evt_test_${subscription.id}_${Date.now()}`,
          eventType: subscription.status === 'active' ? 'customer.subscription.created' : 'customer.subscription.updated',
          eventData: {
            subscription_id: subscription.stripeSubscriptionId,
            customer_id: subscription.stripeCustomerId,
            status: subscription.status,
            tier: subscription.tier
          }
        }
      });
      console.log(`✅ Created event: ${event.id} for subscription ${subscription.id}`);
    }

    console.log('\n🎉 Test subscription data created successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Users created: ${testUsers.length}`);
    console.log(`   - Subscriptions created: ${subscriptions.length}`);
    console.log(`   - Events created: ${subscriptions.length}`);

    console.log('\n🔑 Test credentials:');
    testUsers.forEach(user => {
      console.log(`   ${user.email} / password123 (Tier: ${user.tier}, Status: ${user.subscriptionStatus})`);
    });

  } catch (error) {
    console.error('❌ Error creating test subscriptions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestSubscriptions();
