import { QuestionNeeds } from './types';

export function analyzeQuestionNeeds(question: string): QuestionNeeds {
  const qLower = question.toLowerCase();

  // External context is intentionally narrow. Personal balance, portfolio, and
  // retirement questions should use the persisted financial snapshot unless the
  // user explicitly asks about current markets, rates, or outside rules.
  const needsMarketContext =
    /\b(market|markets|inflation|economy|economic|recession|fed|federal reserve)\b/.test(qLower) ||
    /\b(stock|bond|treasury) market\b/.test(qLower) ||
    /\bmarket (outlook|conditions|performance|trend|forecast)\b/.test(qLower);

  const needsSearchContext =
    /\b(apr|apy|refinance|yield|tax law|tax limit|contribution limit)\b/.test(qLower) ||
    /\b(current|latest|today(?:'s)?)\s+(rate|rates|price|prices|yield|law|limit|limits)\b/.test(qLower) ||
    /\b(mortgage|cd|treasury|savings)\s+(rate|rates|yield|yields)\b/.test(qLower) ||
    /\b(tax|capital gains?)\s+(rate|rates|bracket|brackets|deduction|deductions)\b/.test(qLower) ||
    /\b(standard deduction|required minimum distribution|rmd)\b/.test(qLower);

  const needsHomeValue =
    qLower.includes('home') ||
    qLower.includes('house') ||
    qLower.includes('property') ||
    qLower.includes('real estate') ||
    qLower.includes('mortgage');

  const needsInvestments =
    qLower.includes('portfolio') ||
    qLower.includes('holding') ||
    qLower.includes('investment') ||
    qLower.includes('stock') ||
    qLower.includes('securities') ||
    qLower.includes('asset allocation') ||
    qLower.includes('diversif') ||
    /\b(401k|403b|ira|brokerage)\b/.test(qLower);

  const needsRetirement =
    qLower.includes('retirement') ||
    qLower.includes('retire') ||
    qLower.includes('withdrawal') ||
    qLower.includes('retirement planning') ||
    qLower.includes('retirement readiness') ||
    qLower.includes('sustainable withdrawal') ||
    qLower.includes('retirement portfolio');

  const needsAccountDetails =
    /\b(account|accounts|balance|balances|checking|savings|loan|credit card|mortgage)\b/.test(qLower) ||
    needsInvestments;

  const needsTransactionDetails =
    /\b(transaction|transactions|purchase|purchases|merchant|merchants|paycheck|salary|subscription|subscriptions|fee|fees)\b/.test(qLower) ||
    /\b(recent|latest|largest|individual|specific)\s+(spend|spending|expense|expenses|income)\b/.test(qLower) ||
    /\bspend(?:ing)?\s+(?:at|with|from)\b/.test(qLower);

  const needsSecondaryValidation =
    Boolean(needsRetirement) ||
    /\b(afford|projection|projected|scenario|simulate|simulation|on track|sustainable|withdrawal|tax|ratio)\b/.test(qLower) ||
    /\b(compare|comparison|optimize|recommend(?:ation|ations|ed)?)\b/.test(qLower) ||
    /\b(debt[- ]to[- ]income|savings rate)\b/.test(qLower);

  const needsUserProfile =
    Boolean(needsRetirement) ||
    needsHomeValue ||
    needsSecondaryValidation ||
    /\b(goal|goals|risk tolerance|age|married|family|child|children|dependent|dependents)\b/.test(qLower);

  return {
    needsMarketContext,
    needsSearchContext,
    needsHomeValue,
    needsInvestments,
    needsRetirement,
    needsAccountDetails,
    needsTransactionDetails,
    needsUserProfile,
    needsSecondaryValidation,
  };
}
