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

  // Extract age patterns
  // "I'm 48" or "I am 48" or "age 48" or "48 years old"
  const agePatterns = [
    /(?:i'?m|i am|age|aged)\s+(\d+)(?:\s*(?:years?\s*old|y\.?o\.?))?/i,
    /(\d+)\s*(?:years?\s*old|y\.?o\.?)/i,
    /at\s+age\s+(\d+)/i
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
  // "retire at 65" or "retirement age 65" or "planning to retire at 68"
  const retirementAgePatterns = [
    /retir(?:e|ement)(?:\s+at|\s+age)?\s+(\d+)/i,
    /retirement\s+age\s+(\d+)/i,
    /planning\s+to\s+retire\s+at\s+(\d+)/i
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
  const withdrawalPatterns = [
    /\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:k|thousand|million)?\s*(?:per\s+year|annually|annual\s+withdrawal|withdrawal)/i,
    /withdraw(?:al)?\s+(?:of\s+)?\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:k|thousand|million)?/i,
    /annual\s+withdrawal\s+(?:of\s+)?\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:k|thousand|million)?/i
  ];
  
  let annualWithdrawalAmount: number | undefined;
  for (const pattern of withdrawalPatterns) {
    const match = qLower.match(pattern);
    if (match) {
      let amount = match[1].replace(/,/g, '');
      const multiplier = qLower.includes('million') ? 1000000 : (qLower.includes('k') || qLower.includes('thousand') ? 1000 : 1);
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
