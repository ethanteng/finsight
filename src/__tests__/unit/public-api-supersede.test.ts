import { supersedeSnapTradePublicAccounts } from '../../services/public-api/supersede-snaptrade';
import { isPublicInstitution } from '../../services/public-api/eligibility';

/**
 * The failure this guards against is double-counting: a user with both a direct
 * Public secret and a live Public connection through SnapTrade would otherwise
 * have every Public account added to their net worth twice, and Ask Linc would
 * answer from a snapshot carrying the doubled figure.
 */

const snapTradeData = () => ({
  accounts: [
    { account_id: 'snaptrade-aaa', institution: 'Public', source: 'snaptrade' },
    { account_id: 'snaptrade-bbb', institution: 'Public', source: 'snaptrade' },
    { account_id: 'snaptrade-ccc', institution: 'Fidelity', source: 'snaptrade' },
  ],
  holdings: [
    { account_id: 'snaptrade-aaa', security_id: 's1' },
    { account_id: 'snaptrade-ccc', security_id: 's2' },
  ],
  transactions: [
    { account_id: 'snaptrade-bbb', id: 't1' },
    { account_id: 'snaptrade-ccc', id: 't2' },
  ],
});

describe('superseding SnapTrade Public accounts', () => {
  it('drops every Public account when direct data is present', () => {
    const { data, supersededAccountIds } = supersedeSnapTradePublicAccounts(snapTradeData(), true);

    expect(data!.accounts.map(a => a.account_id)).toEqual(['snaptrade-ccc']);
    expect(supersededAccountIds.sort()).toEqual(['snaptrade-aaa', 'snaptrade-bbb']);
  });

  // An orphaned holding still counts toward investment totals, so leaving it
  // behind would preserve the double-count this exists to prevent.
  it('drops the holdings and transactions of the superseded accounts', () => {
    const { data } = supersedeSnapTradePublicAccounts(snapTradeData(), true);

    expect(data!.holdings.map(h => h.account_id)).toEqual(['snaptrade-ccc']);
    expect(data!.transactions.map(t => t.account_id)).toEqual(['snaptrade-ccc']);
  });

  it('leaves other institutions untouched', () => {
    const { data } = supersedeSnapTradePublicAccounts(snapTradeData(), true);

    expect(data!.accounts).toHaveLength(1);
    expect(data!.accounts[0].institution).toBe('Fidelity');
  });

  it('changes nothing when the user has no direct Public data', () => {
    const input = snapTradeData();
    const { data, supersededAccountIds } = supersedeSnapTradePublicAccounts(input, false);

    expect(data).toBe(input);
    expect(supersededAccountIds).toEqual([]);
  });

  // Auth/list failures must pass false here. Suppressing on that path would
  // drop SnapTrade's still-working Public brokerage for a bad secret.
  it('leaves SnapTrade Public accounts when the caller reports no successful observation', () => {
    const { data, supersededAccountIds } = supersedeSnapTradePublicAccounts(snapTradeData(), false);

    expect(data!.accounts).toHaveLength(3);
    expect(supersededAccountIds).toEqual([]);
  });

  // A pass that reached Public and found nothing must still suppress: leaving
  // SnapTrade's copies would show two sources disagreeing about which accounts
  // exist, rather than one source reporting none.
  it('suppresses even when the direct fetch returned no accounts', () => {
    const { data } = supersedeSnapTradePublicAccounts(snapTradeData(), true);

    expect(data!.accounts.every(a => !isPublicInstitution(a.institution))).toBe(true);
  });

  it('tolerates a null or account-less SnapTrade payload', () => {
    expect(supersedeSnapTradePublicAccounts(null, true).data).toBeNull();
    expect(supersedeSnapTradePublicAccounts({}, true).supersededAccountIds).toEqual([]);
  });
});

describe('recognising Public as an institution', () => {
  it.each(['Public', 'public', 'Public.com', 'Public Investing', '  Public  '])(
    'matches %s',
    label => expect(isPublicInstitution(label)).toBe(true),
  );

  // A near-miss here silently denies eligibility, and worse, a false positive
  // would drop a different brokerage's accounts from the user's net worth.
  it.each(['Publix', 'Republic', 'Public Storage REIT', 'Fidelity', '', null, undefined])(
    'does not match %s',
    label => expect(isPublicInstitution(label as any)).toBe(false),
  );
});
