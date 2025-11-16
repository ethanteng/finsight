#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const prisma = new PrismaClient();

// Determine Plaid mode from environment variable
const plaidMode = process.env.PLAID_MODE || 'sandbox';
const useSandbox = plaidMode === 'sandbox';

const getPlaidCredentials = () => {
  if (plaidMode === 'production') {
    return {
      clientId: process.env.PLAID_CLIENT_ID_PROD || process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET_PROD || process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV_PROD || 'production'
    };
  } else {
    return {
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      env: 'sandbox'
    };
  }
};

const credentials = getPlaidCredentials();
const configuration = new Configuration({
  basePath: useSandbox ? PlaidEnvironments.sandbox : PlaidEnvironments[credentials.env],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': credentials.clientId,
      'PLAID-SECRET': credentials.secret,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

async function checkTokenStatus() {
  try {
    // First, check total count
    const totalCount = await prisma.accessToken.count();
    console.log(`Total access tokens in database: ${totalCount}`);

    // Get all access tokens (including inactive ones to check their status)
    const tokens = await prisma.accessToken.findMany({
      // where: { isActive: true }, // Check all tokens to see their actual status
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`Found ${tokens.length} access tokens\n`);

    for (const token of tokens) {
      console.log(`\n=== Token ${token.id.substring(0, 8)}... ===`);
      console.log(`User: ${token.user?.email || token.userId || 'Unknown'}`);
      console.log(`Institution: ${token.institutionName || 'Unknown'}`);
      console.log(`Created: ${token.createdAt}`);
      console.log(`Last Checked: ${token.lastChecked || 'Never'}`);
      console.log(`Last Error: ${token.lastError || 'None'}`);
      console.log(`Is Active: ${token.isActive}`);
      console.log(`Item ID: ${token.itemId || 'None'}`);

      // Check if token has accounts
      const accounts = await prisma.account.findMany({
        where: {
          user: {
            accessTokens: {
              some: { id: token.id }
            }
          }
        },
        select: {
          id: true,
          plaidAccountId: true,
          name: true,
          institution: true
        }
      });

      console.log(`Associated Accounts: ${accounts.length}`);
      if (accounts.length > 0) {
        accounts.forEach(acc => {
          console.log(`  - ${acc.name} (${acc.institution})`);
        });
      }

      // Validate token with Plaid
      try {
        console.log('\n🔍 Validating token with Plaid...');
        const accountsResponse = await plaidClient.accountsGet({
          access_token: token.token
        });

        console.log(`✅ Token is VALID`);
        console.log(`   Plaid returned ${accountsResponse.data.accounts.length} accounts`);

        // Update token status if it was marked inactive
        if (!token.isActive || token.lastError) {
          console.log(`   ⚠️  Token was marked inactive but is actually valid - updating status`);
          await prisma.accessToken.update({
            where: { id: token.id },
            data: {
              isActive: true,
              lastError: null,
              lastChecked: new Date()
            }
          });
        } else {
          // Just update lastChecked
          await prisma.accessToken.update({
            where: { id: token.id },
            data: {
              lastChecked: new Date()
            }
          });
        }
      } catch (error) {
        const errorCode = error?.response?.data?.error_code;
        const errorMessage = error?.response?.data?.error_message || error.message;

        console.log(`❌ Token validation FAILED`);
        console.log(`   Error Code: ${errorCode || 'Unknown'}`);
        console.log(`   Error Message: ${errorMessage}`);

        // Update token status
        await prisma.accessToken.update({
          where: { id: token.id },
          data: {
            isActive: errorCode !== 'ITEM_LOGIN_REQUIRED', // Keep active if just needs re-auth
            lastError: errorCode || errorMessage,
            lastChecked: new Date()
          }
        });
      }
    }

    console.log(`\n\n✅ Token status check complete`);
  } catch (error) {
    console.error('Error checking token status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTokenStatus();

