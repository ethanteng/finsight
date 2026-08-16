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
  // Runway questions. These name no retirement word at all, so the projection
  // engine never ran on the one question it exists to answer and the reply was
  // assembled from aggregates instead.
  'at my current rate of spend, how long will my money last?',
  'how long will my savings last?',
  'how many more years will the portfolio last?',
  'how much longer will my cash hold out?',
  'will I run out of money?',
  'am I going to outlive my savings?',
  'how long can I live off my investments?',
  'how long will my 401k last?',
  'how long will my 401(k) last?',
  'how long will my IRA last?',
  'how long will my HSA last?',
  // The duration on the other side of the asset — how people ask it once they
  // already have a number in mind.
  'will my savings last 20 years?',
  'will my savings last until I am 90?',
];

const NON_RETIREMENT_PHRASINGS = [
  'what is my net worth?',
  'how much did I spend on groceries?',
  'should I retire my mortgage early?',
  // A loan term, not a runway. Naming the assets is what separates these.
  'how long will my mortgage last?',
  'how long will my car loan last?',
  // Same shape, different question: an emergency fund is drawn down by a job
  // loss, and the projection would answer by asking for a retirement age.
  'how long will my emergency fund last if I lose my job?',
  // "last" as the time idiom, not as running out. A duration, an asset and the
  // word "last" appear here in the right order and mean nothing of the kind.
  'how many months of savings did I use last year?',
  'how much did I add to my savings last month?',
  // Living on an income is a question about that income. Requiring the asset
  // after "live off/on" is what separates it from living off a portfolio.
  'how long can I live on welfare?',
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
