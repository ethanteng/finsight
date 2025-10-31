/**
 * Anonymization Service
 * 
 * Handles tokenization and anonymization of sensitive financial data for GPT context.
 * Uses session-isolated tokenization maps to ensure different users/sessions get different tokens.
 */

interface SessionMaps {
  accountTokenMap: Map<string, string>;
  institutionTokenMap: Map<string, string>;
  merchantTokenMap: Map<string, string>;
  securityTokenMap: Map<string, string>;
  liabilityTokenMap: Map<string, string>;
  
  // Reverse mappings for de-anonymization
  accountRealDataMap: Map<string, { name: string; institution?: string }>;
  institutionRealDataMap: Map<string, string>;
  merchantRealDataMap: Map<string, string>;
  securityRealDataMap: Map<string, { name: string; ticker?: string; type?: string }>;
  liabilityRealDataMap: Map<string, { name: string; type?: string; institution?: string }>;
  
  // Counters for token generation
  accountCounter: number;
  institutionCounter: number;
  merchantCounter: number;
  securityCounter: number;
  liabilityCounter: number;
}

export class AnonymizationService {
  // Session-specific maps: userId -> SessionMaps
  private sessionMaps: Map<string, SessionMaps> = new Map();
  
  /**
   * Get or create session maps for a user
   */
  private getSessionMaps(userId: string): SessionMaps {
    if (!this.sessionMaps.has(userId)) {
      this.sessionMaps.set(userId, {
        accountTokenMap: new Map(),
        institutionTokenMap: new Map(),
        merchantTokenMap: new Map(),
        securityTokenMap: new Map(),
        liabilityTokenMap: new Map(),
        accountRealDataMap: new Map(),
        institutionRealDataMap: new Map(),
        merchantRealDataMap: new Map(),
        securityRealDataMap: new Map(),
        liabilityRealDataMap: new Map(),
        accountCounter: 1,
        institutionCounter: 1,
        merchantCounter: 1,
        securityCounter: 1,
        liabilityCounter: 1
      });
    }
    return this.sessionMaps.get(userId)!;
  }

  /**
   * Tokenize an account name with optional institution
   */
  tokenizeAccount(userId: string, accountName: string, institutionName?: string): string {
    const maps = this.getSessionMaps(userId);
    const safeAccountName = String(accountName || '');
    const safeInstitutionName = String(institutionName || '');
    
    const key = `${safeAccountName}-${safeInstitutionName || 'unknown'}`;
    
    if (!maps.accountTokenMap.has(key)) {
      const token = `Account_${maps.accountCounter++}`;
      maps.accountTokenMap.set(key, token);
      maps.accountRealDataMap.set(token, { name: safeAccountName, institution: safeInstitutionName });
    }
    
    return maps.accountTokenMap.get(key)!;
  }

  /**
   * Tokenize an institution name
   */
  tokenizeInstitution(userId: string, institutionName: string): string {
    const maps = this.getSessionMaps(userId);
    const safeInstitutionName = String(institutionName || '');
    
    if (!maps.institutionTokenMap.has(safeInstitutionName)) {
      const token = `Institution_${maps.institutionCounter++}`;
      maps.institutionTokenMap.set(safeInstitutionName, token);
      maps.institutionRealDataMap.set(token, safeInstitutionName);
    }
    
    return maps.institutionTokenMap.get(safeInstitutionName)!;
  }

  /**
   * Tokenize a merchant name
   */
  tokenizeMerchant(userId: string, merchantName: string): string {
    const maps = this.getSessionMaps(userId);
    const safeMerchantName = String(merchantName || '');
    
    if (!maps.merchantTokenMap.has(safeMerchantName)) {
      const token = `Merchant_${maps.merchantCounter++}`;
      maps.merchantTokenMap.set(safeMerchantName, token);
      maps.merchantRealDataMap.set(token, safeMerchantName);
    }
    
    return maps.merchantTokenMap.get(safeMerchantName)!;
  }

