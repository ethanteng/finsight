/**
 * Probe FMP for the public State Street share classes the target-date registry
 * cites as proxies, plus BlackRock's registered LifePath counterpart if given.
 *
 * The registry currently stores hand-transcribed weights with a source URL. The
 * question this answers: can FMP supply the same four-way split
 * (usEquity / internationalEquity / nominalBonds / cash) programmatically?
 *
 * If yes, the registry becomes self-refreshing and the 366-day staleness flag
 * gets an automatic remedy instead of only a warning. If FMP returns geography
 * but no asset-class split, only the US/international half can be automated.
 *
 *   FMP_API_KEY=... npx tsx scripts/probe-fmp-target-date.ts [EXTRA_TICKER ...]
 *
 * Read-only. Prints a per-endpoint availability matrix; never writes anything.
 */

const BASE = 'https://financialmodelingprep.com/stable';

// The five public mutual-fund share classes named in target-date-fund-registry.ts.
const REGISTRY_TICKERS = ['SSAHX', 'SSAJX', 'SSAZX', 'SSCNX', 'SSDJX'];

/**
 * Controls. Without these an empty result is uninterpretable: it could mean
 * "FMP does not cover this instrument" or "FMP is returning nothing to us at
 * all". These separate the two, and the second case is a live production
 * problem rather than a registry question -- the retirement mapper leans on
 * FMP country data to classify funds, and falls back to a medium-confidence
 * US-listing rule for direct equities when it is missing.
 */
const CONTROLS: Array<{ ticker: string; expect: string }> = [
  { ticker: 'SPY',   expect: 'ETF, most-traded US instrument — empty here means FMP is not answering us' },
  { ticker: 'VTI',   expect: 'ETF held in kind by this portfolio type — drives country allocations today' },
  { ticker: 'AGG',   expect: 'bond ETF — exercises the fixed-income classification path' },
  { ticker: 'WFC',   expect: 'common stock — the #161 listing-fallback assumption depends on this' },
  { ticker: 'VFIAX', expect: 'mainstream mutual fund — isolates "no mutual-fund coverage" from "no coverage"' },
];

// Endpoints already wired into fmp-provider.ts, plus the ones that would be
// needed to derive an equity/bond split rather than only geography.
const ENDPOINTS = [
  { path: '/etf/info', note: 'metadata; check for an assetClass or allocation field' },
  { path: '/etf/country-weightings', note: 'geography — already consumed today' },
  { path: '/etf/sector-weightings', note: 'sector; equity-only, no bond split' },
  { path: '/profile', note: 'fallback used for mutual funds' },
  { path: '/etf/holdings', note: 'THE decisive one: real holdings -> derive asset class' },
  { path: '/etf/asset-exposure', note: 'alternate holdings-style endpoint' },
];

const apiKey = process.env.FMP_API_KEY?.trim();
if (!apiKey) {
  console.error('FMP_API_KEY is not set. Export it and re-run; nothing was requested.');
  process.exit(1);
}

async function probe(path: string, ticker: string) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('symbol', ticker);
  url.searchParams.set('apikey', apiKey!);
  try {
    const res = await fetch(url);
    if (!res.ok) return { status: `HTTP ${res.status}`, shape: '', sample: '' };
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return { status: 'non-array', shape: typeof body, sample: '' };
    if (body.length === 0) return { status: 'empty', shape: '[]', sample: '' };
    const first = body[0] as Record<string, unknown>;
    const keys = Object.keys(first);
    return {
      status: `ok (${body.length})`,
      shape: keys.slice(0, 8).join(','),
      // Surface anything that looks like an asset-class signal.
      sample: keys
        .filter(k => /asset|class|equity|bond|fixed|cash|weight|percent/i.test(k))
        .map(k => `${k}=${JSON.stringify(first[k])}`)
        .slice(0, 4)
        .join(' '),
    };
  } catch (error) {
    return { status: `error: ${error instanceof Error ? error.message : String(error)}`, shape: '', sample: '' };
  }
}

(async () => {
  const extra = process.argv.slice(2).map(t => t.toUpperCase());
  const tickers = [...REGISTRY_TICKERS, ...CONTROLS.map(c => c.ticker), ...extra];
  const expectations = new Map(CONTROLS.map(c => [c.ticker, c.expect]));
  console.log(`Probing ${tickers.length} tickers x ${ENDPOINTS.length} endpoints\n`);
  for (const ticker of tickers) {
    const expect = expectations.get(ticker);
    console.log(`=== ${ticker} ===${expect ? `   [control: ${expect}]` : ''}`);
    for (const { path, note } of ENDPOINTS) {
      const r = await probe(path, ticker);
      console.log(`  ${path.padEnd(24)} ${r.status.padEnd(14)} ${r.shape}`);
      if (r.sample) console.log(`  ${''.padEnd(24)} ${' '.padEnd(14)} ↳ ${r.sample}`);
      if (r.status.startsWith('HTTP 403') || r.status.startsWith('HTTP 402')) {
        console.log(`  ${''.padEnd(24)} ${' '.padEnd(14)} ↳ not in this plan tier — ${note}`);
      }
    }
    console.log('');
  }
  console.log('Decision rule:');
  console.log('  controls return data, registry tickers empty  -> FMP does not cover these share classes;');
  console.log('                                                   the registry cannot be automated from FMP at any tier');
  console.log('  controls ALSO empty                           -> FMP is not answering this key/plan at all.');
  console.log('                                                   That is a production classification problem, not a');
  console.log('                                                   registry one: fund country data is silently absent and');
  console.log('                                                   direct equities are riding the US-listing fallback.');
  console.log('  402 on holdings only                          -> paid add-on; only worth pricing for covered instruments');
})();
