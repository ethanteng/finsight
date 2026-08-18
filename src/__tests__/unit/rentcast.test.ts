import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RentCastService } from '../../services/rentcast';

const originalFetch = global.fetch;
const mockFetch = jest.fn<typeof fetch>();

function response(body: unknown, status = 200, retryAfter?: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Upstream error',
    headers: { get: (name: string) => name.toLowerCase() === 'retry-after' ? retryAfter || null : null } as Headers,
    json: jest.fn(async () => body),
  } as unknown as Response;
}

const validValue = {
  price: 750_000,
  priceRangeLow: 700_000,
  priceRangeHigh: 810_000,
  subjectProperty: {
    id: 'property-123',
    formattedAddress: '1 Main St, Austin, TX 78701',
    latitude: 30.2672,
    longitude: -97.7431,
    propertyType: 'Single Family',
  },
};

describe('RentCastService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RENTCAST_API_KEY = 'rentcast-test-key';
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    delete process.env.RENTCAST_API_KEY;
  });

  it('requests 20 comparables and subject attributes while accepting lowercase address input', async () => {
    mockFetch.mockResolvedValue(response(validValue));
    const service = new RentCastService();

    const result = await service.getHomeValue('1 main st austin tx 78701');

    const requestedUrl = new URL(String(mockFetch.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get('compCount')).toBe('20');
    expect(requestedUrl.searchParams.get('lookupSubjectAttributes')).toBe('true');
    expect(requestedUrl.searchParams.get('address')).toBe('1 main st austin tx 78701');
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      headers: { 'X-Api-Key': 'rentcast-test-key' },
    });
    expect(result?.subjectProperty).toMatchObject({
      id: 'property-123',
      formattedAddress: '1 Main St, Austin, TX 78701',
    });
  });

  it.each([429, 500, 504])('retries HTTP %s and then returns the validated estimate', async (status) => {
    mockFetch
      .mockResolvedValueOnce(response({ message: 'try again' }, status, '0'))
      .mockResolvedValueOnce(response(validValue));

    await expect(new RentCastService().getHomeValue('1 Main St')).resolves.toMatchObject({ price: 750_000 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('stops after three retryable failures', async () => {
    mockFetch.mockResolvedValue(response({ message: 'try again' }, 500, '0'));

    await expect(new RentCastService().getHomeValue('1 Main St'))
      .rejects.toThrow('RentCast API error (500)');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('caps a server-directed retry delay so a refresh cannot stall for hours', async () => {
    // A refresh runs inside a user request and the batch job is sequential, so
    // an outsized Retry-After must not be honoured verbatim.
    mockFetch
      .mockResolvedValueOnce(response({ message: 'slow down' }, 429, '3600'))
      .mockResolvedValueOnce(response(validValue));

    const started = Date.now();
    await expect(new RentCastService().getHomeValue('1 Main St')).resolves.toMatchObject({ price: 750_000 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('does not retry an address that RentCast cannot find', async () => {
    mockFetch.mockResolvedValue(response({ message: 'not found' }, 404));

    await expect(new RentCastService().getHomeValue('1 Main St')).resolves.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an inconsistent runtime response instead of persisting it', async () => {
    mockFetch.mockResolvedValue(response({
      ...validValue,
      priceRangeLow: 800_000,
      priceRangeHigh: 900_000,
    }));

    await expect(new RentCastService().getHomeValue('1 Main St'))
      .rejects.toThrow('inconsistent estimated price range');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('requires RentCast subject-property identity in the runtime response', async () => {
    const valueWithoutIdentity: Partial<typeof validValue> = { ...validValue };
    delete valueWithoutIdentity.subjectProperty;
    mockFetch.mockResolvedValue(response(valueWithoutIdentity));

    await expect(new RentCastService().getHomeValue('1 Main St'))
      .rejects.toThrow('without subject property identity');
  });

  it('rejects obviously incomplete input locally without imposing formatting rules', async () => {
    const service = new RentCastService();
    expect(service.validateAddress('main street')).toBe(false);
    expect(service.validateAddress('1 main st')).toBe(true);
    await expect(service.getHomeValue('main street')).rejects.toThrow('valid property address');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
