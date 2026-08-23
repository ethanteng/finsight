import { getTaxLotHoldings } from '../../services/public-api/client';
import { mapPublicAccount, publicObservationTime } from '../../services/public-api/account-mapper';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as any;
}

const LOT = (over: Record<string, unknown> = {}) => ({
  symbol: 'TBILL', companyName: 'US Treasury Bill',
  quantity: '10', costBasis: '9800', unitCost: '980',
  currentPrice: '990', currentValue: '9900', gainLoss: '100',
  ...over,
});

describe('valuing an account from its tax lots', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the documented tax-lot path', async () => {
    fetchMock.mockResolvedValue(ok({ asOf: '2026-08-22', lots: [] }));

    await getTaxLotHoldings('tok', '3CR23334');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.public.com/userapigateway/trading/3CR23334/taxlots/unrealized',
    );
  });

  it('sums current market value across lots', async () => {
    fetchMock.mockResolvedValue(ok({
      asOf: '2026-08-22',
      lots: [LOT({ symbol: 'A', currentValue: '100' }), LOT({ symbol: 'B', currentValue: '250.50' })],
    }));

    const holdings = await getTaxLotHoldings('tok', 'acct');

    expect(holdings.totalValue).toBe(350.5);
    expect(holdings.asOf).toBe('2026-08-22');
  });

  // Tax lots are per purchase, so one security routinely appears several times.
  // Leaving them split would show the same holding three times at a third size.
  it('aggregates lots of the same symbol into one position', async () => {
    fetchMock.mockResolvedValue(ok({
      asOf: '2026-08-22',
      lots: [
        LOT({ quantity: '10', currentValue: '9900' }),
        LOT({ quantity: '5', currentValue: '4950' }),
      ],
    }));

    const holdings = await getTaxLotHoldings('tok', 'acct');

    expect(holdings.positions).toHaveLength(1);
    expect(holdings.positions[0]).toMatchObject({ symbol: 'TBILL', quantity: 15, currentValue: 14850 });
    // Per-share price is shared across lots, not accumulated.
    expect(holdings.positions[0].lastPrice).toBe(990);
  });

  // A pure cash product (HIGH_YIELD) returns lots with nothing in them. Its
  // value is unknown, not zero, and a confident zero is the failure this whole
  // integration exists to stop.
  it('reports null rather than zero when an account has no lots', async () => {
    fetchMock.mockResolvedValue(ok({ asOf: '2026-08-22', lots: [] }));

    const holdings = await getTaxLotHoldings('tok', '2OE66869');

    expect(holdings.totalValue).toBeNull();
    expect(holdings.positions).toEqual([]);
  });

  // Lots that name a security but carry no currentValue must not sum to zero
  // via `(null ?? 0)` -- that is the same confident-zero failure as an empty list.
  it('reports null rather than zero when lots lack currentValue', async () => {
    fetchMock.mockResolvedValue(ok({
      asOf: '2026-08-22',
      lots: [
        LOT({ currentValue: '', currentPrice: '' }),
        LOT({ quantity: '5', currentValue: null, currentPrice: null }),
      ],
    }));

    const holdings = await getTaxLotHoldings('tok', 'acct');

    expect(holdings.totalValue).toBeNull();
    expect(holdings.positions[0].currentValue).toBeNull();
  });

  it('keeps a partial sum when only some lots report currentValue', async () => {
    fetchMock.mockResolvedValue(ok({
      asOf: '2026-08-22',
      lots: [
        LOT({ symbol: 'A', currentValue: '100' }),
        LOT({ symbol: 'B', currentValue: null }),
      ],
    }));

    const holdings = await getTaxLotHoldings('tok', 'acct');

    expect(holdings.totalValue).toBe(100);
    expect(holdings.positions).toHaveLength(2);
  });

  it('does not invent a security type the lots never carried', async () => {
    fetchMock.mockResolvedValue(ok({ asOf: '2026-08-22', lots: [LOT()] }));

    const holdings = await getTaxLotHoldings('tok', 'acct');

    expect(holdings.positions[0].instrumentType).toBeNull();
  });
});

describe('observation time for a tax-lot valuation', () => {
  const portfolio = (over: Record<string, unknown> = {}) => ({
    accountId: 'a', accountType: 'TREASURY', totalAccountValue: 100,
    cash: null, positions: [], ...over,
  }) as any;

  it('uses our fetch time when the portfolio endpoint served the account', () => {
    expect(publicObservationTime(portfolio(), '2026-08-22T23:00:00.000Z'))
      .toBe('2026-08-22T23:00:00.000Z');
  });

  // Our fetch time would overstate the freshness of a figure Public valued
  // earlier -- the mistake #146 and #150 exist to correct.
  it("prefers Public's valuation date when the value came from tax lots", () => {
    const observed = publicObservationTime(
      portfolio({ valuedFromTaxLots: true, taxLotsAsOf: '2026-08-21' }),
      '2026-08-22T23:00:00.000Z',
    );

    expect(observed.startsWith('2026-08-21')).toBe(true);
  });

  // A date-only ISO string parses as UTC midnight, which toLocaleDateString
  // renders as the previous day everywhere west of Greenwich.
  it('anchors a bare date at midday so it does not display a day early', () => {
    const observed = publicObservationTime(
      portfolio({ valuedFromTaxLots: true, taxLotsAsOf: '2026-08-21' }),
      '2026-08-22T23:00:00.000Z',
    );

    expect(observed).toBe('2026-08-21T12:00:00.000Z');
    expect(new Date(observed).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }))
      .toBe('8/21/2026');
  });

  it('falls back to the fetch time when the date is unparseable', () => {
    expect(publicObservationTime(
      portfolio({ valuedFromTaxLots: true, taxLotsAsOf: 'not-a-date' }),
      '2026-08-22T23:00:00.000Z',
    )).toBe('2026-08-22T23:00:00.000Z');
  });

  it('marks the account as tax-lot valued so the source is not lost', () => {
    const account = mapPublicAccount(
      portfolio({ valuedFromTaxLots: true, taxLotsAsOf: '2026-08-21' }),
      '2026-08-22T23:00:00.000Z',
    );

    expect(account.valuedFromTaxLots).toBe(true);
    expect(account.lastSyncedAt).toBe('2026-08-21T12:00:00.000Z');
  });
});
