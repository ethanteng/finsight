const BOND_TICKERS = new Set([
  'AGG', 'BND', 'BNDX', 'BOND', 'EAGG', 'EMB', 'HYG', 'IEF', 'IUSB',
  'JCPB', 'JPST', 'LQD', 'MUB', 'SCHP', 'SHY', 'STIP', 'TIP', 'TLT',
  'VCIT', 'VCSH', 'VTIP', 'VWOB',
]);

const INTERNATIONAL_EQUITY_TICKERS = new Set(['EFA', 'IXUS', 'VEA', 'VWO', 'VXUS']);
const TIPS_TICKERS = new Set(['SCHP', 'STIP', 'TIP', 'VTIP']);
const CREDIT_TICKERS = new Set(['HYG', 'JCPB', 'JPST', 'LQD', 'MUB', 'VCIT', 'VCSH']);
// EAGG is the iShares ESG Aware U.S. Aggregate Bond ETF — US aggregate, not
// international — and must stay on the nominal government/aggregate path.
const INTERNATIONAL_BOND_TICKERS = new Set(['BNDX', 'EMB', 'VWOB']);
const REAL_ASSET_TICKERS = new Set(['DBC', 'GLD', 'GSG', 'IAU', 'PDBC', 'VNQ', 'VNQI']);

export {
  isContainerAssetType,
  isDeclaredCashType,
  isDeclaredFixedIncomeType,
  selectDeclaredAssetType,
} from '../../services/investment-holding-classification';

export function isKnownBondTicker(ticker: string): boolean {
  return BOND_TICKERS.has(ticker.trim().toUpperCase());
}

export function isKnownTipsTicker(ticker: string): boolean {
  return TIPS_TICKERS.has(ticker.trim().toUpperCase());
}

export function isKnownCreditTicker(ticker: string): boolean {
  return CREDIT_TICKERS.has(ticker.trim().toUpperCase());
}

export function isKnownInternationalBondTicker(ticker: string): boolean {
  return INTERNATIONAL_BOND_TICKERS.has(ticker.trim().toUpperCase());
}

export function isKnownRealAssetTicker(ticker: string): boolean {
  return REAL_ASSET_TICKERS.has(ticker.trim().toUpperCase());
}

/**
 * The `UST` abbreviation custodians use for an individual Treasury line, as in
 * `UST 3.5% 02/15/2029` or `UST 0% 10/29/2026` (a STRIP).
 *
 * The abbreviation alone is not evidence: `UST` has been a listed equity ticker
 * and can sit inside a company name. Require the instrument shape that only a
 * bond line carries -- a coupon rate or a maturity date -- so a security merely
 * named for those letters is never pulled into the bond sleeve.
 *
 * These lines arrive with no ticker (the custodian identifies them by CUSIP).
 * We now carry that CUSIP on the security, but nothing resolves it yet, so the
 * name remains the only evidence classification can use. That leaves one
 * ambiguity the name cannot settle: a TIPS issue whose label omits the word
 * reads exactly like a nominal note and is classified as nominal here. The
 * same ambiguity already applies to every `treasury` name below; resolving the
 * CUSIP against the Treasury's own auction data is what removes it, not a
 * longer list of words.
 */
const TREASURY_ABBREVIATION_PATTERN = /\b(?:ust|u\.s\.t)\b/;
const BOND_INSTRUMENT_SHAPE = /\d+(?:\.\d+)?\s*%|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

export function hasTreasuryAbbreviationSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return TREASURY_ABBREVIATION_PATTERN.test(normalized) &&
    BOND_INSTRUMENT_SHAPE.test(normalized);
}

export function hasBondNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return ['bond', 'fixed income', 'treasury', 'tips', 'aggregate', 'corporate credit']
    .some(signal => normalized.includes(signal)) ||
    hasTreasuryAbbreviationSignal(name);
}

export function hasTipsNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return ['tips', 'inflation protected', 'inflation-protected']
    .some(signal => normalized.includes(signal));
}

export function hasCreditNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return ['corporate credit', 'corporate bond', 'high yield bond', 'municipal bond', 'muni bond']
    .some(signal => normalized.includes(signal));
}

export function hasInternationalBondNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return [
    'international bond', 'global bond', 'global aggregate bond', 'world bond',
    'ex-us bond', 'ex us bond', 'emerging market bond', 'emerging markets bond',
  ]
    .some(signal => normalized.includes(signal));
}

export function hasRealAssetNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return ['real estate', 'reit', 'commodit', 'infrastructure', 'natural resources', 'precious metal']
    .some(signal => normalized.includes(signal));
}

export function isInternationalEquityTicker(ticker: string): boolean {
  return INTERNATIONAL_EQUITY_TICKERS.has(ticker.trim().toUpperCase());
}

