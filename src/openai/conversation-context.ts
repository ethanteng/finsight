import { ConversationEntry } from './types';

const STOP_WORDS = new Set([
  'what',
  'when',
  'where',
  'which',
  'would',
  'should',
  'could'
]);

const IMPORTANT_TERMS = [
  'account',
  'balance',
  'portfolio',
  'investment',
  'savings',
  'checking',
  'retirement',
  'ira',
  'roth',
  '401k',
  'mortgage',
  'loan',
  'credit',
  'debt',
  'income',
  'expense',
  'budget',
  'goal',
  'treasury',
  'bond',
  'stock',
  'etf',
  'mutual',
  'fund',
  'rate',
  'interest'
];

export function filterConversationHistory(
  history: ConversationEntry[],
  currentQuestion: string
): ConversationEntry[] {
  if (history.length <= 6) {
    return history;
  }

  const recent = history.slice(0, 3);
  const older = history.slice(3);

  const keywords = currentQuestion
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4 && !STOP_WORDS.has(word));

  const scored = older.map(conv => {
    const text = (conv.question + ' ' + conv.answer).toLowerCase();
    let score = 0;

    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        score += 2;
      }
    });

    IMPORTANT_TERMS.forEach(term => {
      if (text.includes(term)) {
        score += 1;
      }
    });

    return { conv, score };
  });

  const relevant = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(item => item.conv);

  const combined = [...recent, ...relevant].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return combined.slice(0, 8);
}

export function analyzeConversationContext(
  history: ConversationEntry[],
  currentQuestion: string
): {
  hasContextOpportunities: boolean;
  instruction: string;
} {
  if (history.length === 0) {
    return { hasContextOpportunities: false, instruction: '' };
  }

  const lowerQuestion = currentQuestion.toLowerCase();
  const contextOpportunities: string[] = [];

  const matchesAny = (patterns: (string | RegExp)[]): boolean =>
    patterns.some(pattern =>
      typeof pattern === 'string'
        ? lowerQuestion.includes(pattern)
        : pattern.test(lowerQuestion)
    );

  const hasPriorQuestion = (...patterns: (string | RegExp)[]) =>
    history.some(conv => {
      const lower = conv.question.toLowerCase();
      return patterns.some(pattern =>
        typeof pattern === 'string' ? lower.includes(pattern) : pattern.test(lower)
      );
    });

  const ageInfo = lowerQuestion.match(/\b(\d+)\s*(years?\s*old|y\.?o\.?|age)\b/);
  const incomeInfo = lowerQuestion.match(
    /\b(?:income|salary|earn|make)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/
  );
  const expenseInfo = lowerQuestion.match(
    /\b(?:expense|spend|cost)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/
  );
  const goalInfo = matchesAny(['goal', 'target', 'planning for', 'saving for']);
  const timelineInfo = lowerQuestion.match(
    /\b(?:in\s+(\d+)\s+years?|(\d+)\s+years?\s+from\s+now)\b/
  );

  const historyText = history.map(item => `${item.question} ${item.answer}`.toLowerCase());
  const historyIncludes = (patterns: (string | RegExp)[]): boolean =>
    historyText.some(entry =>
      patterns.some(pattern =>
        typeof pattern === 'string' ? entry.includes(pattern) : pattern.test(entry)
      )
    );

  const businessPatterns: (string | RegExp)[] = [
    'business',
    'llc',
    'limited liability',
    'startup',
    'entrepreneur',
    'company account',
    /biz banking/
  ];

  const bankingPatterns: (string | RegExp)[] = [
    'savings',
    'checking',
    'bank account',
    'cd',
    'certificate of deposit',
    'cash management',
    'money market',
    'high-yield'
  ];

  const ratePatterns = [
    'rate',
    'rates',
    'apy',
    'yield',
    'compare',
    'comparison',
    'better',
    'best',
    'highest',
    'interest'
  ];

  const questionForRateCheck = lowerQuestion.replace(/[?!.]/g, ' ');
  const asksAboutRates = ratePatterns.some(keyword =>
    questionForRateCheck.includes(keyword)
  );

  if (
    hasPriorQuestion('portfolio', 'investment', 'asset allocation') &&
    (ageInfo || incomeInfo || goalInfo)
  ) {
    contextOpportunities.push(
      'User previously asked about portfolio analysis and now provided key personal information. Offer to complete the portfolio analysis with this new context.'
    );
  }

  if (
    hasPriorQuestion('plan', 'retirement', 'savings') &&
    (ageInfo || timelineInfo)
  ) {
    contextOpportunities.push(
      'User previously asked about financial planning and now provided timeline or age information. Offer to create a comprehensive financial plan.'
    );
  }

  if (
    hasPriorQuestion('debt', 'credit', 'loan') &&
    (incomeInfo || expenseInfo)
  ) {
    contextOpportunities.push(
      'User previously asked about debt analysis and now provided income/expense information. Offer to complete the debt-to-income analysis.'
    );
  }

  if (asksAboutRates && historyIncludes(businessPatterns)) {
    contextOpportunities.push(
      'User previously asked about business banking/savings accounts. Provide rates or comparing options tailored to their question.'
    );
  }

  if (asksAboutRates && historyIncludes(bankingPatterns)) {
    contextOpportunities.push(
      'User previously discussed savings, banking, or accounts. Provide rates or comparing options tailored to their question.'
    );
  }

  if (contextOpportunities.length === 0) {
    return { hasContextOpportunities: false, instruction: '' };
  }

  return {
    hasContextOpportunities: true,
    instruction: contextOpportunities.join(' ')
  };
}

