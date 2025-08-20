import { PrismaClient } from '@prisma/client';

// Will be used when user system is implemented
const prisma = new PrismaClient();

// Tokenization maps to maintain consistency within a session
const accountTokenMap = new Map<string, string>();
const institutionTokenMap = new Map<string, string>();
const merchantTokenMap = new Map<string, string>();
const securityTokenMap = new Map<string, string>();
const liabilityTokenMap = new Map<string, string>();

// Reverse mappings for converting tokens back to real data
const accountRealDataMap = new Map<string, { name: string; institution?: string }>();
const institutionRealDataMap = new Map<string, string>();
const merchantRealDataMap = new Map<string, string>();
const securityRealDataMap = new Map<string, { name: string; ticker?: string; type?: string }>();
const liabilityRealDataMap = new Map<string, { name: string; type?: string; institution?: string }>();

let accountCounter = 1;
let institutionCounter = 1;
let merchantCounter = 1;
let securityCounter = 1;
let liabilityCounter = 1;

export function tokenizeAccount(accountName: string, institutionName?: string): string {
  // ✅ Input validation
  const safeAccountName = String(accountName || '');
  const safeInstitutionName = String(institutionName || '');
  
  console.log('tokenizeAccount: Input:', { accountName: safeAccountName, institutionName: safeInstitutionName });
  
  const key = `${safeAccountName}-${safeInstitutionName || 'unknown'}`;
  console.log('tokenizeAccount: Generated key:', key);
  
  if (!accountTokenMap.has(key)) {
    const token = `Account_${accountCounter++}`;
    accountTokenMap.set(key, token);
    accountRealDataMap.set(token, { name: safeAccountName, institution: safeInstitutionName });
    console.log('tokenizeAccount: Created new token:', token, 'for key:', key);
    console.log('tokenizeAccount: Updated accountRealDataMap with:', { token, name: safeAccountName, institution: safeInstitutionName });
  } else {
    const existingToken = accountTokenMap.get(key)!;
    console.log('tokenizeAccount: Found existing token:', existingToken, 'for key:', key);
  }
  
  const result = accountTokenMap.get(key)!;
  console.log('tokenizeAccount: Returning token:', result);
  return result;
}

export function tokenizeInstitution(institutionName: string): string {
  // ✅ Input validation
  const safeInstitutionName = String(institutionName || '');
  
  if (!institutionTokenMap.has(safeInstitutionName)) {
    const token = `Institution_${institutionCounter++}`;
    institutionTokenMap.set(safeInstitutionName, token);
    institutionRealDataMap.set(token, safeInstitutionName);
  }
  return institutionTokenMap.get(safeInstitutionName)!;
}

export function tokenizeMerchant(merchantName: string): string {
  // ✅ Input validation
  const safeMerchantName = String(merchantName || '');
  
  if (!merchantTokenMap.has(safeMerchantName)) {
    const token = `Merchant_${merchantCounter++}`;
    merchantTokenMap.set(safeMerchantName, token);
    merchantRealDataMap.set(token, safeMerchantName);
  }
  return merchantTokenMap.get(safeMerchantName)!;
}

export function tokenizeSecurity(securityName: string, tickerSymbol?: string, securityType?: string): string {
  // ✅ Input validation
  const safeSecurityName = String(securityName || '');
  const safeTickerSymbol = String(tickerSymbol || '');
  const safeSecurityType = String(securityType || '');
  
  const key = `${safeSecurityName}-${safeTickerSymbol}-${safeSecurityType}`;
  if (!securityTokenMap.has(key)) {
    const token = `Security_${securityCounter++}`;
    securityTokenMap.set(key, token);
    securityRealDataMap.set(token, { 
      name: safeSecurityName, 
      ticker: safeTickerSymbol, 
      type: safeSecurityType 
    });
  }
  return securityTokenMap.get(key)!;
}

export function tokenizeLiability(liabilityName: string, liabilityType?: string, institution?: string): string {
  // ✅ Input validation
  const safeLiabilityName = String(liabilityName || '');
  const safeLiabilityType = String(liabilityType || '');
  const safeInstitution = String(institution || '');
  
  const key = `${safeLiabilityName}-${safeLiabilityType}-${safeInstitution}`;
  if (!liabilityTokenMap.has(key)) {
    const token = `Liability_${liabilityCounter++}`;
    liabilityTokenMap.set(key, token);
    liabilityRealDataMap.set(token, { 
      name: safeLiabilityName, 
      type: safeLiabilityType, 
      institution: safeInstitution 
    });
  }
  return liabilityTokenMap.get(key)!;
}

export function getRealAccountName(token: string): string {
  const realData = accountRealDataMap.get(token);
  return realData ? realData.name : token;
}

