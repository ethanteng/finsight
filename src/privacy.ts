import { PrismaClient } from '@prisma/client';

// Will be used when user system is implemented
const prisma = new PrismaClient();

// Tokenization maps to maintain consistency within a session
const accountTokenMap = new Map<string, string>();
const institutionTokenMap = new Map<string, string>();
const merchantTokenMap = new Map<string, string>();

// Reverse mappings for converting tokens back to real data
const accountRealDataMap = new Map<string, { name: string; institution?: string }>();
const institutionRealDataMap = new Map<string, string>();
const merchantRealDataMap = new Map<string, string>();

let accountCounter = 1;
let institutionCounter = 1;
let merchantCounter = 1;

export function tokenizeAccount(accountName: string, institutionName?: string): string {
  // ✅ Input validation
  const safeAccountName = String(accountName || '');
  const safeInstitutionName = String(institutionName || '');
  
  const key = `${safeAccountName}-${safeInstitutionName || 'unknown'}`;
  if (!accountTokenMap.has(key)) {
    const token = `Account_${accountCounter++}`;
    accountTokenMap.set(key, token);
    accountRealDataMap.set(token, { name: safeAccountName, institution: safeInstitutionName });
  }
  return accountTokenMap.get(key)!;
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

export function anonymizeAccountData(accounts: any[]): string {
  return accounts.map(a => {
    const balance = a.currentBalance ? `$${a.currentBalance.toFixed(2)}` : 'N/A';
    const available = a.availableBalance ? ` (Available: $${a.availableBalance.toFixed(2)})` : '';
    const accountToken = tokenizeAccount(a.name, a.institution);
    const institutionToken = a.institution ? tokenizeInstitution(a.institution) : '';
    const institutionInfo = institutionToken ? ` at ${institutionToken}` : '';
    
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
    
    const transactionName = t.name || 'Unknown Transaction';
    return `- [${dateStr}] ${transactionName}${merchant}: ${amount}${category}${pending}${paymentMethod}${location}`;
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
  // ✅ Input validation
  if (typeof response !== 'string') {
    return String(response);
  }
  
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
  
  return userFriendlyResponse;
}

// Clear tokenization maps (call this when user logs out or session ends)
export function clearTokenizationMaps(): void {
  accountTokenMap.clear();
  institutionTokenMap.clear();
  merchantTokenMap.clear();
  accountRealDataMap.clear();
  institutionRealDataMap.clear();
  merchantRealDataMap.clear();
  accountCounter = 1;
  institutionCounter = 1;
  merchantCounter = 1;
} 