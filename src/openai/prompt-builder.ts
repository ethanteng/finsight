import { PromptPayload, FinancialContextSnapshot, AccountSummaryItem, TransactionSummaryItem, ConversationEntry } from './types';

interface PromptBuilderArgs {
  question: string;
  snapshot: FinancialContextSnapshot;
  conversationHistory: ConversationEntry[];
  contextInstruction?: string;
}

export function buildPromptPayload(args: PromptBuilderArgs): PromptPayload {
  const { question, snapshot, conversationHistory, contextInstruction } = args;

  const systemPrompt = buildSystemPrompt(snapshot);

  const messages: PromptPayload['messages'] = [
    { role: 'system', content: systemPrompt }
  ];

  if (contextInstruction) {
    messages.push({ role: 'user', content: contextInstruction });
  }

  for (const conv of conversationHistory) {
    messages.push({ role: 'user', content: conv.question });
    messages.push({ role: 'assistant', content: conv.answer });
  }

  messages.push({ role: 'user', content: question });

  return {
    systemPrompt,
    messages
  };
}

function buildSystemPrompt(snapshot: FinancialContextSnapshot): string {
  const sections: string[] = [];

  sections.push(
    '# Role\nYou are Linc, an AI financial analyst. Use only the information in this prompt. Provide concise, practical guidance with plain language calculations when needed.'
  );

  sections.push(
    '# Response Guidelines\n' +
      '- Write in structured paragraphs; use short bullet points only when summarising actions.\n' +
      '- Do not include JSON or LaTeX.\n' +
      '- If data is missing, state the limitation before offering alternatives.\n' +
      '- Treat amounts as USD unless clearly specified otherwise.\n' +
      '- IMPORTANT: You have access to the user\'s financial data including home address when provided. If home value is shown as "not estimated yet" or unavailable, you can still reference that the user owns a home at the provided address. Do not state that you lack access to home value data - instead, acknowledge the home ownership and address if available.\n' +
      '- CRITICAL: When calculating expenses, you MUST follow this process: (1) FIRST, filter to ONLY transactions with type label (EXPENSE) or (FEE) - ignore all other transaction types including (TRANSFER_IN), (TRANSFER_OUT), (INCOME), (BUY), (SELL), (DEPOSIT), (WITHDRAWAL), etc. (2) THEN, group the filtered expense transactions by their category labels. (3) If a transaction is marked as (EXPENSE) or (FEE) but lacks a category label, try to infer a reasonable category from the transaction name. (4) Do NOT group transactions as "Unknown" - if you see a large "Unknown" amount, investigate the transaction names to determine appropriate categories. (5) Remember: transactions without (EXPENSE) or (FEE) type labels should NEVER be included in expense calculations, regardless of their category or amount.'
  );

  // Use financial summary if available (reduces prompt size)
  if (snapshot.financialSummary?.financialOverview) {
    const overview = snapshot.financialSummary.financialOverview;
    let homeValueLine = '';
    if (overview.homeValue !== null && overview.homeValue !== undefined) {
      if (overview.homeValue > 0) {
        homeValueLine = `\nHome Value: $${overview.homeValue.toFixed(2)}`;
      } else {
        // Value is 0 but include note that user owns home
        homeValueLine = '\nHome Value: Not estimated yet (user owns a home)';
      }
    }
    sections.push(`# Financial Overview\n` +
      `Net Worth: $${overview.netWorth.toFixed(2)}\n` +
      `Total Cash: $${overview.totalCash.toFixed(2)}\n` +
      `Total Investments: $${overview.totalInvestments.toFixed(2)}\n` +
      `Total Debt: $${overview.totalDebt.toFixed(2)}${homeValueLine}`
    );
  }

  const accountSummary = formatAccountSummary(snapshot.accounts);
  const transactionSummary = formatTransactionSummary(snapshot.bankingTransactions);
  
  // Use summary investment portfolio if available, otherwise use detailed snapshot
  let investmentSummary = '';
  if (snapshot.financialSummary?.investmentPortfolio) {
    const portfolio = snapshot.financialSummary.investmentPortfolio;
    investmentSummary = `Total Portfolio Value: $${portfolio.totalValue.toFixed(2)}\n` +
      `Holdings: ${portfolio.holdingsCount}\n` +
      `Securities: ${portfolio.securityCount}\n` +
      `Asset Allocation:\n` +
      portfolio.assetAllocation.map(aa => 
        `- ${aa.type}: $${aa.value.toFixed(2)} (${aa.percentage.toFixed(1)}%)`
      ).join('\n');
    
    // Add detailed holdings if available
    if (snapshot.investments?.holdings && snapshot.investments.holdings.length > 0) {
      const holdingsDetails = snapshot.investments.holdings.map(holding => {
        const ticker = holding.ticker_symbol || '';
        const name = holding.security_name || holding.ticker_symbol || 'Unknown Security';
        const quantity = holding.quantity || 0;
        const costBasis = holding.cost_basis || 0;
        const currentValue = holding.institution_value || 0;
        const securityType = holding.security_type || 'Unknown';
        const gainLoss = currentValue - costBasis;
        const gainLossPercent = costBasis > 0 ? ((gainLoss / costBasis) * 100).toFixed(2) : '0.00';
        
        const tickerPart = ticker ? `${ticker} (` : '';
        const tickerClose = ticker ? ')' : '';
        return `- ${tickerPart}${name}${tickerClose} [${securityType}]: Quantity ${quantity.toFixed(4)}, Cost Basis $${costBasis.toFixed(2)}, Current Value $${currentValue.toFixed(2)} (${gainLoss >= 0 ? '+' : ''}$${gainLoss.toFixed(2)}, ${gainLossPercent}%)`;
      }).join('\n');
      
      investmentSummary += `\n\nDetailed Holdings:\n${holdingsDetails}`;
    }
  } else if (snapshot.investments) {
    investmentSummary = formatInvestmentSummary(snapshot.investments);
  }

  if (snapshot.incomeAnalysis) {
    sections.push(`# Income Analysis (authoritative)\n${snapshot.incomeAnalysis}`);
  }

  if (snapshot.marketContext) {
    sections.push(`# Market Context\n${snapshot.marketContext}`);
  }

  if (snapshot.searchContext) {
    sections.push(`# Real-Time Reference Data\n${snapshot.searchContext}`);
  }

  if (snapshot.userProfile) {
    sections.push(`# User Profile\n${snapshot.userProfile}`);
  }

  if (snapshot.homeValueSummary) {
    sections.push(`# Home Value\n${snapshot.homeValueSummary}`);
  }

  sections.push(`# Accounts\n${accountSummary}`);
  sections.push(`# Recent Transactions\n${transactionSummary}`);

  if (investmentSummary) {
    sections.push(`# Investments\n${investmentSummary}`);
  }

  // Add retirement analysis if available
  if (snapshot.retirementAnalysis) {
    sections.push(formatRetirementAnalysis(snapshot.retirementAnalysis));
  }

  sections.push(buildTierDetails(snapshot));

  const fullPrompt = sections.join('\n\n').trim();
  
  // ✅ CRITICAL: Deduplicate "LIABILITIES INFORMATION" sections in the final prompt
  // This catches duplicates regardless of where they're added (profile, GPT-generated, etc.)
  return deduplicateLiabilitySections(fullPrompt);
}

