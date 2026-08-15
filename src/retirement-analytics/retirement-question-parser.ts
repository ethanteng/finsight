/**
 * Retirement Question Parser
 * Extracts retirement analysis parameters from user questions
 */

import { extractCurrentAge, extractRetirementAge, mentionsRetirement } from './retirement-language';

export interface RetirementQuestionParams {
  hasRetirementIntent: boolean;
  currentAge?: number;
  retirementAge?: number;
  annualWithdrawalAmount?: number;
  withdrawalStartAge?: number;
  lifeExpectancy?: number;
}

/**
 * Parse retirement-related parameters from a user question
 */
export function parseRetirementQuestion(question: string): RetirementQuestionParams {
  const qLower = question.toLowerCase();

  // Intent and both ages come from the shared matchers; this used to keep its
  // own substring list and returned early when it missed, so "retiring by age
  // 62" produced no parameters at all.
  const hasRetirementIntent = mentionsRetirement(qLower);

  if (!hasRetirementIntent) {
    return { hasRetirementIntent: false };
  }

  const currentAge = extractCurrentAge(qLower) ?? undefined;
  const retirementAge = extractRetirementAge(qLower) ?? undefined;

  // Extract withdrawal amount patterns
  // "$100,000 per year" or "$100k annually" or "withdraw 100000" or "100000 annual withdrawal"
  const amountPattern = String.raw`\$?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)`;
  const withdrawalPatterns = [
    new RegExp(`${amountPattern}\\s*(?:k|thousand|million)?\\s*(?:per\\s+year|annually|annual\\s+withdrawal|withdrawal)`, 'i'),
    new RegExp(`withdraw(?:al)?\\s+(?:of\\s+)?${amountPattern}\\s*(?:k|thousand|million)?`, 'i'),
    new RegExp(`annual\\s+withdrawal\\s+(?:of\\s+)?${amountPattern}\\s*(?:k|thousand|million)?`, 'i'),
  ];

  function parseWithdrawalMultiplier(matchedText: string): number {
    const t = matchedText.toLowerCase();
    if (/\bmillion\b/.test(t)) return 1_000_000;
    // "100k" — \b does not sit between digit and "k", so match digit+k explicitly
    if (/(?:\d\s*)k\b/.test(t) || /\bthousand\b/.test(t)) return 1_000;
    return 1;
  }
  
  let annualWithdrawalAmount: number | undefined;
  for (const pattern of withdrawalPatterns) {
    const match = qLower.match(pattern);
    if (match) {
      const amount = match[1].replace(/,/g, '');
      const multiplier = parseWithdrawalMultiplier(match[0]);
      annualWithdrawalAmount = parseFloat(amount) * multiplier;
      break;
    }
  }

  // Extract withdrawal start age (usually same as retirement age if not specified)
  const withdrawalStartPatterns = [
    /start\s+withdraw(?:ing|als)?\s+at\s+age\s+(\d+)/i,
    /withdrawal\s+start(?:s|ing)?\s+at\s+age\s+(\d+)/i
  ];
  
  let withdrawalStartAge: number | undefined;
  for (const pattern of withdrawalStartPatterns) {
    const match = qLower.match(pattern);
    if (match) {
      withdrawalStartAge = parseInt(match[1]);
      break;
    }
  }
  
  // Default withdrawal start age to retirement age if not specified
  if (!withdrawalStartAge && retirementAge) {
    withdrawalStartAge = retirementAge;
  }

  // Extract life expectancy (less common in questions)
  const lifeExpectancyPatterns = [
    /life\s+expectancy\s+(?:of\s+)?(\d+)/i,
    /live\s+until\s+(\d+)/i,
    /expect\s+to\s+live\s+until\s+(\d+)/i
  ];
  
  let lifeExpectancy: number | undefined;
  for (const pattern of lifeExpectancyPatterns) {
    const match = qLower.match(pattern);
    if (match) {
      lifeExpectancy = parseInt(match[1]);
      break;
    }
  }

  return {
    hasRetirementIntent: true,
    currentAge,
    retirementAge,
    annualWithdrawalAmount,
    withdrawalStartAge,
    lifeExpectancy
  };
}
