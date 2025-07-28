"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncAllAccounts = syncAllAccounts;
exports.getLastSyncInfo = getLastSyncInfo;
const client_1 = require("@prisma/client");
const plaid_1 = require("plaid");
// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma = null;
const getPrismaClient = () => {
    if (!prisma) {
        prisma = new client_1.PrismaClient();
    }
    return prisma;
};
const configuration = new plaid_1.Configuration({
    basePath: plaid_1.PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
        },
    },
});
const plaidClient = new plaid_1.PlaidApi(configuration);
function syncAllAccounts() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const startTime = new Date();
        try {
            // Get all access tokens from the database
            const accessTokens = yield getPrismaClient().accessToken.findMany({
                select: { token: true }
            });
            if (accessTokens.length === 0) {
                return {
                    success: true,
                    accountsSynced: 0,
                    transactionsSynced: 0,
                    timestamp: startTime
                };
            }
            // First, collect all unique accounts and transactions across all tokens
            const allAccounts = new Map(); // account_id -> account data
            const allTransactions = new Map(); // transaction_id -> transaction data
            console.log(`Processing ${accessTokens.length} access tokens...`);
            for (const { token } of accessTokens) {
                try {
                    // Get accounts for this token
                    const accountsResponse = yield plaidClient.accountsGet({
                        access_token: token,
                    });
                    // Collect unique accounts (deduplicate by name + type + subtype like in /plaid/all-accounts)
                    console.log(`Token ${token.substring(0, 8)}... accounts:`, accountsResponse.data.accounts.map(a => a.name));
                    for (const account of accountsResponse.data.accounts) {
                        const accountKey = `${account.name}-${account.type}-${account.subtype}`;
                        if (!allAccounts.has(accountKey)) {
                            allAccounts.set(accountKey, account);
                        }
                    }
                    // Get transactions for this token
                    const transactionsResponse = yield plaidClient.transactionsGet({
                        access_token: token,
                        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
                        end_date: new Date().toISOString().split('T')[0],
                    });
                    // Collect unique transactions (deduplicate by name + amount + date like accounts)
                    for (const transaction of transactionsResponse.data.transactions) {
                        const transactionKey = `${transaction.name}-${transaction.amount}-${transaction.date}`;
                        if (!allTransactions.has(transactionKey)) {
                            allTransactions.set(transactionKey, transaction);
                        }
                    }
                }
                catch (error) {
                    console.error(`Error collecting data for token: ${error}`);
                    // Continue with other tokens even if one fails
                }
            }
            // Now sync the unique accounts
            console.log(`Found ${allAccounts.size} unique accounts across all tokens`);
            let totalAccountsSynced = 0;
            for (const [accountKey, account] of allAccounts) {
                yield getPrismaClient().account.upsert({
                    where: { plaidAccountId: account.account_id },
                    update: {
                        name: account.name,
                        mask: account.mask,
                        type: account.type,
                        subtype: account.subtype,
                        officialName: account.official_name,
                        currentBalance: account.balances.current,
                        availableBalance: account.balances.available,
                        limit: account.balances.limit,
                        currency: account.balances.iso_currency_code,
                        institution: account.institution_name,
                        verificationStatus: account.verification_status,
                        persistentAccountId: account.persistent_account_id,
                        lastSynced: new Date(),
                    },
                    create: {
                        plaidAccountId: account.account_id,
                        name: account.name,
                        mask: account.mask,
                        type: account.type,
                        subtype: account.subtype,
                        officialName: account.official_name,
                        currentBalance: account.balances.current,
                        availableBalance: account.balances.available,
                        limit: account.balances.limit,
                        currency: account.balances.iso_currency_code,
                        institution: account.institution_name,
                        verificationStatus: account.verification_status,
                        persistentAccountId: account.persistent_account_id,
                        lastSynced: new Date(),
                    },
                });
                totalAccountsSynced++;
            }
            console.log(`Synced ${totalAccountsSynced} unique accounts`);
            // Now sync the unique transactions
            console.log(`Found ${allTransactions.size} unique transactions across all tokens`);
            let totalTransactionsSynced = 0;
            for (const [transactionKey, transaction] of allTransactions) {
                // Find the account for this transaction
                const account = yield getPrismaClient().account.findUnique({
                    where: { plaidAccountId: transaction.account_id },
                });
                if (account) {
                    yield getPrismaClient().transaction.upsert({
                        where: { plaidTransactionId: transaction.transaction_id },
                        update: {
                            amount: transaction.amount,
                            date: new Date(transaction.date),
                            name: transaction.name,
                            merchantName: transaction.merchant_name,
                            originalDescription: transaction.original_description,
                            category: ((_a = transaction.category) === null || _a === void 0 ? void 0 : _a.join(', ')) || '',
                            categoryId: transaction.category_id,
                            pending: transaction.pending,
                            pendingTransactionId: transaction.pending_transaction_id,
                            paymentChannel: transaction.payment_channel,
                            paymentMethod: (_b = transaction.payment_meta) === null || _b === void 0 ? void 0 : _b.payment_method,
                            currency: transaction.iso_currency_code,
                            authorizedDate: transaction.authorized_date ? new Date(transaction.authorized_date) : null,
                            checkNumber: transaction.check_number,
                            location: transaction.location ? JSON.stringify(transaction.location) : null,
                            accountId: account.id,
                            lastSynced: new Date(),
                        },
                        create: {
                            plaidTransactionId: transaction.transaction_id,
                            amount: transaction.amount,
                            date: new Date(transaction.date),
                            name: transaction.name,
                            merchantName: transaction.merchant_name,
                            originalDescription: transaction.original_description,
                            category: ((_c = transaction.category) === null || _c === void 0 ? void 0 : _c.join(', ')) || '',
                            categoryId: transaction.category_id,
                            pending: transaction.pending,
                            pendingTransactionId: transaction.pending_transaction_id,
                            paymentChannel: transaction.payment_channel,
                            paymentMethod: (_d = transaction.payment_meta) === null || _d === void 0 ? void 0 : _d.payment_method,
                            currency: transaction.iso_currency_code,
                            authorizedDate: transaction.authorized_date ? new Date(transaction.authorized_date) : null,
                            checkNumber: transaction.check_number,
                            location: transaction.location ? JSON.stringify(transaction.location) : null,
                            accountId: account.id,
                            lastSynced: new Date(),
                        },
                    });
                    totalTransactionsSynced++;
                }
            }
            console.log(`Synced ${totalTransactionsSynced} unique transactions`);
            // Update the global sync timestamp
            yield getPrismaClient().syncStatus.upsert({
                where: { id: '1' },
                update: {
                    lastSync: startTime,
                    accountsSynced: totalAccountsSynced,
                    transactionsSynced: totalTransactionsSynced,
                },
                create: {
                    id: '1',
                    lastSync: startTime,
                    accountsSynced: totalAccountsSynced,
                    transactionsSynced: totalTransactionsSynced,
                },
            });
            return {
                success: true,
                accountsSynced: totalAccountsSynced,
                transactionsSynced: totalTransactionsSynced,
                timestamp: startTime,
            };
        }
        catch (error) {
            console.error('Error in syncAllAccounts:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: startTime,
            };
        }
    });
}
function getLastSyncInfo() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const syncStatus = yield getPrismaClient().syncStatus.findUnique({
                where: { id: '1' },
            });
            return syncStatus;
        }
        catch (error) {
            console.error('Error getting sync status:', error);
            return null;
        }
    });
}
