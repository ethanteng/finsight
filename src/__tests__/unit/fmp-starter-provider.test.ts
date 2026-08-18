import { FMPProvider } from '../../retirement-analytics/data/providers/fmp-provider';
import { analyzePortfolio } from '../../retirement-analytics/engine/portfolio-analyzer';
import { mapPortfolioToAssetBasket } from '../../retirement-analytics/engine/portfolio-mapper';
import type { SecurityMetadata } from '../../retirement-analytics/types';

describe('FMP Starter fund metadata', () => {
  const provider = new FMPProvider('test_key');

  it('normalizes expense ratios and complete country/sector vectors', () => {
    const metadata = (provider as any).parseETFInfo(
      { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', assetClass: 'Equity', expenseRatio: 0.09 },
      'SPY',
      [
        { country: 'United States', weightPercentage: '97.5%' },
        { country: 'Canada', weightPercentage: '2.5%' },
      ],
      [
        { sector: 'Technology', weightPercentage: 37.4 },
        { sector: 'Financial Services', weightPercentage: 12.6 },
      ],
    ) as SecurityMetadata;

    expect(metadata.expenseRatio).toBeCloseTo(0.0009);
    expect(metadata.geographicFocus).toBe('US');
    expect(metadata.fundCategory).toBeUndefined();
    expect(metadata.fundData).toMatchObject({
      instrumentType: 'etf',
      countryCoverage: 'available',
      sectorCoverage: 'available',
      countryAllocations: [
        { name: 'United States', weight: 0.975 },
        { name: 'Canada', weight: 0.025 },
      ],
      sectorAllocations: [
        { name: 'Technology', weight: 0.374 },
        { name: 'Financial Services', weight: 0.126 },
      ],
    });
  });

  it('marks low-information bond and fund buckets as degenerate', () => {
    const metadata = (provider as any).parseETFInfo(
      { symbol: 'BND', name: 'Total Bond Market ETF', assetClass: 'Fixed Income', expenseRatio: 0.03 },
      'BND',
      [{ country: 'Other', weightPercentage: '100%' }],
      [{ sector: 'Cash & Others', weightPercentage: 100 }],
    ) as SecurityMetadata;

    expect(metadata.fundData?.countryCoverage).toBe('degenerate');
    expect(metadata.fundData?.sectorCoverage).toBe('degenerate');
  });

  it('does not treat fund domicile or an unscaled multi-asset sector sleeve as exposure', () => {
    const metadata = (provider as any).parseETFInfo(
      { symbol: 'VFFVX', name: 'Target Retirement 2055 Fund', assetClass: 'Multi-Asset', domicile: 'US' },
      'VFFVX',
      [{ country: 'Other', weightPercentage: '100%' }],
      [{ sector: 'Technology', weightPercentage: 30 }],
    ) as SecurityMetadata;

    expect(metadata.geographicFocus).toBeUndefined();
    expect(metadata.fundData?.countryCoverage).toBe('degenerate');
    expect(metadata.fundData?.sectorCoverage).toBe('degenerate');
    expect(metadata.fundData?.sectorAllocations).toEqual([{ name: 'Technology', weight: 0.3 }]);
  });

  it('treats numeric weightPercentage values as percentages even when <= 1', () => {
    const metadata = (provider as any).parseETFInfo(
      { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', assetClass: 'Equity' },
      'VXUS',
      [
        { country: 'Japan', weightPercentage: 0.5 },
        { country: 'United Kingdom', weightPercentage: 0.25 },
        { country: 'Other', weight: 0.9925 },
      ],
      [
        { sector: 'Financial Services', weightPercentage: 0.8 },
        { sector: 'Technology', exposure: 0.15 },
      ],
    ) as SecurityMetadata;

    expect(metadata.fundData?.countryAllocations).toEqual([
      { name: 'Other', weight: 0.9925 },
      { name: 'Japan', weight: 0.005 },
      { name: 'United Kingdom', weight: 0.0025 },
    ]);
    expect(metadata.fundData?.sectorAllocations).toEqual([
      { name: 'Technology', weight: 0.15 },
      { name: 'Financial Services', weight: 0.008 },
    ]);
  });

  it('does not treat ETF/mutual-fund profile domicile as look-through coverage', () => {
    const metadata = (provider as any).parseProfile(
      {
        symbol: 'VXUS',
        companyName: 'Vanguard Total International Stock ETF',
        isEtf: true,
        country: 'US',
        sector: 'Financial Services',
      },
      'VXUS',
    ) as SecurityMetadata;

    expect(metadata.geographicFocus).toBe('International');
    expect(metadata.fundData).toMatchObject({
      instrumentType: 'etf',
      countryCoverage: 'unavailable',
      sectorCoverage: 'unavailable',
      countryAllocations: [],
      sectorAllocations: [],
    });
  });

  it('uses look-through countries in portfolio metrics and retirement mapping', async () => {
    const metadata: SecurityMetadata = {
      tickerSymbol: 'VXUS',
      securityName: 'Vanguard Total International Stock ETF',
      assetClass: 'Equity',
      geographicFocus: 'International',
      expenseRatio: 0.0005,
      isETF: true,
      provider: 'fmp',
      metadataVersion: 2,
      lastUpdated: new Date(),
      fundData: {
        instrumentType: 'etf',
        countryAllocations: [
          { name: 'United States', weight: 0.05 },
          { name: 'Japan', weight: 0.25 },
          { name: 'Other', weight: 0.70 },
        ],
        sectorAllocations: [
          { name: 'Financial Services', weight: 0.3 },
          { name: 'Technology', weight: 0.2 },
        ],
        countryCoverage: 'available',
        sectorCoverage: 'available',
      },
    };
    const holdings = [{
      id: 'h1', account_id: 'a1', security_id: 's1',
      institution_value: 10_000, ticker_symbol: 'VXUS', security_name: metadata.securityName,
    }] as any;
    const securities = [{ security_id: 's1', ticker_symbol: 'VXUS', name: metadata.securityName, type: 'etf' }] as any;
    const preFetched = new Map([['VXUS', metadata]]);

    const metrics = await analyzePortfolio(holdings, securities, undefined, preFetched);
    const mapping = await mapPortfolioToAssetBasket(holdings, securities, 10_000, undefined, preFetched);

    expect(metrics.internationalAllocation).toBeCloseTo(95);
    expect(metrics.countryCoverage).toBe(1);
    expect(metrics.sectorCoverage).toBe(1);
    expect(metrics.expenseRatioWeighted).toBeCloseTo(0.0005);
    expect(metrics.expenseRatioCoverage).toBe(1);
    expect(metrics.countryAllocation.find(item => item.name === 'Japan')?.percentage).toBeCloseTo(25);
    expect(metrics.sectorAllocation.find(item => item.name === 'Technology')?.percentage).toBeCloseTo(20);
    expect(mapping.usEquityWeight).toBeCloseTo(0.05);
    expect(mapping.internationalEquityWeight).toBeCloseTo(0.95);
  });
});
