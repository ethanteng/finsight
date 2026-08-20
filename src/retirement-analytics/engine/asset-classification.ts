const BOND_TICKERS = new Set([
  'AGG', 'BND', 'BNDX', 'BOND', 'EAGG', 'EMB', 'HYG', 'IEF', 'IUSB',
  'JCPB', 'JPST', 'LQD', 'MUB', 'SHY', 'STIP', 'TIP', 'TLT', 'VCIT',
  'VCSH', 'VWOB',
]);

const INTERNATIONAL_EQUITY_TICKERS = new Set(['EFA', 'IXUS', 'VEA', 'VWO', 'VXUS']);

export function isKnownBondTicker(ticker: string): boolean {
  return BOND_TICKERS.has(ticker.trim().toUpperCase());
}

export function hasBondNameSignal(name: string): boolean {
  const normalized = name.toLowerCase();
  return ['bond', 'fixed income', 'treasury', 'tips', 'aggregate', 'corporate credit']
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
const CASH_NAME_SIGNALS = ['money market', 'cash reserve', 'cash management', 'liquid reserve'];

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
 * probably is not evidence -- unknown routes it to the documented default
 * split, which is stated as an assumption, instead of asserting a country.
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
