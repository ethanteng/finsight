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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const plaid_1 = require("./plaid");
const openai_1 = require("./openai");
const cors_1 = __importDefault(require("cors"));
const node_cron_1 = __importDefault(require("node-cron"));
const sync_1 = require("./sync");
const client_1 = require("@prisma/client");
const orchestrator_1 = require("./data/orchestrator");
// Initialize Prisma client lazily to avoid import issues during ts-node startup
let prisma = null;
const getPrismaClient = () => {
    if (!prisma) {
        prisma = new client_1.PrismaClient();
    }
    return prisma;
};
const app = (0, express_1.default)();
exports.app = app;
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, cors_1.default)({
    origin: [
        'https://asklinc.com', // your Vercel frontend URL
        'https://www.asklinc.com', // www version
        'http://localhost:3001' // for localdev, optional
    ],
    credentials: true
}));
// Increase response size limit
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});
// Setup Plaid routes
(0, plaid_1.setupPlaidRoutes)(app);
// OpenAI Q&A endpoint
app.post('/ask', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { question, userTier = 'starter' } = req.body;
        if (!question) {
            return res.status(400).json({ error: 'Question is required' });
        }
        // Get recent conversation history (last 5 Q&A pairs)
        const recentConversations = yield getPrismaClient().conversation.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
        });
        // Map frontend tier to backend enum
        const tierMap = {
            'starter': 'STARTER',
            'standard': 'STANDARD',
            'premium': 'PREMIUM'
        };
        const backendTier = tierMap[userTier] || 'STARTER';
        const answer = yield (0, openai_1.askOpenAI)(question, recentConversations, backendTier);
        // Store the new Q&A pair
        yield getPrismaClient().conversation.create({
            data: {
                question,
                answer,
            },
        });
        res.json({ answer });
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ error: err.message });
        }
        else {
            res.status(500).json({ error: 'Unknown error' });
        }
    }
}));
// Test endpoint for market data (development only)
app.get('/test/market-data/:tier', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { tier } = req.params;
        const tierMap = {
            'starter': 'STARTER',
            'standard': 'STANDARD',
            'premium': 'PREMIUM'
        };
        const backendTier = tierMap[tier] || 'STARTER';
        const marketContext = yield orchestrator_1.dataOrchestrator.getMarketContext(backendTier);
        res.json({
            tier: backendTier,
            marketContext,
            cacheStats: yield orchestrator_1.dataOrchestrator.getCacheStats()
        });
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ error: err.message });
        }
        else {
            res.status(500).json({ error: 'Unknown error' });
        }
    }
}));
// Get sync status endpoint
app.get('/sync/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const syncInfo = yield (0, sync_1.getLastSyncInfo)();
        res.json({ syncInfo });
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ error: err.message });
        }
        else {
            res.status(500).json({ error: 'Unknown error' });
        }
    }
}));
// Manual sync endpoint for testing
app.post('/sync/manual', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, sync_1.syncAllAccounts)();
        res.json(result);
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ error: err.message });
        }
        else {
            res.status(500).json({ error: 'Unknown error' });
        }
    }
}));
// Fix transactions appearing under multiple accounts
app.post('/sync/fix-transaction-accounts', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get all transactions with their account details
        const allTransactions = yield getPrismaClient().transaction.findMany({
            include: { account: true },
            orderBy: { date: 'desc' }
        });
        console.log(`Found ${allTransactions.length} total transactions in database`);
        // Group transactions by unique key
        const uniqueTransactions = new Map();
        const duplicatesToDelete = [];
        for (const transaction of allTransactions) {
            // Use a comprehensive key that includes all relevant fields
            const key = `${transaction.name}-${transaction.amount}-${transaction.date.toISOString().slice(0, 10)}`;
            if (uniqueTransactions.has(key)) {
                // This is a duplicate, mark for deletion
                console.log(`Duplicate found: ${transaction.name} ${transaction.amount} on ${transaction.date.toISOString().slice(0, 10)} from ${transaction.account.name}`);
                duplicatesToDelete.push(transaction.id);
            }
            else {
                uniqueTransactions.set(key, transaction);
                console.log(`Unique: ${transaction.name} ${transaction.amount} on ${transaction.date.toISOString().slice(0, 10)} from ${transaction.account.name}`);
            }
        }
        console.log(`Unique transactions: ${uniqueTransactions.size}`);
        console.log(`Duplicates to remove: ${duplicatesToDelete.length}`);
        // Delete duplicate transactions
        if (duplicatesToDelete.length > 0) {
            yield getPrismaClient().transaction.deleteMany({
                where: { id: { in: duplicatesToDelete } }
            });
        }
        res.json({
            success: true,
            duplicatesRemoved: duplicatesToDelete.length,
            uniqueTransactionsRemaining: uniqueTransactions.size,
            totalBefore: allTransactions.length
        });
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ error: err.message });
        }
        else {
            res.status(500).json({ error: 'Unknown error' });
        }
    }
}));
// Privacy and data control endpoints
app.get('/privacy/data', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Return what data we have about the user (anonymized)
        const accounts = yield getPrismaClient().account.findMany();
        const transactions = yield getPrismaClient().transaction.findMany();
        const conversations = yield getPrismaClient().conversation.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10
        });
        res.json({
            accounts: accounts.length,
            transactions: transactions.length,
            conversations: conversations.length,
            lastSync: yield (0, sync_1.getLastSyncInfo)()
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve data summary' });
    }
}));
app.delete('/privacy/delete-all', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Delete all user data
        yield getPrismaClient().conversation.deleteMany();
        yield getPrismaClient().transaction.deleteMany();
        yield getPrismaClient().account.deleteMany();
        yield getPrismaClient().accessToken.deleteMany();
        yield getPrismaClient().syncStatus.deleteMany();
        res.json({ success: true, message: 'All data deleted successfully' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete data' });
    }
}));
app.post('/privacy/disconnect-accounts', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Remove all Plaid access tokens
        yield getPrismaClient().accessToken.deleteMany();
        // Clear account and transaction data
        yield getPrismaClient().transaction.deleteMany();
        yield getPrismaClient().account.deleteMany();
        yield getPrismaClient().syncStatus.deleteMany();
        res.json({ success: true, message: 'All accounts disconnected and data cleared' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to disconnect accounts' });
    }
}));
const PORT = process.env.PORT || 3000;
// Only start the server if this file is run directly
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        // Set up cron job to sync accounts and transactions daily at 2 AM
        node_cron_1.default.schedule('0 2 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
            console.log('Starting daily sync job...');
            try {
                const result = yield (0, sync_1.syncAllAccounts)();
                if (result.success) {
                    console.log(`Daily sync completed: ${result.accountsSynced} accounts, ${result.transactionsSynced} transactions synced`);
                }
                else {
                    console.error('Daily sync failed:', result.error);
                }
            }
            catch (error) {
                console.error('Error in daily sync job:', error);
            }
        }), {
            timezone: 'America/New_York'
        });
        console.log('Cron job scheduled: daily sync at 2 AM EST');
    });
}
