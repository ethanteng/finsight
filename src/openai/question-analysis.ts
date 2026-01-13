import { QuestionNeeds } from './types';

export function analyzeQuestionNeeds(question: string): QuestionNeeds {
  const qLower = question.toLowerCase();

  const needsMarketContext =
    qLower.includes('investment') ||
    qLower.includes('portfolio') ||
    qLower.includes('stock') ||
    qLower.includes('market') ||
    qLower.includes('asset allocation') ||
    qLower.includes('holdings') ||
    qLower.includes('securities') ||
    qLower.includes('retirement') ||
    qLower.includes('401k') ||
    qLower.includes('ira');

  const needsSearchContext =
    qLower.includes('rate') ||
    qLower.includes('apr') ||
    qLower.includes('current') ||
    qLower.includes('today') ||
    qLower.includes('now') ||
    qLower.includes('mortgage') ||
    qLower.includes('refinance') ||
    qLower.includes('yield') ||
    qLower.includes('return');

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
    qLower.includes('securities');

  const needsRetirement =
    qLower.includes('retirement') ||
    qLower.includes('retire') ||
    qLower.includes('withdrawal') ||
    qLower.includes('retirement planning') ||
    qLower.includes('retirement readiness') ||
    qLower.includes('sustainable withdrawal') ||
    qLower.includes('retirement portfolio');

  return {
    needsMarketContext,
    needsSearchContext,
    needsHomeValue,
    needsInvestments,
    needsRetirement
  };
}

