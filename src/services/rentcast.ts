/**
 * RentCast API Service
 * Provides home valuation data using the RentCast API
 */

interface RentCastHomeValue {
  price: number;
  priceRangeLow: number;
  priceRangeHigh: number;
  latitude: number;
  longitude: number;
  subjectProperty?: {
    formattedAddress: string;
    addressLine1: string;
    city: string;
    state: string;
    zipCode: string;
    propertyType: string;
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    yearBuilt?: number;
  };
}

interface RentCastError {
  error: string;
  message: string;
}

export class RentCastService {
  private apiKey: string;
  private baseUrl = 'https://api.rentcast.io/v1';

  constructor() {
    const apiKey = process.env.RENTCAST_API_KEY;
    if (!apiKey) {
      throw new Error('RENTCAST_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Get home valuation for a given address
   * @param address - Full address string (e.g., "5500 Grand Lake Dr, San Antonio, TX, 78244")
   * @returns Home value data or null if not found
   */
  async getHomeValue(address: string): Promise<RentCastHomeValue | null> {
    try {
      // Clean and encode the address
      const cleanAddress = address.trim();
      const encodedAddress = encodeURIComponent(cleanAddress);
      
      const url = `${this.baseUrl}/avm/value?address=${encodedAddress}&compCount=5`;
      
      console.log('RentCast: Fetching home value for address:', cleanAddress);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'X-Api-Key': this.apiKey
        }
      });

      if (!response.ok) {
        const errorData = await response.json() as RentCastError;
        console.error('RentCast API error:', response.status, errorData);
        
        if (response.status === 404) {
          console.log('RentCast: Address not found');
          return null;
        }
        
        throw new Error(`RentCast API error: ${errorData.message || response.statusText}`);
      }

      const data = await response.json() as RentCastHomeValue;
      
      console.log('RentCast: Successfully retrieved home value:', {
        price: data.price,
        priceRangeLow: data.priceRangeLow,
        priceRangeHigh: data.priceRangeHigh,
        address: data.subjectProperty?.formattedAddress
      });

      return data;
    } catch (error) {
      console.error('RentCast: Error fetching home value:', error);
      
      // Re-throw the error so the caller can handle it
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('Failed to fetch home value from RentCast');
    }
  }

  /**
   * Validate if an address is in a supported format
   * @param address - Address string to validate
   * @returns true if address appears valid
   */
  validateAddress(address: string): boolean {
    // Basic validation - check if address has street, city, and state
    const cleanAddress = address.trim();
    
    if (cleanAddress.length < 10) {
      return false;
    }
    
    // Check for common address components
    const hasNumber = /\d/.test(cleanAddress);
    const hasComma = cleanAddress.includes(',');
    const hasState = /[A-Z]{2}/.test(cleanAddress);
    
    return hasNumber && hasComma && hasState;
  }
}