/**
 * Remove duplicate "LIABILITIES INFORMATION" sections from prompt text
 * This ensures no duplicate sections appear in the GPT context
 */
function deduplicateLiabilitySections(promptText: string): string {
  // Match "LIABILITIES INFORMATION:" followed by content until the next section header or end
  const liabilityPattern = /LIABILITIES INFORMATION:[\s\S]*?(?=\n\n(?:# |[A-Z][A-Z\s]+:)|$)/gi;
  const matches = [...promptText.matchAll(liabilityPattern)];
  
  if (!matches || matches.length <= 1) {
    // No duplicates found
    return promptText;
  }
  
  // Keep only the most complete version (longest one)
  const sortedMatches = matches.map(m => ({
    text: m[0],
    index: m.index!,
    length: m[0].length
  })).sort((a, b) => b.length - a.length);
  
  const keepMatch = sortedMatches[0];
  const removeMatches = sortedMatches.slice(1);
  
  // Build deduplicated text by removing duplicates
  let deduplicated = promptText;
  
  // Remove duplicates in reverse order (to preserve indices)
  for (const match of removeMatches.sort((a, b) => b.index - a.index)) {
    // Remove the match, preserving surrounding structure
    const before = deduplicated.slice(0, match.index);
    const after = deduplicated.slice(match.index + match.text.length);
    
    // Clean up any double newlines that might result
    deduplicated = (before.trimEnd() + '\n\n' + after.trimStart()).replace(/\n{3,}/g, '\n\n');
  }
  
  // Ensure we have the kept match (in case it was removed)
  if (!deduplicated.includes('LIABILITIES INFORMATION:')) {
    // Find insertion point (before "# Accounts" section if present, or after User Profile)
    const accountsIndex = deduplicated.indexOf('# Accounts');
    if (accountsIndex > 0) {
      const beforeAccounts = deduplicated.slice(0, accountsIndex).trimEnd();
      const afterAccounts = deduplicated.slice(accountsIndex);
      deduplicated = beforeAccounts + '\n\n' + keepMatch.text.trim() + '\n\n' + afterAccounts;
    } else {
      // Insert after User Profile section if present
      const userProfileEnd = deduplicated.indexOf('# User Profile');
      if (userProfileEnd >= 0) {
        const nextSectionMatch = deduplicated.slice(userProfileEnd).match(/\n\n# [A-Z]/);
        if (nextSectionMatch && nextSectionMatch.index) {
          const insertIndex = userProfileEnd + nextSectionMatch.index;
          deduplicated = deduplicated.slice(0, insertIndex) + '\n\n' + keepMatch.text.trim() + deduplicated.slice(insertIndex);
        } else {
          deduplicated = deduplicated.trimEnd() + '\n\n' + keepMatch.text.trim();
        }
      } else {
        deduplicated = deduplicated.trimEnd() + '\n\n' + keepMatch.text.trim();
      }
    }
  }
  
  // Final cleanup of excessive newlines
  deduplicated = deduplicated.replace(/\n{3,}/g, '\n\n');
  
  if (removeMatches.length > 0) {
    console.warn(`⚠️ deduplicateLiabilitySections: Removed ${removeMatches.length} duplicate "LIABILITIES INFORMATION" section(s) from system prompt`);
  }
  
  return deduplicated;
}

function formatAccountSummary(accounts: AccountSummaryItem[]): string {
  if (accounts.length === 0) {
    return 'No account data available.';
  }

  return accounts
    .map(account => {
      const amount = `$${account.balance.toFixed(2)}`;
      const institution = account.institution ? ` at ${account.institution}` : '';
      const interestRate = account.interestRate ? ` (Interest Rate: ${account.interestRate}%)` : '';
      return `- ${account.name} (${account.type}/${account.subtype || account.type}): ${amount}${institution}${interestRate}`;
    })
    .join('\n');
}

function formatTransactionSummary(transactions: TransactionSummaryItem[]): string {
  if (transactions.length === 0) {
    return 'No recent transactions available.';
  }

  return transactions
    .map(tx => {
      const amount = tx.amount >= 0 ? `$${tx.amount.toFixed(2)}` : `-$${Math.abs(tx.amount).toFixed(2)}`;
      const category = tx.categoryLabel ? ` • ${tx.categoryLabel}` : '';
      const merchant = tx.merchantName && tx.merchantName !== tx.name ? ` (Merchant: ${tx.merchantName})` : '';
      const account = tx.accountName ? ` [Account: ${tx.accountName}${tx.accountInstitution ? ` at ${tx.accountInstitution}` : ''}]` : '';
      return `- ${tx.date} | ${tx.typeLabel} ${tx.name}${merchant}: ${amount}${category}${account}`;
    })
    .join('\n');
}

function formatInvestmentSummary(investments: FinancialContextSnapshot['investments']): string {
  if (!investments) {
    return '';
  }

  const header = `Total Portfolio Value: $${investments.totalValue.toFixed(2)}\nHoldings: ${investments.holdingCount}`;
  
  // Use detailed holdings if available, otherwise fall back to summary lines
  if (investments.holdings && investments.holdings.length > 0) {
    const holdingsDetails = investments.holdings.map(holding => {
      const ticker = holding.ticker_symbol || '';
      const name = holding.security_name || holding.ticker_symbol || 'Unknown Security';
      const quantity = holding.quantity || 0;
      const costBasis = holding.cost_basis || 0;
      const currentValue = holding.institution_value || 0;
      const securityType = holding.security_type || 'Unknown';
      const gainLoss = currentValue - costBasis;
      const gainLossPercent = costBasis > 0 ? ((gainLoss / costBasis) * 100).toFixed(2) : '0.00';
      
      const tickerPart = ticker ? `${ticker} (` : '';
      const tickerClose = ticker ? ')' : '';
      return `- ${tickerPart}${name}${tickerClose} [${securityType}]: Quantity ${quantity.toFixed(4)}, Cost Basis $${costBasis.toFixed(2)}, Current Value $${currentValue.toFixed(2)} (${gainLoss >= 0 ? '+' : ''}$${gainLoss.toFixed(2)}, ${gainLossPercent}%)`;
    }).join('\n');
    
    return `${header}\n\nDetailed Holdings:\n${holdingsDetails}`.trim();
  } else if (investments.summaryLines && investments.summaryLines.length > 0) {
    const holdings = investments.summaryLines.join('\n');
    return `${header}\n${holdings}`.trim();
  }
  
  return header;
}

/**
 * Format retirement analysis for LLM consumption
 * Includes explicit instructions for descriptive-only language
 */
function formatRetirementAnalysis(analysis: FinancialContextSnapshot['retirementAnalysis']): string {
  if (!analysis) return '';

  const sections: string[] = [];

  sections.push('# Retirement Portfolio Analysis');
  
  sections.push('## Analysis Instructions');
  sections.push(
    'IMPORTANT: When discussing retirement portfolio analysis:\n' +
    '1. Use descriptive language from summary.characteristics. Avoid categorical terms like "too risky" or "too conservative."\n' +
    '2. Frame observations in terms of historical ranges and percentiles, not single numbers. Use "median historical outcome" or "typical result across sequences" instead of "expected returns" or "average returns."\n' +
    '3. Never claim certainty about future performance. Always use phrases like "based on historical patterns" or "historical data suggests" or "historical central tendency shows."\n' +
    '4. Every portfolio characterization must include both an upside and a downside tradeoff. Never present a characteristic without its corresponding tradeoff.\n' +
    '5. Never reference the "4% rule" or present any withdrawal rate as normative or safe.\n' +
    '6. When discussing worst sequences, only mention named historical periods if they appear in stressTest.notablePeriods.\n' +
    '7. Always emphasize that past performance does not predict future results.\n' +
    '8. Use "historically wide buffer" or "historically high survivability" instead of "margin of safety" or "exceptional sustainability."\n' +
    '9. Never suggest specific securities. Only discuss general allocation principles.\n' +
    '10. If dataQuality.completeness < 0.8, state: "Analysis based on partial data. Some holdings may have incomplete information."\n' +
    '11. If dataQuality.metadataConfidence === "low", state: "Some security classifications were inferred and may be inaccurate."\n' +
    '12. If dataQuality.portfolioMappingConfidence === "low" or "medium", state: "Portfolio mapped to historical asset classes using proxies. Some holdings may not perfectly match historical indices."\n' +
    '13. If dataQuality.assumptions.length > 0, explicitly state: "Analysis assumptions: [list assumptions from dataQuality.assumptions]"\n' +
    '14. If survival rate is in lower tercile relative to portfolios with similar equity allocations and horizon, describe as "historically fragile given withdrawal timing" rather than "too risky."'
  );

  sections.push('## Portfolio Characteristics');
  sections.push(
    `Growth Potential: ${analysis.summary.characteristics.growthPotential}\n` +
    `Drawdown Resistance: ${analysis.summary.characteristics.drawdownResistance}\n` +
    `Withdrawal Fragility: ${analysis.summary.characteristics.withdrawalFragility}\n` +
    `Inflation Protection: ${analysis.summary.characteristics.inflationProtection}\n` +
    `Confidence: ${analysis.summary.confidence}`
  );

  sections.push('## Tradeoffs');
  sections.push(
    `Upside: ${analysis.summary.tradeoffs.upside}\n` +
    `Downside: ${analysis.summary.tradeoffs.downside}`
  );

  sections.push('## Primary Observation');
  sections.push(analysis.summary.primaryObservation);

  sections.push('## Portfolio Metrics');
  sections.push(
    `Equity Allocation: ${analysis.metrics.equityAllocation.toFixed(1)}%\n` +
    `Withdrawal Rate: ${(analysis.metrics.withdrawalRate * 100).toFixed(2)}%\n` +
    `Years of Expenses: ${analysis.metrics.yearsOfExpenses.toFixed(1)} years\n` +
    `Historical Sustainable Withdrawal Rates (percentiles):\n` +
    `  - 10th percentile: ${(analysis.metrics.historicalWithdrawalRates.p10 * 100).toFixed(2)}%\n` +
    `  - 25th percentile: ${(analysis.metrics.historicalWithdrawalRates.p25 * 100).toFixed(2)}%\n` +
    `  - 50th percentile (median): ${(analysis.metrics.historicalWithdrawalRates.p50 * 100).toFixed(2)}%\n` +
    `  - 75th percentile: ${(analysis.metrics.historicalWithdrawalRates.p75 * 100).toFixed(2)}%\n` +
    `  - 90th percentile: ${(analysis.metrics.historicalWithdrawalRates.p90 * 100).toFixed(2)}%`
  );

  sections.push('## Stress Test Results');
  sections.push(
    `Total Historical Sequences Analyzed: ${analysis.stressTest.totalSequences}\n` +
    `Survival Rate: ${(analysis.stressTest.survivalRate * 100).toFixed(1)}% of sequences sustained withdrawals\n` +
    `Depletion Percentiles (years until depletion):\n` +
    `  - 10th percentile: ${analysis.stressTest.depletionPercentiles.p10?.toFixed(1) || 'N/A'} years\n` +
    `  - 25th percentile: ${analysis.stressTest.depletionPercentiles.p25?.toFixed(1) || 'N/A'} years\n` +
    `  - 50th percentile (median): ${analysis.stressTest.depletionPercentiles.p50?.toFixed(1) || 'N/A'} years\n` +
    `  - 75th percentile: ${analysis.stressTest.depletionPercentiles.p75?.toFixed(1) || 'N/A'} years\n` +
    `  - 90th percentile: ${analysis.stressTest.depletionPercentiles.p90?.toFixed(1) || 'N/A'} years`
  );

  if (analysis.stressTest.notablePeriods && analysis.stressTest.notablePeriods.length > 0) {
    sections.push('## Notable Historical Periods');
    sections.push(
      'The following historical periods appeared among worst-case sequences:\n' +
      analysis.stressTest.notablePeriods.map(np => 
        `- ${np.period} (ranked #${np.rank} by ${np.metric})`
      ).join('\n')
    );
  }

  if (analysis.historicalImplications.length > 0) {
    sections.push('## Historical Implications');
    sections.push(
      analysis.historicalImplications.map(impl => 
        `${impl.category.toUpperCase()}: ${impl.observation}\nHistorical Context: ${impl.historicalContext}`
      ).join('\n\n')
    );
  }

  sections.push('## Data Quality');
  sections.push(
    `Completeness: ${(analysis.dataQuality.completeness * 100).toFixed(1)}%\n` +
    `Price History Coverage: ${(analysis.dataQuality.priceHistoryCoverage * 100).toFixed(1)}%\n` +
    `Metadata Confidence: ${analysis.dataQuality.metadataConfidence}\n` +
    `Portfolio Mapping Confidence: ${analysis.dataQuality.portfolioMappingConfidence}\n` +
    `Proxied Value Percentage: ${(analysis.dataQuality.proxiedValuePercentage * 100).toFixed(1)}%`
  );

  if (analysis.dataQuality.assumptions.length > 0) {
    sections.push('## Analysis Assumptions');
    sections.push(analysis.dataQuality.assumptions.join('\n'));
  }

  if (analysis.summary.timelineBucketNote) {
    sections.push(`## Timeline Note\n${analysis.summary.timelineBucketNote}`);
  }

  sections.push('## Disclaimers');
  sections.push(analysis.disclaimers.join('\n'));

  return sections.join('\n\n');
}

function buildTierDetails(snapshot: FinancialContextSnapshot): string {
  const { tierContext } = snapshot;
  const pieces: string[] = [];

  pieces.push(`# Tier Information\nCurrent Tier: ${String(tierContext.tierInfo.currentTier).toUpperCase()}`);

  if (tierContext.tierInfo.availableSources.length > 0) {
    pieces.push(
      'Available Data Sources:\n' +
        tierContext.tierInfo.availableSources.map(source => `- ${source}`).join('\n')
    );
  }

  if (tierContext.upgradeHints.length > 0) {
    pieces.push(
      'Upgrade Suggestions:\n' +
        tierContext.upgradeHints
          .map(hint => `- ${hint.feature}: ${hint.benefit}`)
          .join('\n')
    );
  }

  return pieces.join('\n\n');
}

