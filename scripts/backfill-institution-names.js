/**
 * Backfill institution names for existing AccessTokens
 * 
 * This script:
 * 1. Fetches all AccessTokens that have NULL or institution_id in institutionName
 * 2. Calls Plaid API to get human-readable institution names
 * 3. Updates the database with the correct names
 */

const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

async function backfillInstitutionNames() {
  console.log('🔄 Starting institution name backfill...\n');
  
  try {
    // Fetch all tokens
    const tokens = await prisma.accessToken.findMany({
      select: {
        id: true,
        token: true,
        institutionName: true,
        itemId: true
      }
    });
    
    console.log(`Found ${tokens.length} total tokens\n`);
    
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const token of tokens) {
      // Skip if already has a valid human-readable name (doesn't start with 'ins_')
      if (token.institutionName && !token.institutionName.startsWith('ins_')) {
        console.log(`✓ Skipping token ${token.id} - already has name: ${token.institutionName}`);
        skipped++;
        continue;
      }
      
      try {
        console.log(`🔍 Processing token ${token.id}...`);
        
        // Get item info from Plaid
        const itemResponse = await plaidClient.itemGet({
          access_token: token.token
        });
        
        const institutionId = itemResponse.data.item.institution_id;
        
        if (!institutionId) {
          console.log(`⚠️  No institution_id found for token ${token.id}`);
          failed++;
          continue;
        }
        
        // Get human-readable institution name
        const institutionResponse = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ['US']
        });
        
        const institutionName = institutionResponse.data.institution.name;
        
        // Update database
        await prisma.accessToken.update({
          where: { id: token.id },
          data: {
            institutionName: institutionName,
            itemId: itemResponse.data.item.item_id
          }
        });
        
        console.log(`✅ Updated token ${token.id}: ${institutionName}\n`);
        updated++;
        
      } catch (error) {
        console.error(`❌ Failed to process token ${token.id}:`, error.response?.data || error.message);
        
        // Mark as inactive if token is invalid
        if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED' || 
            error.response?.data?.error_code === 'INVALID_ACCESS_TOKEN') {
          await prisma.accessToken.update({
            where: { id: token.id },
            data: {
              isActive: false,
              lastError: error.response?.data?.error_code,
              lastChecked: new Date()
            }
          });
          console.log(`⚠️  Marked token ${token.id} as inactive\n`);
        }
        
        failed++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📝 Total: ${tokens.length}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
backfillInstitutionNames()
  .then(() => {
    console.log('\n✅ Backfill complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill failed:', error);
    process.exit(1);
  });

