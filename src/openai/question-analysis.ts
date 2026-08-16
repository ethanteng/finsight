import { mentionsRetirement } from '../retirement-analytics/retirement-language';
import { matchesCategory } from './routing-vocabulary';
import { QuestionNeeds } from './types';

function analyzeSingleQuestion(question: string): QuestionNeeds {
  const qLower = question.toLowerCase();

  // External context is intentionally narrow. Personal balance, portfolio, and
  // retirement questions should use the persisted financial snapshot unless the
  // user explicitly asks about current markets, rates, or outside rules.
  // Vocabulary lives in the admin-configurable routing terms; the shapes that
  // are not word lists stay here.
  const needsMarketContext =
    matchesCategory('marketContext', qLower) ||
    /\b(stock|bond|treasury) market\b/.test(qLower) ||
    /\bmarket (outlook|conditions|performance|trend|forecast)\b/.test(qLower);

  const needsSearchContext =
    matchesCategory('searchContext', qLower) ||
    /\b(current|latest|today(?:'s)?)\s+(rate|rates|price|prices|yield|law|limit|limits)\b/.test(qLower) ||
    /\b(mortgage|cd|treasury|savings)\s+(rate|rates|yield|yields)\b/.test(qLower) ||
    /\b(tax|capital gains?)\s+(rate|rates|bracket|brackets|deduction|deductions)\b/.test(qLower);

  const needsHomeValue = matchesCategory('home', qLower);

  const mentionsStockMarket = /\b(stock|bond|treasury) market\b/.test(qLower);

  const needsInvestments = !mentionsStockMarket && matchesCategory('investments', qLower);

  // Match the word family, not two fixed spellings: substring checks for
  // "retire"/"retirement" miss "retiring", "retires", "retired", and "retiree",
  // which silently withheld the retirement analysis from questions that were
  // plainly about retiring.
  // Shared with the retirement parser and the profile extractor, so routing a
  // question and reading its parameters can never disagree about the phrasing.
  const needsRetirement = mentionsRetirement(qLower);

  const needsAccountDetails = matchesCategory('accounts', qLower) || needsInvestments;

  // "How much do I spend each month?" is answered by the monthly totals, but
  // "evaluate my spending" is not — that asks what the averages are made of.
  // "money" on its own is too generic to route on — "review where my money is
  // invested" is an investments question — so the money phrasing has to name
  // the outflow explicitly.
  const evaluatesSpending =
    (/\b(spending|expenses|budget|cash[ -]?flow)\b/.test(qLower) &&
      (matchesCategory('spendingReview', qLower) ||
        /\bstrengths?\s+and\s+weakness/.test(qLower))) ||
    /\bwhere\s+(?:is|are|does|do)\s+(?:all\s+)?(?:my|our|the)\s+money\s+(?:go|goes|going)\b/.test(qLower);

  const needsTransactionDetails =
    matchesCategory('transactions', qLower) ||
    /\b(recent|latest|largest|individual|specific)\s+(spend|spending|expense|expenses|income)\b/.test(qLower) ||
    // "spending on dining out" names a category, so it needs the breakdown.
    // Matching the preposition keeps that separate from "my monthly spending",
    // which is answered by a single number. Exclude "on track" — that idiom is
    // about progress toward a goal, not spending on a category.
    /\bspen(?:d|ding|t)\s+(?:at|with|from|on(?!\s+track))\b/.test(qLower) ||
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

/**
 * A short reply whose whole content is the value the last question asked for:
 * "$125k a year", "125,000", "at 62". These name no topic of their own, so
 * routing them on their own words drops them out of the thread they answer —
 * and the analysis waiting on that number never runs.
 *
 * A trailing question mark disqualifies: "can I afford a $50k car?" carries an
 * amount but is a new question, not an answer to the old one.
 */
function isValueAnswer(normalized: string): boolean {
  if (/\?\s*$/.test(normalized)) return false;
  if (/^(?:at\s+|age\s+)?\d{2}\b/.test(normalized)) return true;
  if (
    /^(?:about\s+)?(?:\$?\s*)?\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*(?:k|thousand|million)?\s*$/.test(normalized) ||
    /^(?:about\s+)?(?:\$?\s*)?\d{4,7}(?:\.\d+)?\s*(?:k|thousand|million)?\s*$/.test(normalized)
  ) {
    return true;
  }
  return /\$\s?\d|\b\d{1,3}(?:,\d{3})+\b|\b\d+\s*k\b/.test(normalized);
}

function isContextualFollowUp(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  if (normalized.length > 100) return false;
  if (isValueAnswer(normalized)) return true;
  return /^(?:and\b|also\b|so\b|then\b|but\b|yes\b|yeah\b|yep\b|correct\b|confirm(?:ed)?\b|i\s+(?:can\s+)?confirm\b|what if\b|what about\b|how about\b|which (?:one|ones|of)\b|why (?:is|are|did|does) (?:that|it|this)\b|can you (?:explain|compare) (?:that|them|those|it)\b)|\b(?:same|instead|that one|those|them|it)\b/.test(normalized);
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
