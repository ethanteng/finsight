import { buildCanonicalSnapshotCore } from '../../services/canonical-financial-snapshot';
import { mergeFinancialSources } from '../../services/financial-calculations';
import { mapPublicAccount } from '../../services/public-api/account-mapper';

/**
 * An account valued from its own positions reports a total that is a floor, not
 * a figure the institution stands behind.
 *
 * The holdings-coverage check cannot catch this. It fires when the reported
 * balance *exceeds* the itemized positions; here the two are equal by
 * construction, so the account looks fully explained while any uninvested cash
 * it holds is silently absent from net worth.
 */

const HOLDING = {
  id: 'h1',
  account_id: 'public-3CR23334',
  security_id: 'public-TBILL',
  institution_value: 227261.16,
  institution_price_as_of: '2026-08-21T12:00:00.000Z',
  iso_currency_code: 'USD',
  security_type: null,
};

function snapshotWith(accountOverrides: Record<string, unknown>) {
  return buildCanonicalSnapshotCore({
    accounts: [{
      account_id: 'public-3CR23334',
      id: 'public-3CR23334',
      name: 'Treasury Account',
      type: 'investment',
      subtype: 'treasury',
      source: 'public',
      institution: 'Public',
      snapshotTimestamp: '2026-08-21T12:00:00.000Z',
      lastSyncedAt: '2026-08-21T12:00:00.000Z',
      balance: { current: 227261.16, iso_currency_code: 'USD' },
      ...accountOverrides,
    }],
    investments: { holdings: [HOLDING], securities: [] },
  } as any);
}

function derivedObservation(snapshot: any) {
  return (snapshot.sourceObservations || [])
    .find((o: any) => o.id === 'account:public-3CR23334:balance-derived');
}

describe('an account balance derived from its own positions', () => {
  it('records that the total excludes uninvested cash', () => {
    const observation = derivedObservation(snapshotWith({ balanceDerivedFromPositions: true }));

    expect(observation).toBeDefined();
    expect(observation.error).toMatch(/uninvested cash/i);
    expect(observation.error).toMatch(/sum of its itemized positions/i);
  });

  // The value is the best one available and is already in the total, so nothing
  // the snapshot can see is missing -- same reasoning as a coverage gap.
  it('does not gate snapshot quality on it', () => {
    const observation = derivedObservation(snapshotWith({ balanceDerivedFromPositions: true }));

    expect(observation.required).toBe(false);
  });

  // The point of the flag: without it, equal balance and holdings look complete.
  it('says nothing for an institution-reported balance', () => {
    expect(derivedObservation(snapshotWith({}))).toBeUndefined();
  });

  it('says nothing for a non-investment account', () => {
    const observation = derivedObservation(snapshotWith({
      balanceDerivedFromPositions: true,
      type: 'depository',
      subtype: 'cash management',
    }));

    expect(observation).toBeUndefined();
  });

  // The flag has to survive the merge to be worth anything. It crosses from the
  // Public mapper through mergeFinancialSources to the snapshot, and an
  // undeclared field is one a refactor drops silently.
  it('survives the merge from a Public account into the snapshot', () => {
    const publicAccount = mapPublicAccount(
      {
        accountId: '3CR23334', accountType: 'TREASURY', totalAccountValue: 227261.16,
        cash: null, positions: [], valuedFromTaxLots: true, taxLotsAsOf: '2026-08-21',
      } as any,
      '2026-08-22T00:00:00.000Z',
    );

    const merged = mergeFinancialSources(null, null, null, null, {
      accounts: [publicAccount as any],
      holdings: [],
    } as any);

    const snapshot: any = buildCanonicalSnapshotCore({
      accounts: merged.accounts,
      investments: { holdings: [HOLDING], securities: [] },
    } as any);

    expect(merged.accounts[0].balanceDerivedFromPositions).toBe(true);
    expect((snapshot.sourceObservations || []).some(
      (o: any) => o.id === 'account:public-3CR23334:balance-derived',
    )).toBe(true);
  });

  // The coverage check is structurally blind here, which is why the flag has to
  // carry the fact instead.
  it('emits no holdings-coverage gap, because the two figures match exactly', () => {
    const snapshot: any = snapshotWith({ balanceDerivedFromPositions: true });

    expect(snapshot.investmentPortfolio.holdingsCoverageGaps).toEqual([]);
  });
});