export function getRealInstitutionName(token: string): string {
  return institutionRealDataMap.get(token) || token;
}

export function getRealMerchantName(token: string): string {
  return merchantRealDataMap.get(token) || token;
}

export function getRealSecurityName(token: string): string {
  const realData = securityRealDataMap.get(token);
  return realData ? realData.name : token;
}

export function getRealLiabilityName(token: string): string {
  const realData = liabilityRealDataMap.get(token);
  return realData ? realData.name : token;
}

export function anonymizeAccountData(accounts: any[]): string {
  console.log('anonymizeAccountData: Processing', accounts.length, 'accounts');
  
  return accounts.map(a => {
    console.log('anonymizeAccountData: Processing account:', {
      name: a.name,
      institution: a.institution,
      type: a.type,
      subtype: a.subtype,
      balance: a.balance,
      currentBalance: a.currentBalance,
      availableBalance: a.availableBalance
    });
    
    // Handle different balance field structures
    let balance = 'N/A';
    let available = '';
    
    if (a.balance && a.balance.current !== undefined && a.balance.current !== null) {
      balance = `$${a.balance.current.toFixed(2)}`;
      if (a.balance.available !== undefined && a.balance.available !== null) {
        available = ` (Available: $${a.balance.available.toFixed(2)})`;
      }
    } else if (a.currentBalance !== undefined && a.currentBalance !== null) {
      balance = `$${a.currentBalance.toFixed(2)}`;
      if (a.availableBalance !== undefined && a.availableBalance !== null) {
        available = ` (Available: $${a.availableBalance.toFixed(2)})`;
      }
    }
    
    const accountToken = tokenizeAccount(a.name, a.institution);
    const institutionToken = a.institution ? tokenizeInstitution(a.institution) : '';
    const institutionInfo = institutionToken ? ` at ${institutionToken}` : '';
    
    console.log('anonymizeAccountData: Generated token:', accountToken, 'for account:', a.name);
    
    return `- ${accountToken} (${a.type}${a.subtype ? '/' + a.subtype : ''}): ${balance}${available}${institutionInfo}`;
  }).join('\n');
}

export function anonymizeTransactionData(transactions: any[]): string {
  return transactions.map(t => {
    // Handle different date formats
    let dateStr = 'Unknown';
    if (t.date) {
      if (t.date instanceof Date) {
        dateStr = t.date.toISOString().slice(0, 10);
      } else if (typeof t.date === 'string') {
        // If it's already a string in YYYY-MM-DD format
        if (t.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dateStr = t.date;
        } else {
          // Try to parse it as a date
          try {
            const date = new Date(t.date);
            if (!isNaN(date.getTime())) {
              dateStr = date.toISOString().slice(0, 10);
            }
          } catch (e) {
            // If parsing fails, use the original string
            dateStr = t.date;
          }
        }
      }
    }
    
    const amount = t.amount !== undefined && t.amount !== null ? `$${Number(t.amount).toFixed(2)}` : '$0.00';
    
    // ✅ ENHANCED: Prioritize enriched data over basic data for better categorization
    let category = '';
    if (t.enriched_data?.category && Array.isArray(t.enriched_data.category)) {
      // Use enriched categories first
      const validCategories = t.enriched_data.category.filter((cat: any) => cat && cat.trim() !== '' && cat !== '0');
      if (validCategories.length > 0) {
        category = ` [Enhanced: ${validCategories.join(', ')}]`;
      }
    }
    
    // Fallback to basic categories if no enriched data
    if (!category && t.category) {
      if (Array.isArray(t.category)) {
        // Filter out empty/null categories and join with commas
        const validCategories = t.category.filter((cat: any) => cat && cat.trim() !== '' && cat !== '0');
        if (validCategories.length > 0) {
          category = ` [Basic: ${validCategories.join(', ')}]`;
        }
      } else if (typeof t.category === 'string' && t.category.trim() !== '') {
        category = ` [Basic: ${t.category}]`;
      }
    }
    
    const pending = t.pending ? ' [PENDING]' : '';
    
    // Tokenize merchant name if available
    const merchant = (t as any).merchantName && (t as any).merchantName !== t.name 
      ? ` (${tokenizeMerchant((t as any).merchantName)})` 
      : '';
    
    // Tokenize payment method
    const paymentMethod = (t as any).paymentMethod ? ` via ${(t as any).paymentMethod}` : '';
    
    // Anonymize location - only show if it's a generic city, not specific addresses
    let location = '';
    if ((t as any).location) {
      try {
        const locationData = JSON.parse((t as any).location);
        if (locationData && locationData.city) {
          location = ` at ${locationData.city}`;
        }
      } catch (e) {
        // If JSON parsing fails, skip location
        location = '';
      }
    }
    
    // Tokenize the transaction name for privacy
    const transactionName = tokenizeMerchant(t.name || 'Unknown Transaction');
    return `- [${dateStr}] ${transactionName}${merchant}: ${amount}${category}${pending}${paymentMethod}${location}`;
  }).join('\n');
}

