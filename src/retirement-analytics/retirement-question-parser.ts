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
  
  // Match the whole word family. Substring checks for "retire"/"retirement"
  // miss "retiring", "retires", and "retired", and this returns early on a
  // miss — so a question about retiring by 62 arrived with no parameters at
  // all and the analysis reported the retirement age as missing.
  const hasRetirementIntent =
    /\bretir\w*/.test(qLower) ||
    /\b(?:withdrawals?|drawdown|draw\s+down|nest\s+egg|financial\s+independence)\b/.test(qLower);

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
  // The prepositions repeat and "age" can follow one of them: "retiring by age
  // 62" is the way people write this, and matching only a single connector
  // missed it entirely, leaving the retirement age unknown for a question that
  // stated it plainly.
  const retirementAgePatterns = [
    /retir\w*(?:\s+(?:at|by|around|about|near|before|no\s+later\s+than))*(?:\s+age)?\s+(\d{2,3})\b/i,
    /retirement\s+age\s+(?:of\s+)?(\d{2,3})\b/i,
    /planning\s+to\s+retire\s+(?:at|by)\s+(?:age\s+)?(\d{2,3})\b/i
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
