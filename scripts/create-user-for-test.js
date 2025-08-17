const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createUserForTest() {
  try {
    console.log('👤 Creating test user for checkout testing...\n');

    const testUserData = {
      email: 'ethanteng+test7@gmail.com',
      password: 'password123',
      tier: 'standard',
      subscriptionStatus: 'inactive'
    };

    console.log('📋 Test User Data:');
    console.log(`   Email: ${testUserData.email}`);
    console.log(`   Tier: ${testUserData.tier}`);
    console.log(`   Status: ${testUserData.subscriptionStatus}`);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: testUserData.email }
    });

    if (existingUser) {
      console.log('✅ User already exists:');
      console.log(`   User ID: ${existingUser.id}`);
      console.log(`   Current Tier: ${existingUser.tier}`);
      console.log(`   Current Status: ${existingUser.subscriptionStatus}`);
      
      // Update the user to match our test data
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          tier: testUserData.tier,
          subscriptionStatus: testUserData.subscriptionStatus
        }
      });
      
      console.log('✅ User updated successfully');
      console.log(`   New Tier: ${updatedUser.tier}`);
      console.log(`   New Status: ${updatedUser.subscriptionStatus}`);
      
    } else {
      // Create new user
      const hashedPassword = await bcrypt.hash(testUserData.password, 10);
      
      const newUser = await prisma.user.create({
        data: {
          email: testUserData.email,
          passwordHash: hashedPassword,
          tier: testUserData.tier,
          subscriptionStatus: testUserData.subscriptionStatus,
          stripeCustomerId: null, // Will be set when subscription is created
          subscriptionExpiresAt: null
        }
      });
      
      console.log('✅ New user created successfully:');
      console.log(`   User ID: ${newUser.id}`);
      console.log(`   Email: ${newUser.email}`);
      console.log(`   Tier: ${newUser.tier}`);
      console.log(`   Status: ${newUser.subscriptionStatus}`);
    }

    console.log('\n🎯 Next Steps:');
    console.log('1. Run the checkout script again: node scripts/create-test-checkout.js');
    console.log('2. Complete the checkout with Stripe test card: 4242 4242 4242 4242');
    console.log('3. This time it should redirect to /register with subscription context');
    console.log('4. The subscription will be properly linked to the existing user');

  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createUserForTest();
