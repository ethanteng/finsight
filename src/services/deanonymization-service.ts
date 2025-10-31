/**
 * Deanonymization Service
 * 
 * Converts anonymized tokens back to real names for user-facing responses.
 * Uses session maps from AnonymizationService to ensure correct de-anonymization.
 */

import { AnonymizationService } from './anonymization-service';

export class DeanonymizationService {
  private anonymizationService: AnonymizationService;

  constructor(anonymizationService: AnonymizationService) {
    this.anonymizationService = anonymizationService;
  }

  /**
   * Convert AI response back to user-friendly format by replacing tokens with real names
   */
  convertResponseToUserFriendly(userId: string, response: string): string {
    // Input validation
    if (typeof response !== 'string' || response === null || response === undefined) {
      return String(response);
    }
    
    const sessionMaps = this.anonymizationService.getSessionMapsForDeanon(userId);
    if (!sessionMaps) {
      // No session maps found - return response as-is (no tokens to replace)
      return response;
    }
    
    let userFriendlyResponse = response;
    
    // Replace account tokens with real names
    sessionMaps.accountRealDataMap.forEach((realData, token) => {
      const replacement = realData.institution 
        ? `${realData.name} at ${realData.institution}`
        : realData.name;
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), replacement);
    });
    
    // Replace institution tokens with real names
    sessionMaps.institutionRealDataMap.forEach((realName, token) => {
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), realName);
    });
    
    // Replace merchant tokens with real names
    sessionMaps.merchantRealDataMap.forEach((realName, token) => {
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), realName);
    });
    
    // Replace security tokens with real names
    sessionMaps.securityRealDataMap.forEach((realData, token) => {
      let replacement = realData.name;
      if (realData.ticker && realData.ticker !== 'N/A') {
        replacement += ` (${realData.ticker})`;
      }
      if (realData.type && realData.type !== 'Unknown') {
        replacement += ` - ${realData.type}`;
      }
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), replacement);
    });
    
    // Replace liability tokens with real names
    sessionMaps.liabilityRealDataMap.forEach((realData, token) => {
      let replacement = realData.name;
      if (realData.type && realData.type !== 'Unknown') {
        replacement += ` (${realData.type})`;
      }
      if (realData.institution) {
        replacement += ` at ${realData.institution}`;
      }
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), replacement);
    });
    
    return userFriendlyResponse;
  }

  /**
   * Convert structured data (not just strings) by replacing tokens in objects/arrays
   */
  deanonymizeData(userId: string, data: any): any {
    if (typeof data === 'string') {
      return this.convertResponseToUserFriendly(userId, data);
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.deanonymizeData(userId, item));
    }
    
    if (typeof data === 'object' && data !== null) {
      const deanonymized: any = {};
      for (const [key, value] of Object.entries(data)) {
        deanonymized[key] = this.deanonymizeData(userId, value);
      }
      return deanonymized;
    }
    
    return data;
  }
}

