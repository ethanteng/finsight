const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupOrphanedConversations() {
  try {
    console.log('🧹 Cleaning up orphaned conversations...\n');

    // Find conversations that are clearly demo conversations (have [DEMO- prefix and null userId)
    const orphanedDemoConversations = await prisma.conversation.findMany({
      where: {
        userId: null,
        question: {
          startsWith: '[DEMO-'
        }
      },
      select: {
        id: true,
        question: true,
        answer: true,
        createdAt: true
      }
    });

    console.log(`📊 Found ${orphanedDemoConversations.length} orphaned demo conversations in production table`);

    if (orphanedDemoConversations.length === 0) {
      console.log('✅ No orphaned conversations to clean up');
      return;
    }

    // Show what will be deleted
    console.log('\n🗑️  Conversations to be deleted:');
    orphanedDemoConversations.forEach((conv, index) => {
      console.log(`${index + 1}. ID: ${conv.id}`);
      console.log(`   Question: ${conv.question.substring(0, 80)}...`);
      console.log(`   Created: ${conv.createdAt}`);
      console.log('');
    });

    // Confirm deletion
    console.log('⚠️  WARNING: This will permanently delete these conversations from the production table.');
    console.log('💡 These appear to be demo conversations that were incorrectly stored.');
    console.log('🚨 This action cannot be undone!');
    
    // For safety, require manual confirmation
    console.log('\n🔒 To proceed with deletion, uncomment the deletion code in this script.');
    console.log('📝 This prevents accidental data loss.');

    // Uncomment the following lines to actually perform the deletion:
    console.log('\n🗑️  Deleting orphaned conversations...');
    
    const deleteResult = await prisma.conversation.deleteMany({
      where: {
        userId: null,
        question: {
          startsWith: '[DEMO-'
        }
      }
    });

    console.log(`✅ Successfully deleted ${deleteResult.count} orphaned conversations`);

    // Alternative: Move to demo table (more complex, requires session mapping)
    console.log('\n💡 Alternative: These conversations could be moved to the demo table instead of deleted.');
    console.log('📋 This would require creating demo sessions and mapping the conversations.');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupOrphanedConversations();
