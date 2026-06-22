/**
 * Profile Age Extractor
 * Extracts age and retirement information from user profile text
 */

/**
 * Extract age from profile text
 * Looks for patterns like "45 years old", "age 45", "I'm 45", etc.
 */
export function extractAgeFromProfile(profileText: string): number | null {
  if (!profileText) return null;

  // Prefer explicit current-age phrasing; avoid "retire at age 68" matching as current age.
  const agePatterns = [
    /(?:i'?m|i am)\s+(\d{2,3})\b/i,
    /(?:^|\s)(\d{2,3})\s*(?:years?\s*old|y\.?o\.?)/i,
    /(\d{2,3})-year-old/i,
  ];

  for (const pattern of agePatterns) {
    const match = profileText.match(pattern);
    if (match) {
      const age = parseInt(match[1]);
      if (age >= 18 && age <= 120) { // Reasonable age range
        return age;
      }
    }
  }

  return null;
}

/**
 * Extract retirement age from profile text
 */
export function extractRetirementAgeFromProfile(profileText: string): number | null {
  if (!profileText) return null;

  const retirementPatterns = [
    /retir(?:e|ement)(?:\s+at|\s+age)?\s+(\d+)/i,
    /retirement\s+age\s+(\d+)/i,
    /planning\s+to\s+retire\s+at\s+(\d+)/i,
    /retire\s+at\s+age\s+(\d+)/i
  ];

  for (const pattern of retirementPatterns) {
    const match = profileText.match(pattern);
    if (match) {
      const age = parseInt(match[1]);
      if (age >= 50 && age <= 100) { // Reasonable retirement age range
        return age;
      }
    }
  }

  return null;
}
