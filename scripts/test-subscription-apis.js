const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testSubscriptionAPIs() {
  try {
    console.log('🧪 Testing subscription data and logic...\n');

    // Get a user with active subscription
    const activeUser = await prisma.user.findFirst({
      where: { subscriptionStatus: 'active' }
    });

    if (!activeUser) {
      console.log('❌ No active user found for testing');
      return;
    }

    console.log(`✅ Testing with user: ${activeUser.email} (${activeUser.id})`);
    console.log(`   Tier: ${activeUser.tier}`);
    console.log(`   Status: ${activeUser.subscriptionStatus}`);

    // Test subscription data retrieval
    console.log('\n📊 Testing subscription data retrieval...');
    
    const userWithSubscriptions = await prisma.user.findUnique({
      where: { id: activeUser.id },
      include: {
        subscriptions: {
          where: {
            status: { in: ['active', 'trialing', 'past_due'] }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (userWithSubscriptions) {
      console.log('✅ User subscription data:');
      console.log(`   Tier: ${userWithSubscriptions.tier}`);
      console.log(`   Status: ${userWithSubscriptions.subscriptionStatus}`);
      console.log(`   Expires At: ${userWithSubscriptions.subscriptionExpiresAt}`);
      console.log(`   Active Subscriptions: ${userWithSubscriptions.subscriptions.length}`);
      
      if (userWithSubscriptions.subscriptions.length > 0) {
        const sub = userWithSubscriptions.subscriptions[0];
        console.log(`   Subscription Details:`);
        console.log(`     ID: ${sub.id}`);
        console.log(`     Stripe ID: ${sub.stripeSubscriptionId}`);
        console.log(`     Status: ${sub.status}`);
        console.log(`     Period End: ${sub.currentPeriodEnd}`);
      }
    }

    // Test different user types
    console.log('\n👥 Testing different user types...');
    
    const userTypes = [
      { status: 'active', tier: 'premium' },
      { status: 'past_due', tier: 'standard' },
      { status: 'canceled', tier: 'premium' },
      { status: 'inactive', tier: 'starter' }
    ];

    for (const userType of userTypes) {
      const user = await prisma.user.findFirst({
        where: { 
          subscriptionStatus: userType.status,
          tier: userType.tier
        },
        include: {
          subscriptions: {
            where: {
              status: { in: ['active', 'trialing', 'past_due'] }
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      if (user) {
        console.log(`\n📋 Testing ${user.email} (${userType.status}/${userType.tier}):`);
        
        // Determine access level based on subscription status
        let accessLevel = 'none';
        let upgradeRequired = false;
        let message = '';
        
        if (user.subscriptionStatus === 'active' && user.subscriptionExpiresAt && new Date() < user.subscriptionExpiresAt) {
          accessLevel = 'full';
          message = `Active ${user.tier} subscription`;
        } else if (user.subscriptionStatus === 'past_due') {
          accessLevel = 'limited';
          upgradeRequired = true;
          
          if (user.subscriptionExpiresAt) {
            const now = new Date();
            const daysRemaining = Math.ceil((user.subscriptionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const gracePeriodDays = Math.max(0, daysRemaining);
            
            if (gracePeriodDays > 0) {
              message = `Payment past due. Limited access for ${gracePeriodDays} more days.`;
            } else {
              message = 'Payment past due. Access will be revoked soon.';
              accessLevel = 'none';
            }
          } else {
            message = 'Payment past due. Please update payment method.';
          }
        } else if (user.subscriptionStatus === 'canceled' || (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt)) {
          accessLevel = 'none';
          upgradeRequired = true;
          message = 'Subscription expired. Please renew to continue.';
        } else if (user.subscriptionStatus === 'inactive' || user.subscriptions.length === 0) {
          accessLevel = user.tier === 'starter' ? 'limited' : 'none';
          upgradeRequired = user.tier !== 'starter';
          message = user.tier === 'starter' 
            ? 'No active subscription. Basic features available.'
            : 'No active subscription. Please subscribe to continue.';
        } else {
          accessLevel = 'limited';
          message = `Subscription status: ${user.subscriptionStatus}`;
        }
        
        console.log(`   Access Level: ${accessLevel}`);
        console.log(`   Upgrade Required: ${upgradeRequired}`);
        console.log(`   Message: ${message}`);
        
        // Test tier-based access control
        const tierHierarchy = ['starter', 'standard', 'premium'];
        const userTierIndex = tierHierarchy.indexOf(user.tier);
        const requiredTierIndex = tierHierarchy.indexOf('standard');
        
        const hasTierAccess = userTierIndex >= requiredTierIndex;
        const hasSubscriptionAccess = accessLevel !== 'none';
        const canAccess = hasTierAccess && hasSubscriptionAccess;
        
        console.log(`   Can access standard features: ${canAccess}`);
        console.log(`   Tier access: ${hasTierAccess} (${user.tier} >= standard)`);
        console.log(`   Subscription access: ${hasSubscriptionAccess} (${accessLevel})`);
      }
    }

    console.log('\n🎉 Subscription logic testing completed!');

  } catch (error) {
    console.error('❌ Error testing subscription APIs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testSubscriptionAPIs();
