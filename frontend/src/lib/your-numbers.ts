/**
 * Your numbers: the retirement plan a user saved for Ask Linc to work from,
 * the "Use these next time?" offer under an answer, and the signed-in calls
 * both make. See `src/services/stated-figures.ts` on the server.
 */

export const STATED_FIGURE_KEYS = [
  'retirementAge',
  'annualRetirementSpending',
  'annualContribution',
  'retirementIncome',
  'socialSecurityAnnual',
  'socialSecurityStartAge',
  'planThroughAge',
  'allocation',
] as const;

export type StatedFigureKey = (typeof STATED_FIGURE_KEYS)[number];

export interface StatedFigure {
  value: number | string;
  savedAt: string;
  source: 'page' | 'answer';
}

export type StatedFigures = Partial<Record<StatedFigureKey, StatedFigure>>;

export type BalanceBasis = 'linked' | 'entered' | 'linked_and_entered';

/** What the user's accounts already say, so the page asks only for what they do not. */
export interface FigureCoverage {
  investments: BalanceBasis | null;
  cash: BalanceBasis | null;
  debt: BalanceBasis | null;
  incomeFromTransactions: boolean;
  spendingFromTransactions: boolean;
}

export interface DisplaySaveOfferItem {
  key: StatedFigureKey | 'investedBalance';
  label: string;
  value: number | string;
  display: string;
}

export interface DisplaySaveOffer {
  calculatorId: string;
  items: DisplaySaveOfferItem[];
}

/** The manual account a saved balance becomes, so Ask Linc reads it like any other entered balance. */
export const INVESTED_BALANCE_ACCOUNT_NAME = 'Invested for retirement';

/** A signed-in request to the API. */
export async function sendSignedInRequest(apiUrl: string, path: string, method: string, body?: unknown): Promise<Response> {
  let token: string | null = null;
  try {
    token = localStorage.getItem('auth_token');
  } catch {
    token = null;
  }
  return fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** The server's message for a failed save, or a plain one. */
export async function failureMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    const rejected = data?.rejected && typeof data.rejected === 'object' ? Object.values(data.rejected) : [];
    const first = rejected.find((item): item is string => typeof item === 'string');
    if (first) return first;
    if (typeof data?.error === 'string' && data.error) return data.error;
  } catch {
    // Not JSON: the fallback says enough.
  }
  return fallback;
}

/**
 * Save what the user ticked in an offer: the plan to Your numbers and the
 * balance to a manual account. Throws with a message the card can show.
 */
export async function saveOfferedFigures(apiUrl: string, items: readonly DisplaySaveOfferItem[]): Promise<void> {
  const figures = Object.fromEntries(
    items.filter((item) => item.key !== 'investedBalance').map((item) => [item.key, item.value])
  );
  const balance = items.find((item) => item.key === 'investedBalance');
  if (Object.keys(figures).length > 0) {
    const response = await sendSignedInRequest(apiUrl, '/api/stated-figures', 'PUT', { figures, source: 'answer' });
    if (!response.ok) throw new Error(await failureMessage(response, 'Your numbers could not be saved.'));
  }
  if (balance && typeof balance.value === 'number') {
    const response = await sendSignedInRequest(apiUrl, '/api/manual-accounts', 'POST', {
      name: INVESTED_BALANCE_ACCOUNT_NAME,
      amount: balance.value,
      type: 'investment',
    });
    if (!response.ok) throw new Error(await failureMessage(response, 'The balance could not be saved.'));
  }
}
