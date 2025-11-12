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
      '- Treat amounts as USD unless clearly specified otherwise.'
  );

  // Use financial summary if available (reduces prompt size)
  if (snapshot.financialSummary?.financialOverview) {
    const overview = snapshot.financialSummary.financialOverview;
    sections.push(`# Financial Overview\n` +
      `Net Worth: $${overview.netWorth.toFixed(2)}\n` +
      `Total Cash: $${overview.totalCash.toFixed(2)}\n` +
      `Total Investments: $${overview.totalInvestments.toFixed(2)}\n` +
      `Total Debt: $${overview.totalDebt.toFixed(2)}` +
      (overview.homeValue !== null ? `\nHome Value: $${overview.homeValue.toFixed(2)}` : '')
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

  return sections.join('\n\n').trim();
}

function formatAccountSummary(accounts: AccountSummaryItem[]): string {
  if (accounts.length === 0) {
    return 'No account data available.';
  }

  return accounts
    .map(account => {
      const amount = `$${account.balance.toFixed(2)}`;
      const institution = account.institution ? ` at ${account.institution}` : '';
      return `- ${account.name} (${account.type}/${account.subtype}): ${amount}${institution}`;
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
      return `- ${tx.date} | ${tx.typeLabel} ${tx.name}: ${amount}${category}`;
    })
    .join('\n');
}

function formatInvestmentSummary(investments: FinancialContextSnapshot['investments']): string {
  if (!investments) {
    return '';
  }

  const header = `Total Portfolio Value: $${investments.totalValue.toFixed(2)}\nHoldings: ${investments.holdingCount}`;
  const holdings = investments.summaryLines.join('\n');
  return `${header}\n${holdings}`.trim();
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

