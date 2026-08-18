import { getPrismaClient } from '../../prisma-client';
import {
  DatabaseCache,
  SECURITY_METADATA_TTL_MS,
} from '../../retirement-analytics/data/db-cache';

jest.mock('../../prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

const mockedGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

function metadataRecord(lastUpdated: Date, tickerSymbol = 'VTI') {
  return {
    tickerSymbol,
    securityName: 'Vanguard Total Stock Market ETF',
    assetClass: 'equity',
    fundCategory: 'Large Blend',
    expenseRatio: 0.0003,
    geographicFocus: 'United States',
    isETF: true,
    fundData: null,
    metadataVersion: 1,
    provider: 'fmp',
    lastUpdated,
  };
}

describe('DatabaseCache security metadata freshness', () => {
  const findUnique = jest.fn();
  const findMany = jest.fn();
  let cache: DatabaseCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetPrismaClient.mockReturnValue({
      securityMetadata: { findUnique, findMany },
    } as any);
    cache = new DatabaseCache();
  });

  it('treats an expired single-symbol FMP row as a cache miss', async () => {
    findUnique.mockResolvedValue(
      metadataRecord(new Date(Date.now() - SECURITY_METADATA_TTL_MS - 1)),
    );

    await expect(cache.getSecurityMetadata('VTI')).resolves.toBeNull();
  });

  it('returns fresh single-symbol metadata', async () => {
    findUnique.mockResolvedValue(metadataRecord(new Date()));

    await expect(cache.getSecurityMetadata('VTI')).resolves.toEqual(
      expect.objectContaining({ tickerSymbol: 'VTI', provider: 'fmp' }),
    );
  });

  it('filters the batch query to the same seven-day freshness window', async () => {
    findMany.mockResolvedValue([metadataRecord(new Date())]);
    const before = Date.now() - SECURITY_METADATA_TTL_MS;

    await cache.getSecurityMetadataBatch(['VTI']);

    const query = findMany.mock.calls[0][0];
    expect(query.where.tickerSymbol).toEqual({ in: ['VTI'] });
    expect(query.where.lastUpdated.gte).toBeInstanceOf(Date);
    expect(query.where.lastUpdated.gte.getTime()).toBeGreaterThanOrEqual(before);
    expect(query.where.lastUpdated.gte.getTime()).toBeLessThanOrEqual(Date.now() - SECURITY_METADATA_TTL_MS);
  });
});
