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
    
    // Replace account tokens with real names (use word boundaries to avoid partial matches)
    sessionMaps.accountRealDataMap.forEach((realData, token) => {
      const replacement = realData.institution 
        ? `${realData.name} at ${realData.institution}`
        : realData.name;
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), replacement);
    });
    
    // Replace institution tokens with real names (use word boundaries to avoid partial matches)
    // Note: Institution tokens may appear in lists or comma-separated contexts
    sessionMaps.institutionRealDataMap.forEach((realName, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Use word boundary for most cases
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realName);
      // Also handle cases where token appears in comma-separated lists (e.g., "CFG Bank - Personal, Institution_1, Popular Direct")
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`(,|and|or)\\s*${escapedToken}\\b`, 'g'), `$1 ${realName}`);
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}(?=,|and|or)`, 'g'), realName);
    });
    
    // Replace merchant tokens with real names (use word boundaries to avoid partial matches)
    sessionMaps.merchantRealDataMap.forEach((realName, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realName);
    });
    
    // Replace security tokens with real names (use word boundaries to avoid partial matches)
    sessionMaps.securityRealDataMap.forEach((realData, token) => {
      let replacement = realData.name;
      if (realData.ticker && realData.ticker !== 'N/A') {
        replacement += ` (${realData.ticker})`;
      }
      if (realData.type && realData.type !== 'Unknown') {
        replacement += ` - ${realData.type}`;
      }
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), replacement);
    });
    
    // Replace liability tokens with real names (use word boundaries to avoid partial matches)
    sessionMaps.liabilityRealDataMap.forEach((realData, token) => {
      let replacement = realData.name;
      if (realData.type && realData.type !== 'Unknown') {
        replacement += ` (${realData.type})`;
      }
      if (realData.institution) {
        replacement += ` at ${realData.institution}`;
      }
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), replacement);
    });
    
    // Replace profile tokens with real data
    // Person tokens (use word boundaries to avoid partial matches)
    sessionMaps.personRealDataMap.forEach((realName, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realName);
    });
    
    // Spouse tokens (use word boundaries to avoid partial matches)
    sessionMaps.spouseRealDataMap.forEach((realName, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realName);
    });
    
    // Location tokens (stored as "City, State" format)
    sessionMaps.locationRealDataMap.forEach((realLocation, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realLocation);
    });
    
    // Income tokens (stored as numeric amount, format as currency)
    // Note: ProfileAnonymizer replaces "$amount" with "$Income_X", so we need to match "$Income_X"
    // Must replace $Income_X pattern first (with $ prefix) before replacing Income_X alone
    sessionMaps.incomeRealDataMap.forEach((realAmount, token) => {
      const formattedAmount = `$${realAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      // Escape special regex characters in token
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace "$Income_X" pattern first (token with $ prefix), then the token alone (if it appears without $)
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\$${escapedToken}`, 'g'), formattedAmount);
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), formattedAmount);
    });
    
    // Goal tokens (stored as numeric amount, format as currency)
    // Note: ProfileAnonymizer replaces "$amount" with "$Goal_X", so we need to match "$Goal_X"
    // Must replace $Goal_X pattern first (with $ prefix) before replacing Goal_X alone
    sessionMaps.goalRealDataMap.forEach((realAmount, token) => {
      const formattedAmount = `$${realAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      // Escape special regex characters in token
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Replace "$Goal_X" pattern first (token with $ prefix), then the token alone (if it appears without $)
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\$${escapedToken}`, 'g'), formattedAmount);
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), formattedAmount);
    });
    
    // Age tokens (stored as numeric age)
    // Note: Age tokens may appear in contexts like "Age_1-year-old", so we need to handle underscores
    sessionMaps.ageRealDataMap.forEach((realAge, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Use word boundary OR underscore/hyphen patterns to catch "Age_1-year-old" type contexts
      // First try word boundary match (most common)
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realAge.toString());
      // Also handle cases where token appears before hyphen (e.g., "Age_1-year-old")
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`${escapedToken}(?=-)`, 'g'), realAge.toString());
    });
    
    // Ages tokens (stored as string like "5 and 8")
    sessionMaps.agesRealDataMap.forEach((realAges, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realAges);
    });
    
    // Children tokens (stored as children info string)
    sessionMaps.childrenRealDataMap.forEach((realChildrenInfo, token) => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userFriendlyResponse = userFriendlyResponse.replace(new RegExp(`\\b${escapedToken}\\b`, 'g'), realChildrenInfo);
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

