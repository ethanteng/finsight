/**
 * Admin-configurable vocabulary for question routing.
 *
 * Which context a question loads is decided by matching words against it, and
 * every gap in those words has cost a user an answer: "retiring" not matching
 * "retire", "including my spending" not matching any spending pattern. Those are
 * vocabulary problems, and until now fixing one meant a deploy.
 *
 * Admins edit plain words and phrases, never regular expressions. Terms are
 * escaped before compiling, so a stray bracket cannot throw and no input can
 * produce a catastrophically backtracking pattern. A trailing `*` is the one
 * piece of syntax, and it exists because it is precisely what was missing:
 * `retir*` matches retire, retires, retired, retiring, retirement, and retiree.
 *
 * Structural patterns stay in code. "How much did I spend last month" is matched
 * by shape — a spending word near a time reference — and that is not something a
 * word list can express.
 *
 * Stored as one row alongside the response tone and cached the same way, so the
 * synchronous router can read it without an awaited call.
 */

import { getPrismaClient } from '../prisma-client';
import { AI_PROMPT_CONFIG_ID } from './prompt-config';

export const ROUTING_CATEGORIES = [
  'retirement',
  'investments',
  'home',
  'accounts',
  'transactions',
  'spendingReview',
  'marketContext',
  'searchContext',
] as const;

export type RoutingCategory = (typeof ROUTING_CATEGORIES)[number];

export interface RoutingCategoryMeta {
  id: RoutingCategory;
  label: string;
  /** The routing decision this category feeds, named as the tester labels it. */
  feeds: string;
  /**
   * False when matching this category does nothing on its own. A modifier only
   * changes a decision in combination with something else, so its terms firing
   * with no visible effect is expected rather than a gap.
   */
  standalone: boolean;
  description: string;
}

export const ROUTING_CATEGORY_META: RoutingCategoryMeta[] = [
  {
    id: 'retirement',
    label: 'Retirement',
    feeds: 'Retirement',
    standalone: true,
    description: 'Loads the retirement projection and its inputs. Also drives the second review.',
  },
  {
    id: 'investments',
    label: 'Investments',
    feeds: 'Investments',
    standalone: true,
    description: 'Loads individual holdings and securities. Also switches on Accounts.',
  },
  {
    id: 'home',
    label: 'Home & property',
    feeds: 'Home value',
    standalone: true,
    description: 'Loads the home valuation.',
  },
  {
    id: 'accounts',
    label: 'Account detail',
    feeds: 'Accounts',
    standalone: true,
    description: 'Loads per-account balances.',
  },
  {
    id: 'transactions',
    label: 'Transaction detail',
    feeds: 'Transactions',
    standalone: true,
    description: 'Loads individual transactions and merchant totals.',
  },
  {
    id: 'spendingReview',
    label: 'Spending review',
    feeds: 'Transactions',
    standalone: false,
    description: 'Loads nothing on its own. Next to a spending word (spending, expenses, budget, cash flow) ' +
      'it switches on Transaction detail — the difference between "what did I spend?" and "review my spending". ' +
      'Adding a term here that is itself a spending word, such as spend*, collapses that distinction and sends ' +
      'every spending question for the full transaction list.',
  },
  {
    id: 'marketContext',
    label: 'Market context',
    feeds: 'Market context',
    standalone: true,
    description: 'Fetches outside market data. Kept narrow on purpose — a false match makes answers slower. ' +
      'Retirement questions load it regardless of these terms: a projection is stated against inflation ' +
      'and rates the user never names, so removing every term here will not switch it off for those.',
  },
  {
    id: 'searchContext',
    label: 'Rates & rules lookup',
    feeds: 'Rates & rules',
    standalone: true,
    description: 'Fetches current rates, limits, and tax rules. Also kept narrow. An explicit ask to search ' +
      '("look it up", "do a web search") switches it on regardless of these terms.',
  },
];

/**
 * The vocabulary as it shipped. Anything an admin has not overridden falls back
 * to these, so a partial or malformed config degrades to known-good behaviour
 * rather than to no matching at all.
 */
export const DEFAULT_ROUTING_TERMS: Record<RoutingCategory, string[]> = {
  retirement: [
    'retir*',
    'withdrawal', 'withdrawals',
    'drawdown', 'draw down',
    'nest egg',
    'financial independence',
    'stop working', 'quit working',
  ],
  investments: [
    'portfolio', 'holding*', 'investment*', 'stock*', 'securities',
    'asset allocation', 'diversif*', 'equities', 'bonds',
    '401k', '403b', 'ira', 'brokerage',
  ],
  home: ['home', 'house', 'property', 'real estate', 'mortgage'],
  accounts: [
    'account', 'accounts', 'balance', 'balances',
    'checking', 'savings', 'loan', 'credit card', 'mortgage',
  ],
  transactions: [
    'transaction*', 'purchase*', 'merchant*', 'categor*',
    'paycheck', 'salary', 'subscription*', 'fee', 'fees',
  ],
  spendingReview: [
    'evaluate', 'evaluating', 'assess', 'assessment', 'analyze', 'analyse',
    'analyzing', 'analysis', 'review', 'reviewing', 'breakdown', 'break down',
    'optimize', 'optimise', 'improve', 'reduce', 'cut', 'trim',
  ],
  marketContext: [
    'market', 'markets', 'inflation', 'economy', 'economic',
    'recession', 'fed', 'federal reserve',
  ],
  searchContext: [
    'apr', 'apy', 'refinance', 'yield', 'tax law', 'tax limit',
    'contribution limit', 'standard deduction',
    'required minimum distribution', 'rmd',
    // Benefit programs are outside rules with figures that change yearly. A user
    // asking to factor Social Security or Medicare into a plan is asking for
    // numbers no connected account holds.
    // Not bare "cola": \b sees the hyphen, so it fires on "coca-cola" and would
    // send a holdings question out to search.
    'social security', 'medicare', 'medicaid',
    'cost of living adjustment', 'cost-of-living adjustment',
  ],
};

