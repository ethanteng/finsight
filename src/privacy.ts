import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tokenization maps to maintain consistency within a session
const accountTokenMap = new Map<string, string>();
const institutionTokenMap = new Map<string, string>();
const merchantTokenMap = new Map<string, string>();

let accountCounter = 1;
let institutionCounter = 1;
let merchantCounter = 1;

export function tokenizeAccount(accountName: string, institutionName?: string): string {
  const key = `${accountName}-${institutionName || 'unknown'}`;
  if (!accountTokenMap.has(key)) {
    accountTokenMap.set(key, `Account_${accountCounter++}`);
  }
  return accountTokenMap.get(key)!;
}

export function tokenizeInstitution(institutionName: string): string {
  if (!institutionTokenMap.has(institutionName)) {
    institutionTokenMap.set(institutionName, `Institution_${institutionCounter++}`);
  }
  return institutionTokenMap.get(institutionName)!;
}

export function tokenizeMerchant(merchantName: string): string {
  if (!merchantTokenMap.has(merchantName)) {
    merchantTokenMap.set(merchantName, `Merchant_${merchantCounter++}`);
  }
  return merchantTokenMap.get(merchantName)!;
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

// Clear tokenization maps (call this when user logs out or session ends)
export function clearTokenizationMaps(): void {
  accountTokenMap.clear();
  institutionTokenMap.clear();
  merchantTokenMap.clear();
  accountCounter = 1;
  institutionCounter = 1;
  merchantCounter = 1;
} 