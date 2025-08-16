const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function setUserTier(email, tier) {
  try {
    console.log(`🔄 Setting tier for ${email} to: ${tier}`);

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('❌ User not found:', email);
      return;
    }

    console.log('✅ Found user:', user.email);
    console.log('📊 Current tier:', user.tier);
    console.log('📊 Current subscription status:', user.subscriptionStatus);

    // Update user tier
    await prisma.user.update({
      where: { id: user.id },
      data: { tier }
    });

    console.log('✅ Updated user tier to:', tier);
    
    console.log('\n🎯 Now you can test the user experience:');
    console.log(`1. Log in as ${email}`);
    console.log(`2. Observe the access level for tier: ${tier}`);
    console.log(`3. Check if subscription warnings appear`);

  } catch (error) {
    console.error('❌ Error setting user tier:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get command line arguments
const email = process.argv[2] || 'ethanteng@gmail.com';
const tier = process.argv[3] || 'standard';

console.log('Usage: node scripts/set-user-tier.js [email] [tier]');
console.log('Available tiers: starter, standard, premium');
console.log(`\nSetting ${email} to ${tier}...\n`);

setUserTier(email, tier);
