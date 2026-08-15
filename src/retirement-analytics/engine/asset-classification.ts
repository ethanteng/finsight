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
  return geography === 'global' || geography === 'world' ||
    name.includes('global') || name.includes('all-world') || name.includes('world stock');
}

export function isInternationalEquity(
  geographicFocus: string,
  securityName: string,
  ticker: string
): boolean {
  const geography = geographicFocus.toLowerCase();
  const name = securityName.toLowerCase();
  return geography === 'international' || geography === 'ex-us' ||
    name.includes('international') || name.includes('ex-us') ||
    isInternationalEquityTicker(ticker);
}
