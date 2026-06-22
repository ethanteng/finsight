import { extractAgeFromProfile, extractRetirementAgeFromProfile } from '../../retirement-analytics/profile-age-extractor';

describe('extractAgeFromProfile', () => {
  const profile =
    'User is 48 years old and plans to retire at age 68. Annual retirement spending goal is $100,000. Risk tolerance is moderate.';

  it('returns current age 48, not retirement target age 68', () => {
    expect(extractAgeFromProfile(profile)).toBe(48);
  });

  it('extracts age from "I am 52 years old"', () => {
    expect(extractAgeFromProfile('I am 52 years old, saving aggressively.')).toBe(52);
  });
});

describe('extractRetirementAgeFromProfile', () => {
  it('returns retirement target age from profile', () => {
    const profile = 'User is 48 years old and plans to retire at age 68.';
    expect(extractRetirementAgeFromProfile(profile)).toBe(68);
  });
});
