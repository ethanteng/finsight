/**
 * RentCast API Service
 * Provides home valuation data using the RentCast API.
 */

export interface RentCastSubjectProperty {
  id: string;
  formattedAddress: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  yearBuilt?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
}

export interface RentCastHomeValue {
  price: number;
  priceRangeLow: number;
  priceRangeHigh: number;
  subjectProperty: RentCastSubjectProperty;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
// A refresh runs inside a user request and the batch job processes users
// sequentially, so a server-directed delay must never outlast a bounded retry.
const MAX_RETRY_DELAY_MS = 2_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeSubjectProperty(value: unknown): RentCastSubjectProperty | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const subject: Partial<RentCastSubjectProperty> = {};

  const stringFields: Array<keyof RentCastSubjectProperty> = [
    'id',
    'formattedAddress',
    'addressLine1',
    'city',
    'state',
    'zipCode',
    'county',
    'propertyType',
    'lastSaleDate',
  ];
  for (const field of stringFields) {
    const fieldValue = raw[field];
    if (typeof fieldValue === 'string' && fieldValue.trim()) {
      (subject as Record<string, unknown>)[field] = fieldValue.trim();
    }
  }

  const numberFields: Array<keyof RentCastSubjectProperty> = [
    'latitude',
    'longitude',
    'bedrooms',
    'bathrooms',
    'squareFootage',
    'yearBuilt',
    'lastSalePrice',
  ];
  for (const field of numberFields) {
    const fieldValue = raw[field];
    if (typeof fieldValue === 'number' && Number.isFinite(fieldValue)) {
      (subject as Record<string, unknown>)[field] = fieldValue;
    }
  }

  return subject.id && subject.formattedAddress
    ? subject as RentCastSubjectProperty
    : undefined;
}

function normalizeHomeValue(value: unknown): RentCastHomeValue {
  if (!value || typeof value !== 'object') {
    throw new Error('RentCast returned an invalid home value response');
  }

  const raw = value as Record<string, unknown>;
  if (!finitePositive(raw.price)) {
    throw new Error('RentCast returned an invalid estimated price');
  }
  if (!finitePositive(raw.priceRangeLow) || !finitePositive(raw.priceRangeHigh)) {
    throw new Error('RentCast returned an invalid estimated price range');
  }
  if (raw.priceRangeLow > raw.price || raw.price > raw.priceRangeHigh) {
    throw new Error('RentCast returned an inconsistent estimated price range');
  }

  const subjectProperty = normalizeSubjectProperty(raw.subjectProperty);
  if (!subjectProperty) {
    throw new Error('RentCast returned a home value without subject property identity');
  }

  return {
    price: raw.price,
    priceRangeLow: raw.priceRangeLow,
    priceRangeHigh: raw.priceRangeHigh,
    subjectProperty,
  };
}

async function responseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    // Some upstream errors are HTML or empty; the HTTP status is still useful.
  }
  return response.statusText || `HTTP ${response.status}`;
}

function retryDelayMs(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class RentCastService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.rentcast.io/v1';

  constructor() {
    const apiKey = process.env.RENTCAST_API_KEY;
    if (!apiKey) {
      throw new Error('RENTCAST_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  /** Get a RentCast AVM estimate for a full US property address. */
  async getHomeValue(address: string): Promise<RentCastHomeValue | null> {
    const cleanAddress = address.trim();
    if (!this.validateAddress(cleanAddress)) {
      throw new Error('A valid property address is required');
    }

    const url = new URL(`${this.baseUrl}/avm/value`);
    url.searchParams.set('address', cleanAddress);
    // RentCast recommends a larger comparable set for a more robust AVM.
    url.searchParams.set('compCount', '20');
    // Subject attributes improve matching and provide a canonical address.
    url.searchParams.set('lookupSubjectAttributes', 'true');

    console.log('RentCast: Fetching home value for address:', cleanAddress);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let response: Response | undefined;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'X-Api-Key': this.apiKey,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (response.status === 404) {
          console.log('RentCast: Address not found');
          return null;
        }

        if (!response.ok) {
          const message = await responseErrorMessage(response);
          if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
            await delay(retryDelayMs(response, attempt));
            continue;
          }
          throw new Error(`RentCast API error (${response.status}): ${message}`);
        }

        const data = normalizeHomeValue(await response.json());
        console.log('RentCast: Successfully retrieved home value:', {
          price: data.price,
          priceRangeLow: data.priceRangeLow,
          priceRangeHigh: data.priceRangeHigh,
          address: data.subjectProperty.formattedAddress,
        });
        return data;
      } catch (error) {
        if (attempt < MAX_ATTEMPTS - 1 && (!response || RETRYABLE_STATUSES.has(response.status))) {
          await delay(retryDelayMs(response, attempt));
          continue;
        }
        console.error('RentCast: Error fetching home value:', error);
        throw error instanceof Error
          ? error
          : new Error('Failed to fetch home value from RentCast');
      }
    }

    throw new Error('Failed to fetch home value from RentCast');
  }

  /** Let RentCast parse address variants while filtering obviously incomplete input. */
  validateAddress(address: string): boolean {
    const cleanAddress = address.trim();
    return cleanAddress.length >= 5 && /\d/.test(cleanAddress) && /[a-z]/i.test(cleanAddress);
  }
}
