const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function investigateOrphanedConversations() {
  try {
    console.log('🔍 Investigating orphaned conversations...\n');

    // Get all conversations
    const allConversations = await prisma.conversation.findMany({
      select: {
        id: true,
        question: true,
        createdAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`📊 Total conversations: ${allConversations.length}`);

    // Find conversations without users
    const orphanedConversations = allConversations.filter(conv => !conv.user);
    console.log(`⚠️  Orphaned conversations (no user): ${orphanedConversations.length}`);

    if (orphanedConversations.length > 0) {
      console.log('\n🔍 Orphaned conversation details:');
      orphanedConversations.forEach((conv, index) => {
        console.log(`${index + 1}. ID: ${conv.id}`);
        console.log(`   Question: ${conv.question.substring(0, 50)}...`);
        console.log(`   Created: ${conv.createdAt}`);
        console.log(`   User ID: ${conv.userId}`);
        console.log('');
      });
    }

    // Find conversations with null userId but existing user
    const conversationsWithNullUserId = allConversations.filter(conv => !conv.userId && conv.user);
    console.log(`❓ Conversations with null userId but existing user: ${conversationsWithNullUserId.length}`);

    // Find conversations with userId but no user (shouldn't happen with proper foreign keys)
    const conversationsWithUserIdButNoUser = allConversations.filter(conv => conv.userId && !conv.user);
    console.log(`🚨 Conversations with userId but no user: ${conversationsWithUserIdButNoUser.length}`);

    if (conversationsWithUserIdButNoUser.length > 0) {
      console.log('\n🚨 Conversations with userId but no user (data integrity issue):');
      conversationsWithUserIdButNoUser.forEach((conv, index) => {
        console.log(`${index + 1}. ID: ${conv.id}`);
        console.log(`   Question: ${conv.question.substring(0, 50)}...`);
        console.log(`   Created: ${conv.createdAt}`);
        console.log(`   User ID: ${conv.userId}`);
        console.log('');
      });
    }

    // Check demo conversations for comparison
    const demoConversations = await prisma.demoConversation.findMany({
      select: {
        id: true,
        question: true,
        createdAt: true,
        sessionId: true
      }
    });

    console.log(`\n🎭 Demo conversations: ${demoConversations.length}`);

    // Summary
    console.log('\n📋 Summary:');
    console.log(`- Total conversations: ${allConversations.length}`);
    console.log(`- Orphaned conversations: ${orphanedConversations.length}`);
    console.log(`- Data integrity issues: ${conversationsWithUserIdButNoUser.length}`);
    console.log(`- Demo conversations: ${demoConversations.length}`);

    if (orphanedConversations.length > 0) {
      console.log('\n💡 Recommendation: Consider cleaning up orphaned conversations or linking them to users.');
    }

  } catch (error) {
    console.error('❌ Error investigating conversations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

investigateOrphanedConversations();
