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
        const securityType = holding.security_type || holding.type || 'Unknown';
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
      const securityType = holding.security_type || holding.type || 'Unknown';
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

