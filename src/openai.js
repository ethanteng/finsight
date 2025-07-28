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
exports.openai = void 0;
exports.askOpenAI = askOpenAI;
const openai_1 = __importDefault(require("openai"));
const prisma_1 = require("../generated/prisma");
const privacy_1 = require("./privacy");
const orchestrator_1 = require("./data/orchestrator");
const types_1 = require("./data/types");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
exports.openai = new openai_1.default({ apiKey: OPENAI_API_KEY });
const prisma = new prisma_1.PrismaClient();
function askOpenAI(question_1) {
    return __awaiter(this, arguments, void 0, function* (question, conversationHistory = [], userTier = types_1.UserTier.STARTER) {
        var _a, _b;
        // Fetch accounts and transactions from DB
        const accounts = yield prisma.account.findMany();
        const transactions = yield prisma.transaction.findMany({
            orderBy: { date: 'desc' },
            take: 200, // increased limit for context
        });
        // Anonymize data before sending to OpenAI
        const accountSummary = (0, privacy_1.anonymizeAccountData)(accounts);
        const transactionSummary = (0, privacy_1.anonymizeTransactionData)(transactions);
        console.log(`AI context: ${transactions.length} transactions, ${accounts.length} accounts, ${conversationHistory.length} conversation pairs, tier: ${userTier}`);
        // Get market context based on user tier
        const marketContext = yield orchestrator_1.dataOrchestrator.getMarketContext(userTier);
        let systemPrompt = `You are a financial assistant. Here is the user's account summary:\n${accountSummary}\n\nRecent transactions:\n${transactionSummary}`;
        // Add market context based on tier
        if (marketContext.economicIndicators) {
            const { cpi, fedRate, mortgageRate, creditCardAPR } = marketContext.economicIndicators;
            systemPrompt += `\n\nCurrent economic indicators:\n- CPI: ${cpi.value}% (${cpi.date})\n- Fed Funds Rate: ${fedRate.value}%\n- Average 30-year Mortgage Rate: ${mortgageRate.value}%\n- Average Credit Card APR: ${creditCardAPR.value}%`;
        }
        if (marketContext.liveMarketData) {
            const { cdRates, treasuryYields, mortgageRates } = marketContext.liveMarketData;
            systemPrompt += `\n\nLive market data:\nCD Rates: ${cdRates.map(cd => `${cd.term}: ${cd.rate}%`).join(', ')}\nTreasury Yields: ${treasuryYields.slice(0, 4).map(t => `${t.term}: ${t.yield}%`).join(', ')}\nCurrent Mortgage Rates: ${mortgageRates.map(m => `${m.type}: ${m.rate}%`).join(', ')}`;
        }
        systemPrompt += `\n\nAnswer the user's question using this data. If the user asks to "show all transactions" or "list all transactions", provide a numbered list of individual transactions rather than summarizing them.`;
        // Anonymize conversation history
        const conversationContext = (0, privacy_1.anonymizeConversationHistory)(conversationHistory);
        const messages = [
            { role: 'system', content: systemPrompt },
        ];
        // Add conversation history if available
        if (conversationContext) {
            messages.push({ role: 'user', content: `Previous conversation:\n${conversationContext}\n\nCurrent question:` });
        }
        messages.push({ role: 'user', content: question });
        const completion = yield exports.openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages,
            max_tokens: 2000,
        });
        return ((_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || 'No answer generated.';
    });
}
