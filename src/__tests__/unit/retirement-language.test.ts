import {
  extractCurrentAge,
  extractRetirementAge,
  mentionsRetirement,
} from '../../retirement-analytics/retirement-language';
import { parseRetirementQuestion } from '../../retirement-analytics/retirement-question-parser';
import {
  extractAgeFromProfile,
  extractRetirementAgeFromProfile,
} from '../../retirement-analytics/profile-age-extractor';
import { analyzeQuestionNeeds } from '../../openai/question-analysis';

/**
 * The same phrasings had to be recognised in three places, and every copy had
 * drifted. These run the one matcher and each of its callers over the same
 * list, so a gap cannot reappear in only one of them.
 */
const RETIREMENT_PHRASINGS = [
  'my goal of retiring by age 62 or sooner',
  'when can I retire?',
  'I retired last year, now what?',
  'as a retiree, what should I watch?',
  'am I on track for retirement?',
  'what is a sustainable withdrawal rate?',
  'is my nest egg big enough?',
  'when can I stop working?',
  'am I on track for financial independence?',
];

const NON_RETIREMENT_PHRASINGS = [
  'what is my net worth?',
  'how much did I spend on groceries?',
  'should I retire my mortgage early?',
];

describe('retirement language', () => {
  it.each(RETIREMENT_PHRASINGS)('recognizes retirement intent in %j', (question) => {
    expect(mentionsRetirement(question)).toBe(true);
    // The router and the parser must agree, or the analysis is requested
    // without the parameters needed to run it.
    expect(analyzeQuestionNeeds(question).needsRetirement).toBe(true);
    expect(parseRetirementQuestion(question).hasRetirementIntent).toBe(true);
  });

  it.each(NON_RETIREMENT_PHRASINGS)('does not see retirement in %j', (question) => {
    expect(mentionsRetirement(question)).toBe(false);
    expect(analyzeQuestionNeeds(question).needsRetirement).toBe(false);
    expect(parseRetirementQuestion(question).hasRetirementIntent).toBe(false);
  });

  it('still routes a question that means both senses', () => {
    const question = 'should I retire my mortgage early so I can retire at 62?';
    expect(mentionsRetirement(question)).toBe(true);
    expect(analyzeQuestionNeeds(question).needsRetirement).toBe(true);
  });

  it.each([
    ['retiring by age 62', 62],
    ['retire at 65', 65],
    ['retiring at age 58', 58],
    ['planning to retire by age 60', 60],
    ['I want to retire around age 55', 55],
    ['my retirement age of 67', 67],
    ['retire no later than age 70', 70],
  ] as Array<[string, number]>)('reads the retirement age from %j', (text, expected) => {
    expect(extractRetirementAge(text)).toBe(expected);
    // Whichever side of the pipeline sees the text, the answer is the same.
    expect(parseRetirementQuestion(`am I on track ${text}?`).retirementAge).toBe(expected);
    expect(extractRetirementAgeFromProfile(`The user plans on ${text}.`)).toBe(expected);
  });

  it.each([
    ['The user is a 48-year-old individual married to a 50-year-old husband', 48],
    ['I am 52 and thinking about retiring', 52],
    ['a 39 year old software engineer', 39],
  ] as Array<[string, number]>)('reads the current age from %j', (text, expected) => {
    expect(extractCurrentAge(text)).toBe(expected);
    expect(extractAgeFromProfile(text)).toBe(expected);
  });

  it('does not read a retirement target as the current age', () => {
    expect(extractCurrentAge('I want to retire at age 68')).toBeNull();
    expect(extractRetirementAge('I want to retire at age 68')).toBe(68);
  });

  it('rejects ages outside a plausible range', () => {
    expect(extractRetirementAge('retire at 12')).toBeNull();
    expect(extractCurrentAge('the 150 year old oak tree')).toBeNull();
  });
});
