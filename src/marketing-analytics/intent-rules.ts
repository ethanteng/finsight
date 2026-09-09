import type { AcquisitionFields, IntentCohortId } from './types';

export interface IntentRuleInput extends Partial<AcquisitionFields> {
  firstContent?: string;
}

export interface IntentRule {
  id: IntentCohortId;
  label: string;
  description: string;
  matches: (input: IntentRuleInput) => boolean;
}

const contains = (value: string, expressions: RegExp[]) => expressions.some(expression => expression.test(value));
const normalizedHaystack = (input: IntentRuleInput) => Object.values(input)
  .filter((value): value is string => typeof value === 'string')
  .join(' ')
  .toLowerCase();

const isPaid = (input: IntentRuleInput) => {
  const medium = input.medium?.toLowerCase() ?? '';
  return /(^|[^a-z])(cpc|ppc|paid|display|affiliate)([^a-z]|$)/.test(medium)
    || Boolean(input.adId || input.creative)
    || Boolean(input.campaign && /paid|search|pmax|retarget/i.test(input.campaign));
};

/**
 * Priority is intentional and auditable. Topic-specific intent wins before
 * channel-only buckets, so a calculator ad remains retirement intent while
 * its raw paid source fields stay visible beside the cohort.
 */
export const INTENT_RULES: readonly IntentRule[] = [
  {
    id: 'retirement_high_intent',
    label: 'Retirement / calculator',
    description: 'Calculator landings and explicit retirement-readiness or can-I-retire queries.',
    matches: input => contains(normalizedHaystack(input), [
      /retirement[-_ /]?calculator/,
      /can i retire/,
      /retire (at|with|by)/,
      /retirement (readiness|projection|plan|income)/,
    ]),
  },
  {
    id: 'competitor_comparison',
    label: 'Competitor / comparison',
    description: 'Comparison pages and searches naming an alternative or competing planning product.',
    matches: input => contains(normalizedHaystack(input), [
      /(^|\s|\/)vs([/\s]|$)/,
      /alternatives? to/,
      /compare|comparison/,
      /smartasset|boldin|newretirement|useorigin|origin financial|portfolio ?pilot|monarch money/,
    ]),
  },
  {
    id: 'paid_brand',
    label: 'Paid brand',
    description: 'Paid traffic whose campaign or keyword includes Ask Linc or a brand spelling variant.',
    matches: input => isPaid(input) && contains(normalizedHaystack(input), [/ask ?linc|asklinc|linc financial|linc payments/]),
  },
  {
    id: 'paid_nonbrand',
    label: 'Paid nonbrand',
    description: 'Paid traffic without a brand term after higher-priority intent rules are evaluated.',
    matches: input => isPaid(input),
  },
  {
    id: 'savings_net_worth',
    label: 'Savings / net worth',
    description: 'Savings benchmarks, net-worth questions, and related landing content.',
    matches: input => contains(normalizedHaystack(input), [/net[-_ ]?worth/, /average.*savings|savings.*average/, /how much.*sav(e|ed|ings)/]),
  },
  {
    id: 'generic_ai_financial_planning',
    label: 'AI financial planning',
    description: 'Generic AI adviser, financial-planning, and planning-software discovery intent.',
    matches: input => contains(normalizedHaystack(input), [
      /ai (financial|finance|wealth|money)/,
      /financial (planner|planning|advice|advisor)/,
      /personal finance (ai|tool|app)/,
    ]),
  },
  {
    id: 'brand_direct',
    label: 'Brand / direct',
    description: 'Direct visits and unpaid searches or campaigns containing Ask Linc brand terms.',
    matches: input => {
      const source = input.source?.toLowerCase() ?? '';
      const medium = input.medium?.toLowerCase() ?? '';
      return (!source || source === '(direct)' || medium === '(none)' || medium === 'direct')
        || contains(normalizedHaystack(input), [/ask ?linc|asklinc|linc financial|linc payments/]);
    },
  },
  {
    id: 'blog_informational_seo',
    label: 'Blog / informational SEO',
    description: 'Organic or referral sessions landing on educational articles and answer pages.',
    matches: input => {
      const medium = input.medium?.toLowerCase() ?? '';
      const landing = input.landingPage?.toLowerCase() ?? '';
      return (medium === 'organic' || medium === 'referral')
        && (/^\/blog\//.test(landing) || /^\/can-i-retire-/.test(landing) || /^\/retirement-answers/.test(landing));
    },
  },
  {
    id: 'unknown',
    label: 'Unknown',
    description: 'No higher-priority rule matched. Raw source fields remain visible for diagnosis.',
    matches: () => true,
  },
] as const;

export function classifyIntent(input: IntentRuleInput): IntentRule {
  return INTENT_RULES.find(rule => rule.matches(input)) ?? INTENT_RULES[INTENT_RULES.length - 1];
}
