const { PrismaClient } = require('@prisma/client');

async function checkUser() {
  const prisma = new PrismaClient();
  
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'ethanteng+test8@gmail.com' }
    });
    
    if (user) {
      console.log('✅ User found:');
      console.log('   ID:', user.id);
      console.log('   Email:', user.email);
      console.log('   Tier:', user.tier);
      console.log('   Subscription Status:', user.subscriptionStatus);
      console.log('   Created:', user.createdAt);
    } else {
      console.log('❌ User not found: ethanteng+test8@gmail.com');
    }
    
    // Also check for any users with similar emails
    const similarUsers = await prisma.user.findMany({
      where: {
        email: {
          contains: 'ethanteng+test'
        }
      },
      select: {
        id: true,
        email: true,
        tier: true,
        subscriptionStatus: true
      }
    });
    
    if (similarUsers.length > 0) {
      console.log('\n🔍 Similar users found:');
      similarUsers.forEach(u => {
        console.log(`   ${u.email} - Tier: ${u.tier}, Status: ${u.subscriptionStatus}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUser();
