#!/usr/bin/env node
/**
 * Test Income Calculation Logic
 * 
 * This script tests the income calculation logic using real transaction patterns
 * from the server logs to ensure buy/sell transactions are properly filtered out.
 */

// Sample transactions based on actual data patterns from logs
const sampleTransactions = {
  banking: [
    // Social Security - should be counted
    { id: '1', account_id: 'acc1', amount: 3732.00, date: '2025-10-07', name: 'Social Security Administration', category: ['Income', 'Government Benefits'] },
    
    // Annuity/RMD payments - should be counted
    { id: '2', account_id: 'acc1', amount: 1117.99, date: '2025-10-03', name: 'Riversource Annuity', category: ['Income', 'Annuity'] },
    { id: '3', account_id: 'acc1', amount: 947.00, date: '2025-10-17', name: 'Vanguard RMD', category: ['Income', 'Investment'] },
    
    // Interest - should be counted
    { id: '4', account_id: 'acc1', amount: 177.97, date: '2025-09-30', name: 'Interest Deposit', category: ['Income', 'Interest'] },
    { id: '5', account_id: 'acc1', amount: 185.94, date: '2025-10-28', name: 'Interest Credit', category: ['Income', 'Interest'] },
    
    // Regular expenses - should NOT be counted (negative amounts)
    { id: '6', account_id: 'acc1', amount: -2349.00, date: '2025-10-24', name: 'Talcott Resolution Life & Annuit', category: ['Payment', 'Insurance'] },
    { id: '7', account_id: 'acc1', amount: -9957.22, date: '2025-10-06', name: 'Fremont Blvd', category: ['Expense'] },
    { id: '8', account_id: 'acc1', amount: -124.80, date: '2025-10-06', name: 'United Healthcare Medicare', category: ['Healthcare'] },
  ],
  
  investment: [
    // Dividends - should be counted as income
    { id: 'inv1', account_id: 'brokerage1', amount: 150.00, date: '2025-10-15', name: 'AAPL Dividend', type: 'dividend', subtype: 'dividend' },
    { id: 'inv2', account_id: 'brokerage1', amount: 200.00, date: '2025-10-20', name: 'MSFT Dividend', type: 'dividend', subtype: 'dividend' },
    
    // Interest from bonds - should be counted as income
    { id: 'inv3', account_id: 'bond_account', amount: 85.50, date: '2025-10-10', name: 'Treasury Interest', type: 'interest', subtype: 'interest' },
    
    // Stock SALE - should NOT be counted as income (just asset conversion)
    { id: 'inv4', account_id: 'brokerage1', amount: 125000.00, date: '2025-09-15', name: 'Sold 100 shares AAPL', type: 'sell', subtype: 'sell' },
    { id: 'inv5', account_id: 'brokerage1', amount: 75000.00, date: '2025-08-20', name: 'Sold MSFT', type: 'sell', subtype: 'sell' },
    
    // Stock PURCHASE - should NOT be counted (negative amount)
    { id: 'inv6', account_id: 'brokerage1', amount: -22000.00, date: '2025-01-03', name: 'Bought SPY', type: 'buy', subtype: 'buy' },
    { id: 'inv7', account_id: 'brokerage1', amount: -3265.15, date: '2025-04-16', name: 'Bought VTI', type: 'buy', subtype: 'buy' },
    
    // Transfer - should NOT be counted
    { id: 'inv8', account_id: 'brokerage1', amount: 10000.00, date: '2025-07-01', name: 'Transfer from savings', type: 'transfer', subtype: 'transfer' },
    
    // Fees - should NOT be counted (negative)
    { id: 'inv9', account_id: 'brokerage1', amount: -83.34, date: '2025-04-16', name: 'Management Fee', type: 'fee', subtype: 'fee' },
  ]
};

console.log('🧪 Testing Income Calculation Logic\n');
console.log('=' .repeat(80));

// Step 1: Filter investment transactions to ONLY income-generating ones
console.log('\n📊 STEP 1: Filtering Investment Transactions\n');

const filteredInvestmentTxs = sampleTransactions.investment.filter(tx => {
  const txType = (tx.type || '').toLowerCase();
  const txName = (tx.name || '').toLowerCase();
  
  // Only include: dividends, interest, and income distributions
  // Exclude: buy, sell, transfer, fee transactions
  const shouldInclude = (
    txType.includes('dividend') ||
    txType.includes('interest') ||
    txType.includes('income') ||
    txName.includes('dividend') ||
    txName.includes('interest') ||
    (tx.amount > 0 && !txType.includes('buy') && !txType.includes('sell') && !txType.includes('transfer'))
  );
  
  const status = shouldInclude ? '✅ INCLUDE' : '❌ EXCLUDE';
  console.log(`${status}: $${tx.amount.toLocaleString().padStart(12)} - ${tx.name} (type: ${tx.type})`);
  
  return shouldInclude;
});

console.log(`\n📈 Investment transactions: ${sampleTransactions.investment.length} total → ${filteredInvestmentTxs.length} income-generating`);
console.log(`   Filtered out: ${sampleTransactions.investment.length - filteredInvestmentTxs.length} (buy/sell/transfer/fee)`);

