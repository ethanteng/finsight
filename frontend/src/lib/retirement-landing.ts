/**
 * Landing variants for /retirement-calculator on paid search.
 *
 * Google Ads runs a separate ad group per retirement age, so the ad's final URL
 * carries the age it was bought on (`?retirement_age=62`) and the page answers
 * that question by name instead of a generic one. `utm_retirement_age` is
 * accepted as well: campaign builders reach for the utm_ prefix out of habit,
 * and a silent fallback to the generic headline is an expensive way to discover
 * the typo.
 *
 * The bounds match the model's own accepted retirement age. Anything outside
 * them — or anything that is not a plain number — is treated as absent rather
 * than echoed back into the page.
 */

export const MIN_RETIREMENT_AGE = 30;
export const MAX_RETIREMENT_AGE = 95;

export type RetirementLandingParams = {
  retirement_age?: string | string[];
  utm_retirement_age?: string | string[];
};

export function readRetirementAge(params: RetirementLandingParams): number | null {
  const raw = params.retirement_age ?? params.utm_retirement_age;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || !/^\d{1,3}$/.test(value.trim())) return null;

  const age = Number(value.trim());
  if (age < MIN_RETIREMENT_AGE || age > MAX_RETIREMENT_AGE) return null;
  return age;
}

export function retirementHeadline(age: number | null): string {
  return age === null ? 'When can I retire?' : `Can I retire at ${age}?`;
}