  /**
   * Tokenize a security with optional ticker and type
   */
  tokenizeSecurity(userId: string, securityName: string, tickerSymbol?: string, securityType?: string): string {
    const maps = this.getSessionMaps(userId);
    const safeSecurityName = String(securityName || '');
    const safeTickerSymbol = String(tickerSymbol || '');
    const safeSecurityType = String(securityType || '');
    
    const key = `${safeSecurityName}-${safeTickerSymbol}-${safeSecurityType}`;
    
    if (!maps.securityTokenMap.has(key)) {
      const token = `Security_${maps.securityCounter++}`;
      maps.securityTokenMap.set(key, token);
      maps.securityRealDataMap.set(token, {
        name: safeSecurityName,
        ticker: safeTickerSymbol,
        type: safeSecurityType
      });
    }
    
    return maps.securityTokenMap.get(key)!;
  }

  /**
   * Tokenize a liability with optional type and institution
   */
  tokenizeLiability(userId: string, liabilityName: string, liabilityType?: string, institution?: string): string {
    const maps = this.getSessionMaps(userId);
    const safeLiabilityName = String(liabilityName || '');
    const safeLiabilityType = String(liabilityType || '');
    const safeInstitution = String(institution || '');
    
    const key = `${safeLiabilityName}-${safeLiabilityType}-${safeInstitution}`;
    
    if (!maps.liabilityTokenMap.has(key)) {
      const token = `Liability_${maps.liabilityCounter++}`;
      maps.liabilityTokenMap.set(key, token);
      maps.liabilityRealDataMap.set(token, {
        name: safeLiabilityName,
        type: safeLiabilityType,
        institution: safeInstitution
      });
    }
    
    return maps.liabilityTokenMap.get(key)!;
  }

  /**
   * Anonymize account data
   */
  anonymizeAccountData(userId: string, accounts: any[]): string {
    return accounts.map(a => {
      // Handle different balance field structures
      let balance = 'N/A';
      let available = '';
      
      // Account-type aware balance selection
      if (a.balance && a.balance.available !== undefined && a.balance.available !== null) {
        if (a.type === 'depository' || a.type === 'checking' || a.type === 'savings') {
          balance = `$${a.balance.available.toFixed(2)}`;
          if (a.balance.current !== undefined && a.balance.current !== null && a.balance.current !== a.balance.available) {
            available = ` (Total: $${a.balance.current.toFixed(2)})`;
          }
        } else {
          balance = `$${a.balance.current.toFixed(2)}`;
          if (a.balance.available !== undefined && a.balance.available !== null && a.balance.available !== a.balance.current) {
            available = ` (Available: $${a.balance.available.toFixed(2)})`;
          }
        }
      } else if (a.balance && a.balance.current !== undefined && a.balance.current !== null) {
        balance = `$${a.balance.current.toFixed(2)}`;
      } else if (a.availableBalance !== undefined && a.availableBalance !== null) {
        if (a.type === 'depository' || a.type === 'checking' || a.type === 'savings') {
          balance = `$${a.availableBalance.toFixed(2)}`;
          if (a.currentBalance !== undefined && a.currentBalance !== null && a.currentBalance !== a.availableBalance) {
            available = ` (Total: $${a.currentBalance.toFixed(2)})`;
          }
        } else {
          balance = `$${a.currentBalance.toFixed(2)}`;
          if (a.availableBalance !== undefined && a.availableBalance !== null && a.availableBalance !== a.currentBalance) {
            available = ` (Available: $${a.availableBalance.toFixed(2)})`;
          }
        }
      } else if (a.currentBalance !== undefined && a.currentBalance !== null) {
        balance = `$${a.currentBalance.toFixed(2)}`;
      }
      
      const accountToken = this.tokenizeAccount(userId, a.name, a.institution);
      const institutionToken = a.institution ? this.tokenizeInstitution(userId, a.institution) : '';
      const institutionInfo = institutionToken ? ` at ${institutionToken}` : '';
      
      return `- ${accountToken} (${a.type}${a.subtype ? '/' + a.subtype : ''}): ${balance}${available}${institutionInfo}`;
    }).join('\n');
  }

