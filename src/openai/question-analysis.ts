import { mentionsRetirement } from '../retirement-analytics/retirement-language';
import { QuestionNeeds } from './types';

function analyzeSingleQuestion(question: string): QuestionNeeds {
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

  const mentionsStockMarket = /\b(stock|bond|treasury) market\b/.test(qLower);

  const needsInvestments =
    !mentionsStockMarket && (
      qLower.includes('portfolio') ||
      qLower.includes('holding') ||
      qLower.includes('investment') ||
      qLower.includes('stock') ||
      qLower.includes('securities') ||
      qLower.includes('asset allocation') ||
      qLower.includes('diversif') ||
      /\b(401k|403b|ira|brokerage)\b/.test(qLower)
    );

  // Match the word family, not two fixed spellings: substring checks for
  // "retire"/"retirement" miss "retiring", "retires", "retired", and "retiree",
  // which silently withheld the retirement analysis from questions that were
  // plainly about retiring.
  // Shared with the retirement parser and the profile extractor, so routing a
  // question and reading its parameters can never disagree about the phrasing.
  const needsRetirement = mentionsRetirement(qLower);

  const needsAccountDetails =
    /\b(account|accounts|balance|balances|checking|savings|loan|credit card|mortgage)\b/.test(qLower) ||
    needsInvestments;

  // "How much do I spend each month?" is answered by the monthly totals, but
  // "evaluate my spending" is not — that asks what the averages are made of.
  // "money" on its own is too generic to route on — "review where my money is
  // invested" is an investments question — so the money phrasing has to name
  // the outflow explicitly.
  const evaluatesSpending =
    (/\b(spending|expenses|budget|cash[ -]?flow)\b/.test(qLower) &&
      (/\b(evaluate|evaluating|assess|assessment|analy[sz]e|analy[sz]ing|analysis|review|reviewing|breakdown|optimi[sz]e|improve|reduce|cut|trim)\b/.test(qLower) ||
        /\bbreak\s+down\b/.test(qLower) ||
        /\bstrengths?\s+and\s+weakness/.test(qLower))) ||
    /\bwhere\s+(?:is|are|does|do)\s+(?:all\s+)?(?:my|our|the)\s+money\s+(?:go|goes|going)\b/.test(qLower);

  const needsTransactionDetails =
    /\b(transaction|transactions|purchase|purchases|merchant|merchants|category|categories|paycheck|salary|subscription|subscriptions|fee|fees)\b/.test(qLower) ||
    /\b(recent|latest|largest|individual|specific)\s+(spend|spending|expense|expenses|income)\b/.test(qLower) ||
    /\bspend(?:ing)?\s+(?:at|with|from)\b/.test(qLower) ||
    evaluatesSpending;

  const needsMonthlyCashFlow =
    /\b(spend|spending|expense|expenses|income|cash[ -]?flow)\b/.test(qLower) &&
    (/(?:\blast|\bprevious|\bthis)\s+(?:month|year)\b/.test(qLower) ||
      /\b(?:ytd|year[ -]to[ -]date)\b/.test(qLower) ||
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(qLower) ||
      /\b20\d{2}-(?:0[1-9]|1[0-2])\b/.test(qLower));

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
    needsMonthlyCashFlow,
    needsUserProfile,
    needsSecondaryValidation,
  };
}

function isContextualFollowUp(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  if (normalized.length > 100) return false;
  return /^(?:and\b|also\b|so\b|then\b|but\b|what if\b|what about\b|how about\b|which (?:one|ones|of)\b|why (?:is|are|did|does) (?:that|it|this)\b|can you (?:explain|compare) (?:that|them|those|it)\b)|\b(?:same|instead|that one|those|them|it)\b/.test(normalized);
}

/** Route a short contextual follow-up using the most recent user question. */
export function analyzeQuestionNeeds(
  question: string,
  recentQuestions: readonly string[] = []
): QuestionNeeds {
  const current = analyzeSingleQuestion(question);
  if (!isContextualFollowUp(question) || recentQuestions.length === 0) return current;

  const previous = analyzeSingleQuestion(recentQuestions[0]);
  return {
    needsMarketContext: current.needsMarketContext || previous.needsMarketContext,
    needsSearchContext: current.needsSearchContext || previous.needsSearchContext,
    needsHomeValue: current.needsHomeValue || previous.needsHomeValue,
    needsInvestments: current.needsInvestments || previous.needsInvestments,
    needsRetirement: Boolean(current.needsRetirement || previous.needsRetirement),
    needsAccountDetails: current.needsAccountDetails || previous.needsAccountDetails,
    needsTransactionDetails: current.needsTransactionDetails || previous.needsTransactionDetails,
    needsMonthlyCashFlow: current.needsMonthlyCashFlow || previous.needsMonthlyCashFlow,
    needsUserProfile: current.needsUserProfile || previous.needsUserProfile,
    needsSecondaryValidation: current.needsSecondaryValidation || previous.needsSecondaryValidation,
  };
}
