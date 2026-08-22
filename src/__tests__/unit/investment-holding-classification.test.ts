import {
  isDeclaredCashType,
  selectDeclaredAssetType,
} from '../../services/investment-holding-classification';

describe('declared asset types', () => {
  it('reads cash and money-market declarations, and only those', () => {
    expect(isDeclaredCashType('cash')).toBe(true);
    expect(isDeclaredCashType('Cash Equivalent')).toBe(true);
    expect(isDeclaredCashType('money market')).toBe(true);
    expect(isDeclaredCashType('equity')).toBe(false);
    expect(isDeclaredCashType(undefined)).toBe(false);
    // A type that merely contains the word is not a declaration of cash.
    expect(isDeclaredCashType('non-cash')).toBe(false);
    expect(isDeclaredCashType('non cash')).toBe(false);
    expect(isDeclaredCashType('cashflow note')).toBe(false);
    // A hyphen next to the word is not itself a negation.
    expect(isDeclaredCashType('cash-equivalent')).toBe(true);
  });

  it('does not let a non-cash type become cash after selectDeclaredAssetType', () => {
    // selectDeclaredAssetType returns `non-cash` as the first specific type.
    // The mapper must use isDeclaredCashType on that result — includes('cash')
    // would still map it onto the cash sleeve.
    expect(selectDeclaredAssetType(['non-cash'])).toBe('non-cash');
    expect(isDeclaredCashType(selectDeclaredAssetType(['non-cash']))).toBe(false);
  });

  it('keeps a declared cash line cash when a metadata provider guessed equity', () => {
    // Callers pass the metadata provider's class first, so an inferred one
    // used to win. That is how a US dollar balance became an equity position
    // with no geography, and mapped to nothing.
    expect(selectDeclaredAssetType(['Equity', 'cash', 'cash'])).toBe('cash');
  });

  it('still lets fixed income win, since it also vetoes target-date inference', () => {
    expect(selectDeclaredAssetType(['cash', 'Treasury Bond'])).toBe('Treasury Bond');
  });

  it('leaves every other conflict on the first specific type', () => {
    expect(selectDeclaredAssetType(['Equity', 'etf'])).toBe('Equity');
    expect(selectDeclaredAssetType(['etf', 'unknown'])).toBe('etf');
    expect(selectDeclaredAssetType([])).toBe('');
  });
});
