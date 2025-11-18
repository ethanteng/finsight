#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Determine project root first - look for package.json
let projectRoot = process.cwd();
if (__dirname.includes('/src/scripts')) {
  projectRoot = path.join(__dirname, '..');
} else if (__dirname.includes('/scripts')) {
  projectRoot = path.join(__dirname, '..');
}

// Verify project root by checking for package.json
if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
  const parentRoot = path.join(projectRoot, '..');
  if (fs.existsSync(path.join(parentRoot, 'package.json'))) {
    projectRoot = parentRoot;
  } else {
    projectRoot = process.cwd();
  }
}

// Resolve dist path
const possiblePaths = [
  path.join(projectRoot, 'dist'),
  path.join(projectRoot, 'src/dist'),
  path.join(__dirname, '../dist'),
  path.join(__dirname, '../../dist'),
  path.join(process.cwd(), 'dist'),
  path.join(process.cwd(), 'src/dist'),
  '/opt/render/project/src/dist',
  '/opt/render/project/dist',
];

let distPath = null;
for (const testPath of possiblePaths) {
  if (fs.existsSync(testPath) && fs.existsSync(path.join(testPath, 'services'))) {
    distPath = testPath;
    break;
  }
}

if (!distPath) {
  console.error(`❌ Error: Could not find dist folder. Please build the project first.`);
  process.exit(1);
}

const { PrismaClient } = require('@prisma/client');
const { TransactionCategorizationService } = require(path.join(distPath, 'services/transaction-categorization-service'));
const { processTransactionData } = require(path.join(distPath, 'plaid'));

require('dotenv').config({ path: '.env.local' });

const prisma = new PrismaClient();

async function backfillCategorization() {
  const startTime = Date.now();
  console.log('🔄 Starting backfill of transaction categorization...\n');

  try {
    // Find all transactions without aiCategory
    const uncategorizedTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { aiCategory: null },
          { aiCategory: '' },
        ],
      },
      include: {
        account: true,
      },
      take: 1000, // Process in batches to avoid memory issues
    });

    console.log(`📊 Found ${uncategorizedTransactions.length} uncategorized transactions\n`);

    if (uncategorizedTransactions.length === 0) {
      console.log('✅ All transactions are already categorized!');
      return;
    }

    let categorized = 0;
    let failed = 0;
    let skipped = 0;

    for (const dbTx of uncategorizedTransactions) {
      try {
        // Skip pending transactions - they shouldn't be categorized yet
        if (dbTx.pending) {
          skipped++;
          continue;
        }

        // Reconstruct transaction object for categorization
        const transaction = {
          transaction_id: dbTx.plaidTransactionId,
          account_id: dbTx.account.plaidAccountId,
          amount: dbTx.amount,
          date: dbTx.date.toISOString().split('T')[0],
          name: dbTx.name,
          category: dbTx.category ? dbTx.category.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
          category_id: dbTx.categoryId || null,
          pending: dbTx.pending,
          merchant_name: dbTx.merchantName || null,
          payment_channel: dbTx.paymentChannel || null,
          iso_currency_code: dbTx.currency || 'USD',
        };

        // Process transaction data
        const processedTx = processTransactionData(transaction);

        // Prepare account data
        const accountData = {
          account_id: dbTx.account.plaidAccountId,
          type: dbTx.account.type,
          subtype: dbTx.account.subtype || undefined,
          name: dbTx.account.name,
        };

        // Categorize transaction
        const categorizedTx = await TransactionCategorizationService.categorizeTransaction(
          processedTx,
          accountData
        );

        if (categorizedTx.transaction_type) {
          // Update transaction with categorization
          await prisma.transaction.update({
            where: { id: dbTx.id },
            data: {
              aiCategory: categorizedTx.transaction_type,
              aiCategoryReason: categorizedTx.categorization_reason || null,
              categoryComparedAt: new Date(),
            },
          });

          categorized++;
          if (categorized % 10 === 0) {
            console.log(`   ✅ Categorized ${categorized}/${uncategorizedTransactions.length} transactions...`);
          }
        } else {
          failed++;
          console.warn(`   ⚠️  Failed to categorize transaction ${dbTx.plaidTransactionId}: No transaction_type returned`);
        }
      } catch (error: any) {
        failed++;
        console.error(`   ❌ Error categorizing transaction ${dbTx.plaidTransactionId}: ${error.message}`);
      }
    }

    console.log(`\n📊 Backfill Summary:`);
    console.log(`   ✅ Categorized: ${categorized}`);
    console.log(`   ⏭️  Skipped (pending): ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📈 Total processed: ${categorized + skipped + failed}`);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Completed in ${duration}s`);
  } catch (error: any) {
    console.error(`\n💥 Fatal error:`, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// If run directly, execute immediately
if (require.main === module) {
  console.log('🔄 Transaction Categorization Backfill');
  console.log('=====================================\n');

  backfillCategorization()
    .then(() => {
      console.log('\n🎉 Backfill completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💀 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { backfillCategorization };

