const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function setSubscriptionStatus(email, status) {
  try {
    console.log(`🔄 Setting subscription status for ${email} to: ${status}`);

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { subscriptions: true }
    });

    if (!user) {
      console.log('❌ User not found:', email);
      return;
    }

    console.log('✅ Found user:', user.email);
    console.log('📊 Current subscription status:', user.subscriptionStatus);

    // Update user subscription status
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        subscriptionStatus: status === 'active' ? 'active' : 'inactive'
      }
    });

    // Update subscription status if it exists
    if (user.subscriptions.length > 0) {
      const subscription = user.subscriptions[0];
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status }
      });
      console.log('✅ Updated subscription status to:', status);
    }

    console.log('✅ Updated user subscription status to:', status === 'active' ? 'active' : 'inactive');
    
    console.log('\n🎯 Now you can test the user experience:');
    console.log(`1. Log in as ${email}`);
    console.log(`2. Observe the access level for status: ${status}`);
    console.log(`3. Check what features are available/restricted`);

  } catch (error) {
    console.error('❌ Error setting subscription status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get command line arguments
const email = process.argv[2] || 'ethanteng+test17@gmail.com';
const status = process.argv[3] || 'past_due';

console.log('Usage: node scripts/set-subscription-status.js [email] [status]');
console.log('Available statuses: active, past_due, unpaid, canceled, incomplete');
console.log(`\nSetting ${email} to ${status}...\n`);

setSubscriptionStatus(email, status);
