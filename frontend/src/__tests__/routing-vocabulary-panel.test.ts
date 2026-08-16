import { matchOutcome } from '../components/admin/RoutingVocabularyPanel';

const NEED_KEY_BY_LABEL: Record<string, string> = {
  Retirement: 'needsRetirement',
  Investments: 'needsInvestments',
  Transactions: 'needsTransactionDetails',
};

describe('routing tester match outcome', () => {
  it('confirms a match that changed the routing', () => {
    expect(matchOutcome(
      { feeds: 'Retirement', standalone: true },
      { needsRetirement: true },
      NEED_KEY_BY_LABEL
    )).toBe('applied');
  });

  it('reports a match a built-in rule overrode', () => {
    // "How is the stock market doing today?" matches the investments term
    // stock*, and the stock-market exception deliberately leaves holdings off.
    expect(matchOutcome(
      { feeds: 'Investments', standalone: true },
      { needsInvestments: false },
      NEED_KEY_BY_LABEL
    )).toBe('overridden');

    // Same shape for "should I retire my mortgage early?" against retir*.
    expect(matchOutcome(
      { feeds: 'Retirement', standalone: true },
      { needsRetirement: false },
      NEED_KEY_BY_LABEL
    )).toBe('overridden');
  });

  it('distinguishes a modifier still waiting on its companion word', () => {
    expect(matchOutcome(
      { feeds: 'Transactions', standalone: false },
      { needsTransactionDetails: false },
      NEED_KEY_BY_LABEL
    )).toBe('awaiting-companion');
  });

  it('does not claim an override when the need is unknown', () => {
    expect(matchOutcome(
      { feeds: 'Something new', standalone: true },
      {},
      NEED_KEY_BY_LABEL
    )).toBe('applied');
    expect(matchOutcome(undefined, {}, NEED_KEY_BY_LABEL)).toBe('applied');
  });
});