export function anonymizeInvestmentData(investments: any[]): string {
  return investments.map(investment => {
    // Tokenize security name and ticker symbol
    const securityToken = tokenizeSecurity(
      investment.security_name || 'Unknown Security',
      investment.ticker_symbol,
      investment.security_type
    );
    
    // Format quantity with appropriate precision
    const quantity = investment.quantity ? 
      (Number.isInteger(investment.quantity) ? 
        investment.quantity.toString() : 
        investment.quantity.toFixed(4)
      ) : '0';
    
    // Format price and value
    const price = investment.institution_price ? `$${Number(investment.institution_price).toFixed(2)}` : 'N/A';
    const value = investment.institution_value ? `$${Number(investment.institution_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
    
    // Include security type if available
    const typeInfo = investment.security_type ? ` (${investment.security_type})` : '';
    
    return `- ${securityToken}${typeInfo}: ${quantity} shares @ ${price} = ${value}`;
  }).join('\n');
}

export function anonymizeLiabilityData(liabilities: any[]): string {
  return liabilities.map(liability => {
    // Tokenize liability name and institution
    const liabilityToken = tokenizeLiability(
      liability.name || 'Unknown Liability',
      liability.type,
      liability.institution
    );
    
    // Format balance and limit
    const balance = liability.balance ? `$${Number(liability.balance).toFixed(2)}` : 'N/A';
    const limit = liability.limit ? ` (Limit: $${Number(liability.limit).toFixed(2)})` : '';
    
    // Include type and institution info
    const typeInfo = liability.type ? ` (${liability.type})` : '';
    const institutionInfo = liability.institution ? ` at ${tokenizeInstitution(liability.institution)}` : '';
    
    // Include APR if available
    const aprInfo = liability.apr ? ` - APR: ${Number(liability.apr).toFixed(2)}%` : '';
    
    return `- ${liabilityToken}${typeInfo}${institutionInfo}: ${balance}${limit}${aprInfo}`;
  }).join('\n');
}

export function anonymizeEnhancedTransactionData(transactions: any[]): string {
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
    
    // Enhanced categorization with priority
    let category = '';
    if (t.enriched_data?.category && Array.isArray(t.enriched_data.category)) {
      const validCategories = t.enriched_data.category.filter((cat: any) => cat && cat.trim() !== '' && cat !== '0');
      if (validCategories.length > 0) {
        category = ` [Enhanced: ${validCategories.join(', ')}]`;
      }
    } else if (t.category) {
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
    
    // Enhanced merchant information
    let merchantInfo = '';
    if (t.enriched_data?.merchant_name) {
      merchantInfo = ` (${tokenizeMerchant(t.enriched_data.merchant_name)})`;
    } else if ((t as any).merchantName && (t as any).merchantName !== t.name) {
      merchantInfo = ` (${tokenizeMerchant((t as any).merchantName)})`;
    }
    
    // Enhanced payment method
    const paymentMethod = t.enriched_data?.payment_method || (t as any).paymentMethod;
    const paymentInfo = paymentMethod ? ` via ${paymentMethod}` : '';
    
    // Enhanced location (only city level)
    let locationInfo = '';
    if (t.enriched_data?.location) {
      try {
        const locationData = typeof t.enriched_data.location === 'string' ? 
          JSON.parse(t.enriched_data.location) : t.enriched_data.location;
        if (locationData && locationData.city) {
          locationInfo = ` at ${locationData.city}`;
        }
      } catch (e) {
        // Skip location if parsing fails
      }
    } else if ((t as any).location) {
      try {
        const locationData = JSON.parse((t as any).location);
        if (locationData && locationData.city) {
          locationInfo = ` at ${locationData.city}`;
        }
      } catch (e) {
        // Skip location if parsing fails
      }
    }
    
    // Enhanced transaction name
    const transactionName = tokenizeMerchant(t.enriched_data?.transaction_name || t.name || 'Unknown Transaction');
    
    return `- [${dateStr}] ${transactionName}${merchantInfo}: ${amount}${category}${pending}${paymentInfo}${locationInfo}`;
  }).join('\n');
}

export function anonymizeConversationHistory(conversations: any[]): string {
  return conversations
    .reverse()
    .map(conv => `User: ${conv.question}\nAssistant: ${conv.answer}`)
    .join('\n\n');
}

// Convert AI response back to user-friendly format
export function convertResponseToUserFriendly(response: string): string {
  // ✅ Input validation - must be first to prevent errors
  if (typeof response !== 'string' || response === null || response === undefined) {
    console.log('convertResponseToUserFriendly: Invalid input, converting to string:', typeof response, response);
    return String(response); // Use String() directly to get "null", "undefined", etc.
  }
  
  // ✅ DEBUG: Log current tokenization maps and response content
  console.log('convertResponseToUserFriendly: Current merchantRealDataMap size:', merchantRealDataMap.size);
  if (merchantRealDataMap.size > 0) {
    console.log('convertResponseToUserFriendly: Merchant mappings:', 
      Array.from(merchantRealDataMap.entries()).slice(0, 10));
  }
  
  // ✅ DEBUG: Log account tokenization maps to diagnose Robinhood account issue
  console.log('convertResponseToUserFriendly: Current accountRealDataMap size:', accountRealDataMap.size);
  if (accountRealDataMap.size > 0) {
    console.log('convertResponseToUserFriendly: Account mappings:', 
      Array.from(accountRealDataMap.entries()).slice(0, 20));
  }
  
  // ✅ DEBUG: Check for specific Robinhood account tokens in response
  const robinhoodTokens = response.match(/Account_\d+/g);
  if (robinhoodTokens) {
    console.log('convertResponseToUserFriendly: Found Robinhood account tokens in response:', robinhoodTokens);
    robinhoodTokens.forEach(token => {
      const realData = accountRealDataMap.get(token);
      console.log(`convertResponseToUserFriendly: Token ${token} maps to:`, realData);
    });
  }
  
  // ✅ DEBUG: Dump all tokenization maps to see current state
  dumpTokenizationMaps();
  
  // ✅ DEBUG: Check for July transaction patterns in response (safe now that we know it's a string)
  const julyPatterns = response.match(/CREDIT CARD.*PAYMENT.*\/\/\d+/g);
  const merchantPatterns = response.match(/Merchant_\d+/g);
  console.log('convertResponseToUserFriendly: Found patterns:', {
    julyPatterns: julyPatterns?.slice(0, 5),
    merchantPatterns: merchantPatterns?.slice(0, 5)
  });
  
  let userFriendlyResponse = response;
  
  // Replace account tokens with real names
  accountRealDataMap.forEach((realData, token) => {
    const replacement = realData.institution 
      ? `${realData.name} at ${realData.institution}`
      : realData.name;
    userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), replacement);
  });
  
  // Replace institution tokens with real names
  institutionRealDataMap.forEach((realName, token) => {
    userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), realName);
  });
  
  // Replace merchant tokens with real names
  merchantRealDataMap.forEach((realName, token) => {
    userFriendlyResponse = userFriendlyResponse.replace(new RegExp(token, 'g'), realName);
  });
  
  // Replace security tokens with real names
  securityRealDataMap.forEach((realData, token) => {
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
  liabilityRealDataMap.forEach((realData, token) => {
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

// Clear tokenization maps (call this when user logs out or session ends)
export function clearTokenizationMaps(): void {
  accountTokenMap.clear();
  institutionTokenMap.clear();
  merchantTokenMap.clear();
  securityTokenMap.clear();
  liabilityTokenMap.clear();
  accountRealDataMap.clear();
  institutionRealDataMap.clear();
  merchantRealDataMap.clear();
  securityRealDataMap.clear();
  liabilityRealDataMap.clear();
  accountCounter = 1;
  institutionCounter = 1;
  merchantCounter = 1;
  securityCounter = 1;
  liabilityCounter = 1;
}

// Debug function to dump current tokenization maps
export function dumpTokenizationMaps(): void {
  console.log('=== TOKENIZATION MAPS DUMP ===');
  console.log('Account Token Map:', Array.from(accountTokenMap.entries()));
  console.log('Account Real Data Map:', Array.from(accountRealDataMap.entries()));
  console.log('Institution Token Map:', Array.from(institutionTokenMap.entries()));
  console.log('Institution Real Data Map:', Array.from(institutionRealDataMap.entries()));
  console.log('Merchant Token Map:', Array.from(merchantTokenMap.entries()));
  console.log('Merchant Real Data Map:', Array.from(merchantRealDataMap.entries()));
  console.log('Security Token Map:', Array.from(securityTokenMap.entries()));
  console.log('Security Real Data Map:', Array.from(securityRealDataMap.entries()));
  console.log('Liability Token Map:', Array.from(liabilityTokenMap.entries()));
  console.log('Liability Real Data Map:', Array.from(liabilityRealDataMap.entries()));
  console.log('Counters:', {
    account: accountCounter,
    institution: institutionCounter,
    merchant: merchantCounter,
    security: securityCounter,
    liability: liabilityCounter
  });
  console.log('=== END TOKENIZATION MAPS DUMP ===');
} 