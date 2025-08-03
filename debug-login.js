const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugLogin() {
  try {
    console.log('🔍 Debugging login system...');
    
    // Test with one of your users
    const testEmail = 'ethanteng+4@gmail.com';
    
    console.log(`\n📊 Testing login for: ${testEmail}`);
    
    // Check current state
    const userBefore = await prisma.user.findUnique({
      where: { email: testEmail },
      select: {
        id: true,
        email: true,
        lastLoginAt: true,
        createdAt: true,
        isActive: true
      }
    });
    
    console.log('Before login attempt:');
    console.log(`- User exists: ${userBefore ? 'Yes' : 'No'}`);
    if (userBefore) {
      console.log(`- lastLoginAt: ${userBefore.lastLoginAt}`);
      console.log(`- Created: ${userBefore.createdAt}`);
      console.log(`- Active: ${userBefore.isActive}`);
    }
    
    // Simulate the login process
    console.log('\n🔄 Simulating login process...');
    
    if (userBefore) {
      // Update lastLoginAt manually (this is what the login endpoint should do)
      const updatedUser = await prisma.user.update({
        where: { id: userBefore.id },
        data: { lastLoginAt: new Date() },
        select: {
          id: true,
          email: true,
          lastLoginAt: true,
          updatedAt: true
        }
      });
      
      console.log('After login update:');
      console.log(`- lastLoginAt: ${updatedUser.lastLoginAt}`);
      console.log(`- Updated: ${updatedUser.updatedAt}`);
    }
    
    // Check all users again
    console.log('\n📊 All users after test:');
    const allUsers = await prisma.user.findMany({
      select: {
        email: true,
        lastLoginAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    allUsers.forEach(user => {
      const hasLogin = user.lastLoginAt ? '✅' : '❌';
      console.log(`- ${user.email}: ${hasLogin} ${user.lastLoginAt || 'Never logged in'}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugLogin(); 