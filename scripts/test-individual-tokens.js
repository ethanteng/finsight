const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

async function testIndividualTokens() {
  const prisma = new PrismaClient();
  try {
    
    console.log('🔍 Testing Individual Access Tokens\n');
    
    // Get all access tokens for the user
    const accessTokens = await prisma.accessToken.findMany({
      where: { userId: 'cmejmaiqc0004rzcmqwnsqsl4' }
    });
    
    console.log(`Found ${accessTokens.length} access tokens\n`);
    
    for (let i = 0; i < accessTokens.length; i++) {
      const token = accessTokens[i];
      console.log(`\n🔑 Testing Token ${i + 1}:`);
      console.log(`   ID: ${token.id}`);
      console.log(`   Item ID: ${token.itemId}`);
      console.log(`   Created: ${token.createdAt}`);
      console.log(`   Token preview: ${token.token.substring(0, 20)}...`);
      
      try {
        // Test the token with Plaid API
        const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
        
        const credentials = {
          env: 'production',
          clientId: process.env.PLAID_CLIENT_ID,
          secret: process.env.PLAID_SECRET
        };
        
        const configuration = new Configuration({
          basePath: PlaidEnvironments[credentials.env],
          baseOptions: {
            headers: {
              'PLAID-CLIENT-ID': credentials.clientId,
              'PLAID-SECRET': credentials.secret,
            },
          },
        });
        
        const plaidClient = new PlaidApi(configuration);
        
        // Test accounts endpoint
        const accountsResponse = await plaidClient.accountsGet({
          access_token: token.token,
        });
        
        console.log(`   ✅ Accounts endpoint: SUCCESS`);
        console.log(`   📊 Found ${accountsResponse.data.accounts.length} accounts`);
        
        // Show account details
        accountsResponse.data.accounts.forEach((account, index) => {
          console.log(`      ${index + 1}. ${account.name} (${account.type}/${account.subtype})`);
          if (account.institution_name) {
            console.log(`         Institution: ${account.institution_name}`);
          }
        });
        
        // Test balances endpoint
        const balancesResponse = await plaidClient.accountsBalanceGet({
          access_token: token.token,
        });
        
        console.log(`   ✅ Balances endpoint: SUCCESS`);
        console.log(`   💰 Found ${balancesResponse.data.accounts.length} balance records`);
        
        // Show balance details
        balancesResponse.data.accounts.forEach((balance, index) => {
          const account = accountsResponse.data.accounts.find(acc => acc.account_id === balance.account_id);
          if (account) {
            console.log(`      ${index + 1}. ${account.name}: $${balance.balances.current} (current), $${balance.balances.available} (available)`);
          }
        });
        
        // Test institution endpoint
        try {
          const institutionResponse = await plaidClient.institutionsGetById({
            institution_id: accountsResponse.data.accounts[0]?.institution_id,
            country_codes: ['US'],
            options: {
              include_optional_metadata: true
            }
          });
          
          console.log(`   ✅ Institution endpoint: SUCCESS`);
          console.log(`   🏦 Institution: ${institutionResponse.data.institution.name}`);
        } catch (instError) {
          console.log(`   ❌ Institution endpoint: FAILED - ${instError.message}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Plaid API test: FAILED`);
        console.log(`      Error: ${error.message}`);
        
        if (error.response?.data) {
          console.log(`      Details: ${JSON.stringify(error.response.data, null, 2)}`);
        }
      }
      
      console.log('   ' + '─'.repeat(50));
    }
    
    console.log('\n🎯 Summary:');
    console.log('   - Check which token(s) still have access to Bank of America');
    console.log('   - Look for any error messages about token scope or access');
    console.log('   - Verify that the correct accounts are returned for each token');
    
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testIndividualTokens();
