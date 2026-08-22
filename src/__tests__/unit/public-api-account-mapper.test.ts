import { classifyAccount } from '../../services/account-classifier';
import {
  mapPublicAccount,
  publicAccountKind,
  mapPublicHoldings,
  publicAccountBalance,
  publicAccountLabel,
  publicAccountSubtype,
} from '../../services/public-api/account-mapper';
import type { PublicPortfolio } from '../../services/public-api/client';

const OBSERVED_AT = '2026-08-22T18:00:00.000Z';

function portfolio(overrides: Partial<PublicPortfolio> = {}): PublicPortfolio {
  return {
    accountId: 'abc',
    accountType: 'TREASURY',
    totalAccountValue: 227261.16,
    cash: 0,
    positions: [],
    ...overrides,
  };
}

describe('mapping Public accounts', () => {
  // SnapTrade surfaced these as "High_yield Account" and "Bond_account Account",
  // visibly derived from an enum. The direct feed should not inherit that.
  it.each([
    ['TREASURY', 'Treasury Account', 'treasury'],
    ['HIGH_YIELD', 'High Yield Cash Account', 'cash management'],
    ['BOND_ACCOUNT', 'Bond Account', 'bond'],
    ['BROKERAGE', 'Brokerage Account', 'brokerage'],
    ['ROTH_IRA', 'Roth IRA', 'roth'],
  ])('names and types %s as %s', (type, label, subtype) => {
    expect(publicAccountLabel(type)).toBe(label);
    expect(publicAccountSubtype(type)).toBe(subtype);
  });

  // `classifyAccount` tests `type === 'investment'` before it looks at cash
  // subtypes, so an investment-typed High Yield account never reaches the cash
  // branch and its balance lands in investments rather than totalCash.
  it('types High Yield Cash as a depository account so it counts as cash', () => {
    expect(publicAccountKind('HIGH_YIELD')).toBe('depository');

    const account = mapPublicAccount(portfolio({ accountType: 'HIGH_YIELD' }), OBSERVED_AT);
    const classified = classifyAccount(account as any);

    expect(classified.isCash).toBe(true);
    expect(classified.isInvestment).toBe(false);
    expect(classified.category).toBe('cash');
  });

  // Yield products, but the assets behind them are securities.
  it.each(['TREASURY', 'BOND_ACCOUNT', 'BROKERAGE'])('keeps %s an investment account', type => {
    expect(publicAccountKind(type)).toBe('investment');

    const classified = classifyAccount(mapPublicAccount(portfolio({ accountType: type }), OBSERVED_AT) as any);
    expect(classified.isInvestment).toBe(true);
  });

  it('falls back for an account type Public adds later', () => {
    expect(publicAccountLabel('SOMETHING_NEW')).toBe('Public Account');
    expect(publicAccountSubtype('SOMETHING_NEW')).toBe('brokerage');
  });

  // The whole point: these accounts hold value as a balance, not as itemized
  // positions, so summing positions would report them as zero.
  it('takes the reported total even when there are no positions', () => {
    expect(publicAccountBalance(portfolio({ positions: [] }))).toBe(227261.16);
  });

  it('derives a total from positions and cash when none is reported', () => {
    const value = publicAccountBalance(portfolio({
      totalAccountValue: null,
      cash: 500,
      positions: [{ symbol: 'X', name: 'X', instrumentType: 'EQUITY', quantity: 1, currentValue: 1500, lastPrice: 1500 }],
    }));
    expect(value).toBe(2000);
  });

  // Zero from an empty payload means "nothing was reported", and must stay null
  // so the snapshot marks it unavailable rather than publishing a confident zero.
  it('reports null when nothing at all was reported', () => {
    expect(publicAccountBalance(portfolio({ totalAccountValue: null, cash: null, positions: [] }))).toBeNull();
  });

  it('maps to the shared account shape with Public as the institution', () => {
    const account = mapPublicAccount(portfolio(), OBSERVED_AT);

    expect(account).toMatchObject({
      account_id: 'public-abc',
      id: 'public-abc',
      name: 'Treasury Account',
      type: 'investment',
      subtype: 'treasury',
      institution: 'Public',
      source: 'public',
      persistentAccountId: 'public-abc',
      snapshotTimestamp: OBSERVED_AT,
      lastSyncedAt: OBSERVED_AT,
    });
    expect(account.balance.current).toBe(227261.16);
  });

  it('leaves available unset rather than null when there is no balance', () => {
    const account = mapPublicAccount(
      portfolio({ totalAccountValue: null, cash: null, positions: [] }),
      OBSERVED_AT,
    );

    expect(account.balance.current).toBeNull();
    expect('available' in account.balance).toBe(false);
  });

  it('namespaces holdings so a symbol cannot collide with another provider', () => {
    const holdings = mapPublicHoldings(
      portfolio({
        positions: [{ symbol: 'AAPL', name: 'Apple', instrumentType: 'EQUITY', quantity: 3, currentValue: 600, lastPrice: 200 }],
      }),
      OBSERVED_AT,
    );

    expect(holdings).toEqual([{
      id: 'public-abc|public-AAPL',
      account_id: 'public-abc',
      security_id: 'public-AAPL',
      institution_value: 600,
      institution_price: 200,
      institution_price_as_of: OBSERVED_AT,
      cost_basis: null,
      quantity: 3,
      iso_currency_code: 'USD',
      security_name: 'Apple',
      security_type: 'EQUITY',
      ticker_symbol: 'AAPL',
    }]);
  });

  it('skips a position with neither a symbol nor a name', () => {
    const holdings = mapPublicHoldings(
      portfolio({
        positions: [{ symbol: null, name: null, instrumentType: null, quantity: 1, currentValue: 5, lastPrice: 5 }],
      }),
      OBSERVED_AT,
    );

    expect(holdings).toEqual([]);
  });
});
