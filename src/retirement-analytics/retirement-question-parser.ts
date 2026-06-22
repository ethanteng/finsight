/**
 * Retirement Question Parser
 * Extracts retirement analysis parameters from user questions
 */

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
  
  // Check if question is retirement-related
  const retirementKeywords = [
    'retirement',
    'retire',
    'withdrawal',
    'retirement planning',
    'retirement readiness',
    'sustainable withdrawal',
    'retirement portfolio',
    'retirement analysis',
    'retirement withdrawal',
    'withdraw in retirement'
  ];
  
  const hasRetirementIntent = retirementKeywords.some(keyword => qLower.includes(keyword));
  
  if (!hasRetirementIntent) {
    return { hasRetirementIntent: false };
  }

  // Extract current age — avoid bare "age N" (matches "retire at age 68" as current age).
  const agePatterns = [
    /(?:i'?m|i am)\s+(\d{2,3})\b/i,
    /(\d{2,3})\s*(?:years?\s*old|y\.?o\.?)/i,
  ];
  
  let currentAge: number | undefined;
  for (const pattern of agePatterns) {
    const match = qLower.match(pattern);
    if (match) {
      currentAge = parseInt(match[1]);
      break;
    }
  }

  // Extract retirement age patterns
  // "retire at 65" or "retirement age 65" or "planning to retire at 68" or "retiring by 68"
  const retirementAgePatterns = [
    /retir(?:e|ing|ement)(?:\s+(?:at|by|age))?\s+(\d+)/i, // Matches "retire at 65", "retiring by 68", "retirement age 65"
    /retirement\s+age\s+(\d+)/i,
    /planning\s+to\s+retire\s+(?:at|by)\s+(\d+)/i
  ];
  
  let retirementAge: number | undefined;
  for (const pattern of retirementAgePatterns) {
    const match = qLower.match(pattern);
    if (match) {
      retirementAge = parseInt(match[1]);
      break;
    }
  }

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