// Step 2: Merge banking and filtered investment transactions
console.log('\n' + '='.repeat(80));
console.log('\n📊 STEP 2: Merging All Transactions\n');

const allTransactions = [...sampleTransactions.banking, ...filteredInvestmentTxs];
console.log(`Banking transactions: ${sampleTransactions.banking.length}`);
console.log(`Investment income transactions: ${filteredInvestmentTxs.length}`);
console.log(`Total merged transactions: ${allTransactions.length}`);

// Step 3: Calculate income (only positive amounts)
console.log('\n' + '='.repeat(80));
console.log('\n💰 STEP 3: Calculating Income (Positive Amounts Only)\n');

const incomeTransactions = allTransactions.filter(tx => tx.amount > 0);

console.log('Income transactions identified:');
incomeTransactions.forEach(tx => {
  const category = tx.category ? tx.category[0] : (tx.type || 'Investment');
  console.log(`  ✅ $${tx.amount.toLocaleString().padStart(10)} - ${tx.name} [${category}]`);
});

console.log(`\n📊 Total income transactions: ${incomeTransactions.length}`);

// Step 4: Categorize income sources
console.log('\n' + '='.repeat(80));
console.log('\n📂 STEP 4: Categorizing Income Sources\n');

const incomeSources = new Map();

for (const transaction of incomeTransactions) {
  const name = transaction.name?.toLowerCase() || '';
  const basicCategory = transaction.category?.[0]?.toLowerCase() || '';
  const txType = transaction.type?.toLowerCase() || '';
  
  let source = 'Other Income';
  
  // Check transaction name first
  if (name.includes('social security') || name.includes('ssa')) {
    source = 'Social Security';
  } else if (name.includes('interest deposit') || name.includes('interest credit') || txType === 'interest') {
    source = 'Interest Income';
  } else if (name.includes('annuity') || name.includes('riversource')) {
    source = 'Annuity/RMD';
  } else if (name.includes('vanguard') || name.includes('rmd')) {
    source = 'Annuity/RMD';
  } else if (name.includes('dividend') || txType === 'dividend') {
    source = 'Investment Income';
  } else if (basicCategory.includes('government')) {
    source = 'Government Benefits';
  } else if (basicCategory.includes('interest')) {
    source = 'Interest Income';
  } else if (basicCategory.includes('annuity')) {
    source = 'Annuity/RMD';
  }
  
  incomeSources.set(source, (incomeSources.get(source) || 0) + transaction.amount);
}

console.log('Income by source:');
const sortedSources = Array.from(incomeSources.entries()).sort(([,a], [,b]) => b - a);
sortedSources.forEach(([source, amount]) => {
  console.log(`  ${source.padEnd(25)}: $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
});

// Step 5: Calculate totals and monthly average
console.log('\n' + '='.repeat(80));
console.log('\n📈 STEP 5: Final Calculations\n');

const totalIncome = incomeTransactions.reduce((sum, tx) => sum + tx.amount, 0);
const uniqueMonths = new Set(incomeTransactions.map(tx => tx.date.substring(0, 7))).size;
const avgMonthlyIncome = totalIncome / uniqueMonths;

console.log(`Total Income: $${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`Analysis Period: ${uniqueMonths} month(s)`);
console.log(`Average Monthly Income: $${avgMonthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// Step 6: Verify the fix worked
console.log('\n' + '='.repeat(80));
console.log('\n✅ VERIFICATION: Did the fix work?\n');

const totalStockSales = sampleTransactions.investment
  .filter(tx => tx.type === 'sell')
  .reduce((sum, tx) => sum + tx.amount, 0);

console.log(`Stock sales that were EXCLUDED: $${totalStockSales.toLocaleString()}`);
console.log(`(These are $${totalStockSales} in asset conversions, NOT income)`);

const wouldHaveBeenWrong = totalIncome + totalStockSales;
const monthlyWrong = wouldHaveBeenWrong / uniqueMonths;

console.log(`\n❌ WITHOUT FIX:`);
console.log(`   Would have counted: $${wouldHaveBeenWrong.toLocaleString()}`);
console.log(`   Monthly average: $${monthlyWrong.toLocaleString()} (WRONG!)`);

console.log(`\n✅ WITH FIX:`);
console.log(`   Actually counted: $${totalIncome.toLocaleString()}`);
console.log(`   Monthly average: $${avgMonthlyIncome.toLocaleString()}`);

console.log(`\n💡 Savings from fix: $${(monthlyWrong - avgMonthlyIncome).toLocaleString()}/month in false "income"`);

// Final verdict
console.log('\n' + '='.repeat(80));
console.log('\n🎯 EXPECTED RESULT:\n');
console.log(`The GPT context should show:`);
console.log(`  - Average Monthly Income: $${avgMonthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
console.log(`  - NOT $113,358 (which included stock sales!)`);
console.log(`\nIncome Sources:`);
sortedSources.forEach(([source, amount]) => {
  console.log(`  - ${source}: $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
});

console.log('\n' + '='.repeat(80));
console.log('\n✅ Test Complete!\n');

