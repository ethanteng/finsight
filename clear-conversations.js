const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearConversations() {
  try {
    const userId = 'cmdpkh1mc0000rzopyhr9h0xd';
    
    console.log(`Clearing conversations for user: ${userId}`);
    
    // Delete all conversations for this user
    const result = await prisma.conversation.deleteMany({
      where: { userId: userId }
    });
    
    console.log(`Deleted ${result.count} conversations`);
    
    // Verify no conversations remain
    const remaining = await prisma.conversation.findMany({
      where: { userId: userId }
    });
    
    console.log(`Remaining conversations: ${remaining.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearConversations(); 