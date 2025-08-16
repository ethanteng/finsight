const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkSubscriptions() {
  try {
    console.log('🔍 Checking subscription data in database...\n');

    // Check users with subscription data
    const usersWithSubscriptions = await prisma.user.findMany({
      where: {
        OR: [
          { stripeCustomerId: { not: null } },
          { subscriptionStatus: { not: 'inactive' } },
          { subscriptionExpiresAt: { not: null } }
        ]
      },
      select: {
        id: true,
        email: true,
        tier: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        stripeCustomerId: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`📊 Users with subscription data: ${usersWithSubscriptions.length}`);
    
    if (usersWithSubscriptions.length > 0) {
      console.log('\n👥 Users with subscription data:');
      usersWithSubscriptions.forEach((user, index) => {
        console.log(`\n${index + 1}. User ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Tier: ${user.tier}`);
        console.log(`   Subscription Status: ${user.subscriptionStatus}`);
        console.log(`   Expires At: ${user.subscriptionExpiresAt || 'N/A'}`);
        console.log(`   Stripe Customer ID: ${user.stripeCustomerId || 'N/A'}`);
        console.log(`   Created: ${user.createdAt}`);
        console.log(`   Updated: ${user.updatedAt}`);
      });
    }

    // Check subscription records
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            tier: true
          }
        }
      }
    });

    console.log(`\n📋 Subscription records: ${subscriptions.length}`);
    
    if (subscriptions.length > 0) {
      console.log('\n💳 Subscription records:');
      subscriptions.forEach((sub, index) => {
        console.log(`\n${index + 1}. Subscription ID: ${sub.id}`);
        console.log(`   Stripe Subscription ID: ${sub.stripeSubscriptionId}`);
        console.log(`   User: ${sub.user.email} (${sub.user.id})`);
        console.log(`   Tier: ${sub.tier}`);
        console.log(`   Status: ${sub.status}`);
        console.log(`   Period Start: ${sub.currentPeriodStart}`);
        console.log(`   Period End: ${sub.currentPeriodEnd}`);
        console.log(`   Cancel at Period End: ${sub.cancelAtPeriodEnd}`);
        console.log(`   Created: ${sub.createdAt}`);
        console.log(`   Updated: ${sub.updatedAt}`);
      });
    }

    // Check subscription events
    const subscriptionEvents = await prisma.subscriptionEvent.findMany({
      orderBy: { processedAt: 'desc' },
      take: 10
    });

    console.log(`\n📝 Recent subscription events: ${subscriptionEvents.length}`);
    
    if (subscriptionEvents.length > 0) {
      console.log('\n📅 Recent subscription events:');
      subscriptionEvents.forEach((event, index) => {
        console.log(`\n${index + 1}. Event ID: ${event.id}`);
        console.log(`   Stripe Event ID: ${event.stripeEventId}`);
        console.log(`   Type: ${event.eventType}`);
        console.log(`   Processed: ${event.processedAt}`);
        console.log(`   Subscription ID: ${event.subscriptionId || 'N/A'}`);
      });
    }

    // Check total user count
    const totalUsers = await prisma.user.count();
    console.log(`\n👤 Total users in database: ${totalUsers}`);

    // Check users by tier
    const usersByTier = await prisma.user.groupBy({
      by: ['tier'],
      _count: {
        tier: true
      }
    });

    console.log('\n📊 Users by tier:');
    usersByTier.forEach(group => {
      console.log(`   ${group.tier}: ${group._count.tier}`);
    });

    // Check users by subscription status
    const usersByStatus = await prisma.user.groupBy({
      by: ['subscriptionStatus'],
      _count: {
        subscriptionStatus: true
      }
    });

    console.log('\n📊 Users by subscription status:');
    usersByStatus.forEach(group => {
      console.log(`   ${group.subscriptionStatus}: ${group._count.subscriptionStatus}`);
    });

  } catch (error) {
    console.error('❌ Error checking subscriptions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSubscriptions();
