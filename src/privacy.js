"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenizeAccount = tokenizeAccount;
exports.tokenizeInstitution = tokenizeInstitution;
exports.tokenizeMerchant = tokenizeMerchant;
exports.anonymizeAccountData = anonymizeAccountData;
exports.anonymizeTransactionData = anonymizeTransactionData;
exports.anonymizeConversationHistory = anonymizeConversationHistory;
exports.clearTokenizationMaps = clearTokenizationMaps;
const prisma_1 = require("../generated/prisma");
const prisma = new prisma_1.PrismaClient();
// Tokenization maps to maintain consistency within a session
const accountTokenMap = new Map();
const institutionTokenMap = new Map();
const merchantTokenMap = new Map();
let accountCounter = 1;
let institutionCounter = 1;
let merchantCounter = 1;
function tokenizeAccount(accountName, institutionName) {
    const key = `${accountName}-${institutionName || 'unknown'}`;
    if (!accountTokenMap.has(key)) {
        accountTokenMap.set(key, `Account_${accountCounter++}`);
    }
    return accountTokenMap.get(key);
}
function tokenizeInstitution(institutionName) {
    if (!institutionTokenMap.has(institutionName)) {
        institutionTokenMap.set(institutionName, `Institution_${institutionCounter++}`);
    }
    return institutionTokenMap.get(institutionName);
}
function tokenizeMerchant(merchantName) {
    if (!merchantTokenMap.has(merchantName)) {
        merchantTokenMap.set(merchantName, `Merchant_${merchantCounter++}`);
    }
    return merchantTokenMap.get(merchantName);
}
function anonymizeAccountData(accounts) {
    return accounts.map(a => {
        const balance = a.currentBalance ? `$${a.currentBalance.toFixed(2)}` : 'N/A';
        const available = a.availableBalance ? ` (Available: $${a.availableBalance.toFixed(2)})` : '';
        const accountToken = tokenizeAccount(a.name, a.institution);
        const institutionToken = a.institution ? tokenizeInstitution(a.institution) : '';
        const institutionInfo = institutionToken ? ` at ${institutionToken}` : '';
        return `- ${accountToken} (${a.type}${a.subtype ? '/' + a.subtype : ''}): ${balance}${available}${institutionInfo}`;
    }).join('\n');
}
function anonymizeTransactionData(transactions) {
    return transactions.map(t => {
        const date = t.date.toISOString().slice(0, 10);
        const amount = `$${t.amount.toFixed(2)}`;
        const category = t.category ? ` [${t.category}]` : '';
        const pending = t.pending ? ' [PENDING]' : '';
        // Tokenize merchant name if available
        const merchant = t.merchantName && t.merchantName !== t.name
            ? ` (${tokenizeMerchant(t.merchantName)})`
            : '';
        // Tokenize payment method
        const paymentMethod = t.paymentMethod ? ` via ${t.paymentMethod}` : '';
        // Anonymize location - only show if it's a generic city, not specific addresses
        const location = t.location ? ` at ${JSON.parse(t.location).city || 'Unknown location'}` : '';
        return `- [${date}] ${t.name}${merchant}: ${amount}${category}${pending}${paymentMethod}${location}`;
    }).join('\n');
}
function anonymizeConversationHistory(conversations) {
    return conversations
        .reverse()
        .map(conv => `User: ${conv.question}\nAssistant: ${conv.answer}`)
        .join('\n\n');
}
// Clear tokenization maps (call this when user logs out or session ends)
function clearTokenizationMaps() {
    accountTokenMap.clear();
    institutionTokenMap.clear();
    merchantTokenMap.clear();
    accountCounter = 1;
    institutionCounter = 1;
    merchantCounter = 1;
}
