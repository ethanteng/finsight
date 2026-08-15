/**
 * Profile Age Extractor
 *
 * Thin wrappers over the shared retirement-language matchers, kept as named
 * functions because callers read better for them. The phrasing itself lives in
 * one place so the profile and the question can never disagree about what
 * "retiring by age 62" means.
 */

import { extractCurrentAge, extractRetirementAge } from './retirement-language';

/** Extract age from profile text: "48-year-old", "45 years old", "I'm 45". */
export function extractAgeFromProfile(profileText: string): number | null {
  return extractCurrentAge(profileText);
}

/** Extract the planned retirement age from profile text. */
export function extractRetirementAgeFromProfile(profileText: string): number | null {
  return extractRetirementAge(profileText);
}