export function isGlobalEquity(geographicFocus: string, securityName: string): boolean {
  const geography = geographicFocus.toLowerCase();
  const name = securityName.toLowerCase();
  if (geography === 'global' || geography === 'world') return true;
  if (geography === 'us' || geography === 'international' || geography === 'ex-us') return false;
  // An explicit ex-US/international name is more specific than a generic
  // "global" token (for example, "Global ex-US Equity").
  if (name.includes('international') || name.includes('ex-us')) return false;
  return name.includes('global') || name.includes('all-world') || name.includes('world stock');
}

export function isInternationalEquity(
  geographicFocus: string,
  securityName: string,
  ticker: string
): boolean {
  const geography = geographicFocus.toLowerCase();
  const name = securityName.toLowerCase();
  if (geography === 'international' || geography === 'ex-us') return true;
  if (geography === 'us') return false;
  return name.includes('international') || name.includes('ex-us') ||
    isInternationalEquityTicker(ticker);
}

/**
 * Equity signals in a fund's name.
 *
 * Institutional and employer-plan share classes rarely carry a usable provider
 * type -- they arrive as "Mutual Fund" or with no type at all -- and their
 * tickers are often too long to look like a stock symbol. Their names, however,
 * state their mandate plainly: "Large Cap Growth Fund", "S&P 500 Indx SL Sr Fd
 * Cl X". Reading the name is the only evidence available for these.
 *
 * Checked after bond and cash signals so a bond index fund or a government cash
 * reserve is never pulled into equity by an index-family word in its name.
 */
const EQUITY_NAME_SIGNALS = [
  'equity', 'stock',
  'large cap', 'large-cap', 'largecap',
  'mid cap', 'mid-cap', 'midcap',
  'small cap', 'small-cap', 'smallcap',
  'micro cap', 'micro-cap',
  's&p', 'russell', 'nasdaq', 'dow jones', 'wilshire', 'msci', 'ftse',
  'total market', 'total stock',
  'growth fund', 'value fund', 'growth index', 'value index',
  'emerging markets', 'developed markets', 'eafe',
];

/**
 * Cash signals. Checked before bonds so a Treasury money-market fund lands in
 * cash rather than being caught by the "treasury" bond signal, and before
 * equity so a fund like "Government Cash Reserves" is not swept up by the
 * ticker-shaped-like-a-stock fallback.
 */
/**
 * Cash signals, including the book-value products employer plans offer in
 * place of a money-market fund.
 *
 * A guaranteed interest account or stable-value fund is an insurer or bank
 * contract: principal does not fluctuate and a credited rate is declared in
 * advance. No custodian type describes it, no fund registry covers it, and no
 * market-data vendor prices it -- the name is the only evidence there will
 * ever be, which is why it is read here rather than sourced.
 *
 * Cash is the conservative reading rather than the exact one. These contracts
 * credit closer to intermediate bond yields than to Treasury bills, so the
 * cash series understates their return; it matches their defining property,
 * which is that the principal does not move. Understating return lowers a
 * projected success rate, so the error runs in the safe direction.
 */
const CASH_NAME_SIGNALS = [
  'money market', 'cash reserve', 'cash management', 'liquid reserve',
  'guaranteed interest', 'stable value', 'guaranteed account',
];

const US_MARKET_SIGNALS = [
  's&p', 'russell', 'nasdaq', 'dow jones', 'wilshire',
  'total market', 'total stock market', 'domestic', 'u.s.', 'us equity',
];

const INTERNATIONAL_MARKET_SIGNALS = [
  'international', 'ex-us', 'ex us', 'emerging markets', 'developed markets', 'eafe',
];

export function hasEquityNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return EQUITY_NAME_SIGNALS.some(signal => normalized.includes(signal));
}

export function hasCashNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return CASH_NAME_SIGNALS.some(signal => normalized.includes(signal));
}

export type EquityGeography = 'us' | 'international' | 'global' | 'unknown';

/**
 * Where a fund invests, read from its name when no provider metadata says.
 *
 * Returns 'unknown' rather than guessing when the name carries no geography.
 * A fund called "Small Cap Fund" is probably domestic in a US plan, but
 * probability is not evidence. Unknown geography stays unknown so the mapper
 * can exclude the holding instead of inventing a country split.
 *
 * International is tested first: "Total International Stock Index" contains a
 * US market word ("total ... stock") and is emphatically not US.
 */
export function inferEquityGeography(securityName: string, ticker: string): EquityGeography {
  const name = securityName.toLowerCase();
  if (INTERNATIONAL_MARKET_SIGNALS.some(signal => name.includes(signal))) return 'international';
  if (isInternationalEquityTicker(ticker)) return 'international';
  if (isGlobalEquity('', securityName)) return 'global';
  if (US_MARKET_SIGNALS.some(signal => name.includes(signal))) return 'us';
  return 'unknown';
}
