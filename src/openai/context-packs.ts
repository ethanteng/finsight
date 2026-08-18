import type { QuestionNeeds } from './types';

/**
 * Optional context the analysis can ask the application to supply. Aggregate
 * financial truth (net worth, cash-flow averages, portfolio totals and asset
 * allocation) is always present and therefore is deliberately not a pack.
 */
export const CONTEXT_PACK_IDS = [
  'account_details',
  'transaction_details',
  'investment_details',
  'monthly_cash_flow',
  'user_profile',
  'home_value',
  'retirement_analysis',
  'market_context',
  'search_context',
] as const;

export type ContextPackId = (typeof CONTEXT_PACK_IDS)[number];

export interface ContextPackMeta {
  id: ContextPackId;
  label: string;
  description: string;
  cost: 'local' | 'computed' | 'external';
  dependencies: ContextPackId[];
}

export const CONTEXT_PACKS: ContextPackMeta[] = [
  {
    id: 'account_details',
    label: 'Account details',
    description: 'Individual account names, institutions, types and balances. Aggregate cash, debt and investment totals are already always available.',
    cost: 'local',
    dependencies: [],
  },
  {
    id: 'transaction_details',
    label: 'Transaction details',
    description: 'Recent individual transactions, merchants and merchant totals. Category totals and average monthly income/expenses are already always available.',
    cost: 'local',
    dependencies: [],
  },
  {
    id: 'investment_details',
    label: 'Investment details',
    description: 'Individual holdings plus current Tiingo quotes and FMP fund fees, country allocation and sector weighting when available. Portfolio value, holding count and asset allocation are already always available.',
    cost: 'external',
    dependencies: ['account_details'],
  },
  {
    id: 'monthly_cash_flow',
    label: 'Monthly cash flow',
    description: 'Month-by-month income, expenses and operating cash flow for questions about a particular period or trend.',
    cost: 'computed',
    dependencies: [],
  },
  {
    id: 'user_profile',
    label: 'User profile',
    description: 'Persisted goals, ages, family situation, risk preferences and other user-stated planning context.',
    cost: 'local',
    dependencies: [],
  },
  {
    id: 'home_value',
    label: 'Home value',
    description: 'Home address and the latest available property valuation context.',
    cost: 'local',
    dependencies: ['user_profile'],
  },
  {
    id: 'retirement_analysis',
    label: 'Retirement analysis',
    description: 'Deterministic retirement projection, stress test, assumptions and missing-input state.',
    cost: 'computed',
    dependencies: ['investment_details', 'user_profile', 'market_context'],
  },
  {
    id: 'market_context',
    label: 'Market context',
    description: 'Current or recently cached economic indicators, inflation, rates and broad market conditions.',
    cost: 'external',
    dependencies: [],
  },
  {
    id: 'search_context',
    label: 'Rates and rules lookup',
    description: 'Live retrieval for current rates, prices, laws, limits, benefit rules and other facts outside the user snapshot.',
    cost: 'external',
    dependencies: [],
  },
];

const PACK_ID_SET = new Set<string>(CONTEXT_PACK_IDS);
const PACK_BY_ID = new Map(CONTEXT_PACKS.map((pack) => [pack.id, pack]));

export function isContextPackId(value: unknown): value is ContextPackId {
  return typeof value === 'string' && PACK_ID_SET.has(value);
}

/** Add transitive application-level dependencies and return catalog order. */
export function normalizeContextPacks(input: readonly ContextPackId[]): ContextPackId[] {
  const selected = new Set<ContextPackId>(input);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Array.from(selected)) {
      for (const dependency of PACK_BY_ID.get(id)?.dependencies ?? []) {
        if (selected.has(dependency)) continue;
        selected.add(dependency);
        changed = true;
      }
    }
  }
  return CONTEXT_PACK_IDS.filter((id) => selected.has(id));
}

export function allContextPacks(): ContextPackId[] {
  return [...CONTEXT_PACK_IDS];
}

export function questionNeedsFromPacks(
  packs: readonly ContextPackId[],
  needsSecondaryValidation: boolean
): QuestionNeeds {
  const selected = new Set(normalizeContextPacks(packs));
  return {
    needsMarketContext: selected.has('market_context'),
    needsSearchContext: selected.has('search_context'),
    needsHomeValue: selected.has('home_value'),
    needsInvestments: selected.has('investment_details'),
    needsRetirement: selected.has('retirement_analysis'),
    needsAccountDetails: selected.has('account_details'),
    needsTransactionDetails: selected.has('transaction_details'),
    needsMonthlyCashFlow: selected.has('monthly_cash_flow'),
    needsUserProfile: selected.has('user_profile'),
    needsSecondaryValidation,
  };
}

export function contextPackCatalogForPrompt(): string {
  return CONTEXT_PACKS.map((pack) => {
    const dependencies = pack.dependencies.length > 0
      ? ` Dependencies: ${pack.dependencies.join(', ')}.`
      : '';
    return `- ${pack.id} (${pack.cost}): ${pack.description}${dependencies}`;
  }).join('\n');
}
