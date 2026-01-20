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
    '# Role\nYou are Linc, an AI financial analyst. Use only the information in this prompt. Provide concise, practical guidance with plain language calculations when needed.\n\n' +
    'IMPORTANT: If a Retirement Portfolio Analysis section is present below, you MUST use it to answer retirement-related questions. Do not provide generic retirement advice when specific analysis data is available.'
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

  if (snapshot.expenseAnalysis) {
    sections.push(`# Expense Analysis (authoritative)\n${snapshot.expenseAnalysis}`);
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

  // Add retirement analysis info request if parameters are missing
  if (snapshot.retirementAnalysisNeedsInfo) {
    sections.push(formatRetirementAnalysisInfoRequest(snapshot.retirementAnalysisNeedsInfo));
  }

  // Add portfolio snapshot from stored retirement analysis if available
  if (snapshot.retirementPortfolioSnapshot) {
    sections.push(formatRetirementPortfolioSnapshot(snapshot.retirementPortfolioSnapshot));
  }

  // Add security metadata from stored retirement analysis if available
  if (snapshot.retirementSecurityMetadata && Object.keys(snapshot.retirementSecurityMetadata).length > 0) {
    sections.push(formatRetirementSecurityMetadata(snapshot.retirementSecurityMetadata));
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

export function formatAccountSummary(accounts: AccountSummaryItem[]): string {
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

export function formatTransactionSummary(transactions: TransactionSummaryItem[]): string {
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

export function formatInvestmentSummary(investments: FinancialContextSnapshot['investments']): string {
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
function formatRetirementAnalysis(analysis: FinancialContextSnapshot['retirementAnalysis'], storedInputParams?: any, currentQuestionParams?: any): string {
  if (!analysis) return '';

  const sections: string[] = [];

  sections.push('# Retirement Portfolio Analysis');
  
  // Add note if this is from stored analysis with input params
  const storedParams = (analysis as any)._storedInputParams;
  if (storedParams) {
    sections.push('## Analysis Parameters');
    sections.push(
      'This analysis was computed with the following parameters:\n' +
      `- Current Age: ${storedParams.currentAge || 'N/A'}\n` +
      `- Retirement Age: ${storedParams.retirementAge || 'N/A'}\n` +
      `- Annual Withdrawal Amount: $${storedParams.annualWithdrawalAmount?.toLocaleString() || 'N/A'}\n` +
      `- Withdrawal Start Age: ${storedParams.withdrawalStartAge || 'N/A'}\n\n` +
      'Note: The current question may have different parameters, but the portfolio composition and analysis results remain valid for reference.'
    );
  }
  
  sections.push('## CRITICAL: You MUST Use This Analysis');
  sections.push(
    'A comprehensive retirement portfolio analysis has been performed on the user\'s holdings. You MUST reference and use this analysis when answering retirement-related questions.\n\n' +
    'DO NOT provide generic retirement advice or calculations. Instead, USE the specific findings from the analysis below:\n' +
    '- Reference the Portfolio Characteristics (Growth Potential, Drawdown Resistance, Withdrawal Fragility, Inflation Protection)\n' +
    '- Discuss the Tradeoffs (both upside and downside)\n' +
    '- Use the Primary Observation as the foundation for your response\n' +
    '- Reference the Portfolio Metrics (withdrawal rate, years of expenses, historical withdrawal rate percentiles)\n' +
    '- Discuss the Stress Test Results (survival rate, depletion percentiles)\n' +
    '- Reference Historical Implications when relevant\n' +
    '- Incorporate the analysis findings into your response naturally, not as a separate section\n\n' +
    'If the user asks about retirement feasibility, withdrawal sustainability, or portfolio adequacy, you MUST base your answer on this analysis.'
  );
  
  sections.push('## Analysis Instructions');
  sections.push(
    'When discussing retirement portfolio analysis:\n' +
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
  sections.push(
    `THIS IS THE KEY FINDING - USE THIS IN YOUR RESPONSE:\n${analysis.summary.primaryObservation}`
  );

  sections.push('## Portfolio Metrics (USE THESE IN YOUR RESPONSE)');
  sections.push(
    `Current Withdrawal Rate: ${(analysis.metrics.withdrawalRate * 100).toFixed(2)}% of portfolio value\n` +
    `Years of Expenses Covered: ${analysis.metrics.yearsOfExpenses.toFixed(1)} years\n` +
    `Equity Allocation: ${analysis.metrics.equityAllocation.toFixed(1)}%\n\n` +
    `Historical Sustainable Withdrawal Rates (based on ${analysis.stressTest.totalSequences} historical sequences):\n` +
    `  - 10th percentile (worst 10%): ${(analysis.metrics.historicalWithdrawalRates.p10 * 100).toFixed(2)}%\n` +
    `  - 25th percentile: ${(analysis.metrics.historicalWithdrawalRates.p25 * 100).toFixed(2)}%\n` +
    `  - 50th percentile (median): ${(analysis.metrics.historicalWithdrawalRates.p50 * 100).toFixed(2)}%\n` +
    `  - 75th percentile: ${(analysis.metrics.historicalWithdrawalRates.p75 * 100).toFixed(2)}%\n` +
    `  - 90th percentile (best 10%): ${(analysis.metrics.historicalWithdrawalRates.p90 * 100).toFixed(2)}%\n\n` +
    `Compare the user's withdrawal rate (${(analysis.metrics.withdrawalRate * 100).toFixed(2)}%) to these historical percentiles when answering feasibility questions.`
  );

  sections.push('## Stress Test Results (CRITICAL FOR FEASIBILITY ASSESSMENT)');
  sections.push(
    `Survival Rate: ${(analysis.stressTest.survivalRate * 100).toFixed(1)}% of ${analysis.stressTest.totalSequences} historical sequences sustained withdrawals without depletion\n\n` +
    `Years Until Portfolio Depletion (if withdrawals fail):\n` +
    `  - 10th percentile (worst case): ${analysis.stressTest.depletionPercentiles.p10?.toFixed(1) || 'N/A'} years\n` +
    `  - 25th percentile: ${analysis.stressTest.depletionPercentiles.p25?.toFixed(1) || 'N/A'} years\n` +
    `  - 50th percentile (median): ${analysis.stressTest.depletionPercentiles.p50?.toFixed(1) || 'N/A'} years\n` +
    `  - 75th percentile: ${analysis.stressTest.depletionPercentiles.p75?.toFixed(1) || 'N/A'} years\n` +
    `  - 90th percentile (best case): ${analysis.stressTest.depletionPercentiles.p90?.toFixed(1) || 'N/A'} years\n\n` +
    `USE THIS DATA: If survival rate is below 70%, mention that historical patterns suggest higher risk. If above 80%, mention historically favorable outcomes. Reference specific depletion years when discussing worst-case scenarios.`
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

/**
 * Format retirement analysis info request for LLM
 * Instructs Linc to ask user for missing retirement analysis parameters
 */
function formatRetirementAnalysisInfoRequest(needsInfo: FinancialContextSnapshot['retirementAnalysisNeedsInfo']): string {
  if (!needsInfo) return '';

  const sections: string[] = [];
  sections.push('# Retirement Analysis - Missing Information');

  const paramLabels: Record<string, string> = {
    currentAge: 'your current age',
    retirementAge: 'your planned retirement age',
    annualWithdrawalAmount: 'your desired annual withdrawal amount (in today\'s dollars)',
    withdrawalStartAge: 'when you plan to start withdrawals'
  };

  const detectedInfo: string[] = [];
  if (needsInfo.detectedParams.currentAge) {
    detectedInfo.push(`Current age: ${needsInfo.detectedParams.currentAge}`);
  }
  if (needsInfo.detectedParams.retirementAge) {
    detectedInfo.push(`Retirement age: ${needsInfo.detectedParams.retirementAge}`);
  }
  if (needsInfo.detectedParams.annualWithdrawalAmount) {
    detectedInfo.push(`Annual withdrawal: $${needsInfo.detectedParams.annualWithdrawalAmount.toLocaleString()}`);
  }
  if (needsInfo.detectedParams.withdrawalStartAge) {
    detectedInfo.push(`Withdrawal start age: ${needsInfo.detectedParams.withdrawalStartAge}`);
  }

  const missingLabels = needsInfo.missingParams.map(p => paramLabels[p] || p);

  sections.push('## Instructions for Linc');
  sections.push(
    'The user asked a retirement-related question, but some required information is missing.\n\n' +
    'YOU MUST ask the user for the missing information before you can provide retirement analysis.\n\n' +
    (detectedInfo.length > 0 
      ? `Information already provided:\n${detectedInfo.map(i => `- ${i}`).join('\n')}\n\n`
      : '') +
    `Missing information needed:\n${missingLabels.map(l => `- ${l}`).join('\n')}\n\n` +
    'Ask the user politely and clearly for this information. Use natural language, not a form.\n' +
    'Example: "To analyze your retirement portfolio, I need a few details. What is your current age, and how much would you like to withdraw annually in retirement?"\n\n' +
    'Once the user provides the missing information, you can run the retirement analysis.'
  );

  return sections.join('\n\n');
}

/**
 * Format retirement portfolio snapshot for LLM consumption
 * Includes holdings and securities from stored retirement analysis
 */
function formatRetirementPortfolioSnapshot(snapshot: FinancialContextSnapshot['retirementPortfolioSnapshot']): string {
  if (!snapshot) return '';

  const sections: string[] = [];
  sections.push('# Retirement Portfolio Snapshot (from stored analysis)');
  sections.push('This portfolio snapshot was captured when the retirement analysis was computed. Use this data when answering questions about the user\'s portfolio composition, holdings, or investments.\n');

  // Format holdings
  if (snapshot.holdings && snapshot.holdings.length > 0) {
    sections.push('## Holdings');
    const holdingsList = snapshot.holdings.map((holding: any, idx: number) => {
      const security = snapshot.securities?.find((s: any) => s.security_id === holding.security_id);
      const ticker = security?.ticker_symbol || holding.ticker_symbol || 'Unknown';
      const name = security?.name || security?.security_name || holding.name || 'Unknown';
      const value = holding.institution_value || holding.value || 0;
      const quantity = holding.quantity || holding.shares || 'N/A';
      
      return `${idx + 1}. ${ticker} - ${name}\n   Value: $${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n   Quantity: ${quantity}`;
    }).join('\n\n');
    sections.push(holdingsList);
  }

  // Format securities summary
  if (snapshot.securities && snapshot.securities.length > 0) {
    sections.push('\n## Securities Summary');
    sections.push(`Total Securities: ${snapshot.securities.length}`);
    const securitiesList = snapshot.securities.map((security: any) => {
      const ticker = security.ticker_symbol || 'Unknown';
      const name = security.name || security.security_name || 'Unknown';
      const type = security.type || security.security_type || 'Unknown';
      return `- ${ticker}: ${name} (${type})`;
    }).join('\n');
    sections.push(securitiesList);
  }

  return sections.join('\n\n');
}

/**
 * Format security metadata for LLM consumption
 * Includes expense ratios, asset classes, and other metadata from database
 */
function formatRetirementSecurityMetadata(metadata: FinancialContextSnapshot['retirementSecurityMetadata']): string {
  if (!metadata || Object.keys(metadata).length === 0) return '';

  const sections: string[] = [];
  sections.push('# Security Metadata (from stored analysis)');
  sections.push('This metadata provides detailed information about the securities in the user\'s portfolio. Use this when discussing expense ratios, asset classes, fund categories, or other security-specific details.\n');

  const metadataEntries = Object.entries(metadata);
  
  for (const [ticker, meta] of metadataEntries) {
    const metaSections: string[] = [];
    metaSections.push(`## ${ticker}: ${meta.securityName}`);
    
    if (meta.assetClass) {
      metaSections.push(`Asset Class: ${meta.assetClass}`);
    }
    
    if (meta.fundCategory) {
      metaSections.push(`Fund Category: ${meta.fundCategory}`);
    }
    
    if (meta.expenseRatio !== undefined && meta.expenseRatio !== null) {
      // Expense ratios should be stored as decimals (0.0003 = 0.03%)
      // However, some data sources may return them as percentages (0.03 = 0.03%)
      // Detect format: if value is >= 0.01, it's likely already a percentage; otherwise it's a decimal
      // Typical expense ratios are < 0.01 when stored as decimals (e.g., 0.0003 for 0.03%)
      const expenseRatio = meta.expenseRatio >= 0.01 
        ? meta.expenseRatio  // Already in percentage form (0.03 = 0.03%)
        : meta.expenseRatio * 100;  // Convert from decimal (0.0003 -> 0.03%)
      metaSections.push(`Expense Ratio: ${expenseRatio.toFixed(2)}%`);
    }
    
    if (meta.geographicFocus) {
      metaSections.push(`Geographic Focus: ${meta.geographicFocus}`);
    }
    
    metaSections.push(`Type: ${meta.isETF ? 'ETF' : 'Mutual Fund'}`);
    metaSections.push(`Data Source: ${meta.provider === 'fmp' ? 'Financial Modeling Prep API' : 'Inferred'}`);
    
    sections.push(metaSections.join('\n'));
  }

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