  /**
   * Anonymize transaction data
   */
  anonymizeTransactionData(userId: string, transactions: any[]): string {
    return transactions.map(t => {
      // Handle different date formats
      let dateStr = 'Unknown';
      if (t.date) {
        if (t.date instanceof Date) {
          dateStr = t.date.toISOString().slice(0, 10);
        } else if (typeof t.date === 'string') {
          if (t.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            dateStr = t.date;
          } else {
            try {
              const date = new Date(t.date);
              if (!isNaN(date.getTime())) {
                dateStr = date.toISOString().slice(0, 10);
              }
            } catch (e) {
              dateStr = t.date;
            }
          }
        }
      }
      
      const amount = t.amount !== undefined && t.amount !== null ? `$${Number(t.amount).toFixed(2)}` : '$0.00';
      
      // Prioritize enriched data over basic data
      let category = '';
      if (t.enriched_data?.category && Array.isArray(t.enriched_data.category)) {
        const validCategories = t.enriched_data.category.filter((cat: any) => cat && cat.trim() !== '' && cat !== '0');
        if (validCategories.length > 0) {
          category = ` [Enhanced: ${validCategories.join(', ')}]`;
        }
      }
      
      if (!category && t.category) {
        if (Array.isArray(t.category)) {
          const validCategories = t.category.filter((cat: any) => cat && cat.trim() !== '' && cat !== '0');
          if (validCategories.length > 0) {
            category = ` [Basic: ${validCategories.join(', ')}]`;
          }
        } else if (typeof t.category === 'string' && t.category.trim() !== '') {
          category = ` [Basic: ${t.category}]`;
        }
      }
      
      const pending = t.pending ? ' [PENDING]' : '';
      
      const merchant = (t as any).merchantName && (t as any).merchantName !== t.name 
        ? ` (${this.tokenizeMerchant(userId, (t as any).merchantName)})` 
        : '';
      
      const paymentMethod = (t as any).paymentMethod ? ` via ${(t as any).paymentMethod}` : '';
      
      let location = '';
      if ((t as any).location) {
        try {
          const locationData = JSON.parse((t as any).location);
          if (locationData && locationData.city) {
            location = ` at ${locationData.city}`;
          }
        } catch (e) {
          // Skip location if parsing fails
        }
      }
      
      const transactionName = this.tokenizeMerchant(userId, t.name || 'Unknown Transaction');
      return `- [${dateStr}] ${transactionName}${merchant}: ${amount}${category}${pending}${paymentMethod}${location}`;
    }).join('\n');
  }

  /**
   * Anonymize investment data
   */
  anonymizeInvestmentData(userId: string, investments: any[]): string {
    return investments.map(investment => {
      const securityToken = this.tokenizeSecurity(
        userId,
        investment.security_name || 'Unknown Security',
        investment.ticker_symbol,
        investment.security_type
      );
      
      const quantity = investment.quantity ? 
        (Number.isInteger(investment.quantity) ? 
          investment.quantity.toString() : 
          investment.quantity.toFixed(4)
        ) : '0';
      
      const price = investment.institution_price ? `$${Number(investment.institution_price).toFixed(2)}` : 'N/A';
      const value = investment.institution_value ? `$${Number(investment.institution_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
      
      const typeInfo = investment.security_type ? ` (${investment.security_type})` : '';
      
      return `- ${securityToken}${typeInfo}: ${quantity} shares @ ${price} = ${value}`;
    }).join('\n');
  }

  /**
   * Anonymize liability data
   */
  anonymizeLiabilityData(userId: string, liabilities: any[]): string {
    return liabilities.map(liability => {
      const liabilityToken = this.tokenizeLiability(
        userId,
        liability.name || 'Unknown Liability',
        liability.type,
        liability.institution
      );
      
      const balance = liability.balance ? `$${Number(liability.balance).toFixed(2)}` : 'N/A';
      const limit = liability.limit ? ` (Limit: $${Number(liability.limit).toFixed(2)})` : '';
      const typeInfo = liability.type ? ` (${liability.type})` : '';
      const institutionInfo = liability.institution ? ` at ${this.tokenizeInstitution(userId, liability.institution)}` : '';
      const aprInfo = liability.apr ? ` - APR: ${Number(liability.apr).toFixed(2)}%` : '';
      
      return `- ${liabilityToken}${typeInfo}${institutionInfo}: ${balance}${limit}${aprInfo}`;
    }).join('\n');
  }

  /**
   * Clear session maps for a user (call on logout or session end)
   */
  clearSession(userId: string): void {
    this.sessionMaps.delete(userId);
  }

  /**
   * Get session maps for de-anonymization (used by DeanonymizationService)
   */
  getSessionMapsForDeanon(userId: string): SessionMaps | null {
    return this.sessionMaps.get(userId) || null;
  }
}