const CACHE_TTL_MS = 60_000;

type CompiledVocabulary = Record<RoutingCategory, RegExp | null>;

let cachedTerms: Record<RoutingCategory, string[]> = { ...DEFAULT_ROUTING_TERMS };
let compiled: CompiledVocabulary = compileAll(DEFAULT_ROUTING_TERMS);
let cacheLoadedAt = 0;

function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile one admin-authored term.
 *
 * Everything is escaped first, so the only syntax that survives is a trailing
 * `*`, which becomes a word-character run. Internal whitespace is allowed to
 * stretch so "draw down" also matches "draw  down".
 */
export function compileTerm(term: string): string | null {
  const trimmed = term.trim().toLowerCase();
  if (!trimmed) return null;
  const prefixMatch = trimmed.endsWith('*');
  const literal = prefixMatch ? trimmed.slice(0, -1).trim() : trimmed;
  if (!literal) return null;

  const escaped = escapeLiteral(literal).replace(/\s+/g, String.raw`\s+`);
  // \b would not fire after a trailing non-word character (e.g. "401k)").
  const leading = /^\w/.test(literal) ? String.raw`\b` : '';
  if (prefixMatch) return `${leading}${escaped}\\w*`;
  const trailing = /\w$/.test(literal) ? String.raw`\b` : '';
  return `${leading}${escaped}${trailing}`;
}

function compileCategory(terms: readonly string[]): RegExp | null {
  const parts = terms.map(compileTerm).filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return new RegExp(parts.join('|'), 'i');
}

function compileAll(terms: Record<RoutingCategory, string[]>): CompiledVocabulary {
  return Object.fromEntries(
    ROUTING_CATEGORIES.map((category) => [category, compileCategory(terms[category] || [])])
  ) as CompiledVocabulary;
}

function normalizeTerms(stored: unknown): Record<RoutingCategory, string[]> {
  const normalized = { ...DEFAULT_ROUTING_TERMS };
  if (!stored || typeof stored !== 'object') return normalized;
  for (const category of ROUTING_CATEGORIES) {
    const value = (stored as Record<string, unknown>)[category];
    if (!Array.isArray(value)) continue;
    const terms = value
      .filter((term): term is string => typeof term === 'string')
      .map((term) => term.trim())
      .filter(Boolean);
    // An empty list is a deliberate "match nothing", but a missing key is not.
    normalized[category] = terms;
  }
  return normalized;
}

/** Does the text match this category's vocabulary? */
export function matchesCategory(category: RoutingCategory, text: string): boolean {
  const pattern = compiled[category];
  return pattern ? pattern.test(text) : false;
}

/** Which of this category's terms fired — for the admin tester, not for routing. */
export function matchingTerms(category: RoutingCategory, text: string): string[] {
  return (cachedTerms[category] || []).filter((term) => {
    const part = compileTerm(term);
    return part ? new RegExp(part, 'i').test(text) : false;
  });
}

export function getActiveRoutingTerms(): Record<RoutingCategory, string[]> {
  return cachedTerms;
}

export function setActiveRoutingTerms(stored: unknown): Record<RoutingCategory, string[]> {
  cachedTerms = normalizeTerms(stored);
  compiled = compileAll(cachedTerms);
  cacheLoadedAt = Date.now();
  return cachedTerms;
}

/**
 * Load the vocabulary into the cache. Never throws: on any failure the existing
 * cache stands, so a database problem cannot stop questions being routed.
 */
export async function loadRoutingVocabulary(force = false): Promise<void> {
  if (!force && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return;
  try {
    const prisma = getPrismaClient();
    const row = await prisma.aiPromptConfig.findUnique({ where: { id: AI_PROMPT_CONFIG_ID } });
    setActiveRoutingTerms((row as { routingTerms?: unknown } | null)?.routingTerms);
  } catch (error) {
    console.warn('Failed to load routing vocabulary; using cached/default terms:', error);
    cacheLoadedAt = Date.now();
  }
}

/** Reset to shipped defaults. Intended for tests. */
export function resetRoutingVocabularyCache(): void {
  cachedTerms = { ...DEFAULT_ROUTING_TERMS };
  compiled = compileAll(DEFAULT_ROUTING_TERMS);
  cacheLoadedAt = 0;
}
