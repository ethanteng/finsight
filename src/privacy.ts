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
    const date = t.date.toISOString().slice(0,10);
    const amount = `$${t.amount.toFixed(2)}`;
    const category = t.category ? ` [${t.category}]` : '';
    const pending = t.pending ? ' [PENDING]' : '';
    
    // Tokenize merchant name if available
    const merchant = (t as any).merchantName && (t as any).merchantName !== t.name 
      ? ` (${tokenizeMerchant((t as any).merchantName)})` 
      : '';
    
    // Tokenize payment method
    const paymentMethod = (t as any).paymentMethod ? ` via ${(t as any).paymentMethod}` : '';
    
    // Anonymize location - only show if it's a generic city, not specific addresses
    const location = (t as any).location ? ` at ${JSON.parse((t as any).location).city || 'Unknown location'}` : '';
    
    return `- [${date}] ${t.name}${merchant}: ${amount}${category}${pending}${paymentMethod}${location}`;
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