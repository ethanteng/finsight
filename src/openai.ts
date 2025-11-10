import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { performance } from 'perf_hooks';
import { AnonymizationService } from './services/anonymization-service';
import { DeanonymizationService } from './services/deanonymization-service';
// Legacy imports from privacy.ts for backward compatibility (will be removed once fully migrated)
import { anonymizeSnapTradeData, anonymizeConversationHistory } from './privacy';
import { dataOrchestrator, TierAwareContext } from './data/orchestrator';
import { UserTier } from './data/types';
import { BalanceService } from './services/balance-service';
import { persistTransactionsToDb, persistSnapTradeActivitiesToDb } from './data/persistence';
import { logGPTContext } from './services/gpt-logger';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * Validate Plaid access token and update database status
 * Returns true if token is valid, false otherwise
 */
async function validatePlaidToken(tokenRecord: any, plaidClient: any, prisma: any): Promise<boolean> {
  try {
    const itemResponse = await plaidClient.itemGet({
      access_token: tokenRecord.token
    });
    
    // Check if item has any error states
    if (itemResponse.data.item.error) {
      console.warn(`Token ${tokenRecord.id} has error:`, itemResponse.data.item.error.error_code);
      
      // Update token status in database
      await prisma.accessToken.update({
        where: { id: tokenRecord.id },
        data: { 
          isActive: false,
          lastError: itemResponse.data.item.error.error_code,
          lastChecked: new Date()
        }
      });
      
      return false;
    }
    
    // Fetch institution name from Plaid
    let institutionName = null;
    try {
      if (itemResponse.data.item.institution_id) {
        const institutionResponse = await plaidClient.institutionsGetById({
          institution_id: itemResponse.data.item.institution_id,
          country_codes: ['US' as any]
        });
        institutionName = institutionResponse.data.institution.name;
      }
    } catch (instError) {
      console.warn(`Failed to fetch institution name for ${itemResponse.data.item.institution_id}:`, instError);
    }
    
    // Update token as valid with institution name
    await prisma.accessToken.update({
      where: { id: tokenRecord.id },
      data: { 
        isActive: true,
        lastError: null,
        lastChecked: new Date(),
        institutionName: institutionName
      }
    });
    
    return true;
    
  } catch (itemError: any) {
    console.error(`Token validation failed for ${tokenRecord.id}:`, itemError.response?.data?.error_code || itemError.message);
    
    // Update token status in database
    await prisma.accessToken.update({
      where: { id: tokenRecord.id },
      data: { 
        isActive: false,
        lastError: itemError.response?.data?.error_code || 'VALIDATION_FAILED',
        lastChecked: new Date()
      }
    });
    
    return false;
  }
}

// Safety check: Prevent real OpenAI API calls in test/CI environments
if (process.env.NODE_ENV === 'test' || process.env.GITHUB_ACTIONS) {
  console.log('OpenAI: Test/CI environment detected - using mock responses');
}
const prisma = new PrismaClient();

// Helper function to get Plaid credentials based on mode
const getPlaidCredentials = () => {
  const plaidMode = process.env.PLAID_MODE || 'sandbox';
  if (plaidMode === 'production') {
    return {
      clientId: process.env.PLAID_CLIENT_ID_PROD || process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET_PROD || process.env.PLAID_SECRET,
      env: process.env.PLAID_ENV_PROD || 'production'
    };
  } else {
    return {
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      env: 'sandbox'
    };
  }
};

// Helper function to get institution data for an access token
const getInstitutionData = async (accessToken: string, plaidClient: any) => {
  try {
    // First get the item to get the institution_id
    const itemResponse = await plaidClient.itemGet({
      access_token: accessToken,
    });
    
    const institutionId = itemResponse.data.item.institution_id;
    
    // Then get the institution details
    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ['US'],
      options: {
        include_optional_metadata: true
      }
    });
    
    return {
      institution_id: institutionId,
      name: institutionResponse.data.institution.name,
      logo: institutionResponse.data.institution.logo,
      primary_color: institutionResponse.data.institution.primary_color,
      url: institutionResponse.data.institution.url
    };
  } catch (error) {
    console.error('Error fetching institution data:', error);
    return null;
  }
};

interface Conversation {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

/**
 * Analyze question to determine what context is needed
 * Returns flags indicating which data sources to fetch
 */
function analyzeQuestionNeeds(question: string): {
  needsMarketContext: boolean;
  needsSearchContext: boolean;
  needsHomeValue: boolean;
  needsInvestments: boolean;
} {
  const qLower = question.toLowerCase();
  
  // Market context: investment, stock, market, portfolio, asset allocation questions
  const needsMarketContext = 
    qLower.includes('investment') || 
    qLower.includes('portfolio') || 
    qLower.includes('stock') || 
    qLower.includes('market') ||
    qLower.includes('asset allocation') ||
    qLower.includes('holdings') ||
    qLower.includes('securities') ||
    qLower.includes('retirement') ||
    qLower.includes('401k') ||
    qLower.includes('ira');
  
  // Search context: real-time rates, current prices, specific institution info
  const needsSearchContext =
    qLower.includes('rate') ||
    qLower.includes('apr') ||
    qLower.includes('current') ||
    qLower.includes('today') ||
    qLower.includes('now') ||
    qLower.includes('mortgage') ||
    qLower.includes('refinance') ||
    qLower.includes('yield') ||
    qLower.includes('return');
  
  // Home value: property, home, house, real estate questions
  const needsHomeValue =
    qLower.includes('home') ||
    qLower.includes('house') ||
    qLower.includes('property') ||
    qLower.includes('real estate') ||
    qLower.includes('mortgage');
  
  // Investments: portfolio, holdings, investments questions
  const needsInvestments =
    qLower.includes('portfolio') ||
    qLower.includes('holding') ||
    qLower.includes('investment') ||
    qLower.includes('stock') ||
    qLower.includes('securities');
  
  return {
    needsMarketContext,
    needsSearchContext,
    needsHomeValue,
    needsInvestments
  };
}

/**
 * Intelligently filter and prioritize transactions for AI context
 * Focuses on most relevant transactions to improve AI response quality
 * 
 * Uses configurable transaction history (TRANSACTION_HISTORY_DAYS env var)
 */
function filterTransactionsForAI(transactions: any[]): any[] {
  if (transactions.length <= 150) return transactions; // ✅ Reduced cap from 200 to 150 for faster processing

  const now = new Date();
  const transactionHistoryDays = parseInt(process.env.TRANSACTION_HISTORY_DAYS || '90', 10);
  const cutoffDate = new Date(now.getTime() - transactionHistoryDays * 24 * 60 * 60 * 1000);
  
  // ✅ Include ALL transactions from configured history window (full available history)
  // This ensures income analysis can see all income patterns over time
  const recent = transactions.filter(t => new Date(t.date) >= cutoffDate);
  
  console.log(`OpenAI: Using ${recent.length} transactions from last ${transactionHistoryDays} days (out of ${transactions.length} total)`);
  
  // If still too many transactions, prioritize but keep more
  if (recent.length > 200) {
    // Priority 1: All income transactions (critical for income analysis)
    // ✅ Use transaction_type instead of amount sign
    const income = recent.filter(t => {
      const transactionType = (t as any).transaction_type;
      return transactionType === 'income' && (t.amount || 0) > 0;
    });
  
    // Priority 2: Large expenses (high impact)
    // ✅ Use transaction_type instead of amount sign - only include actual expenses, not transfers
    const expenses = recent.filter(t => {
      const transactionType = (t as any).transaction_type;
      return (transactionType === 'expense' || transactionType === 'fee') && (t.amount || 0) < 0;
    });
    const largeExpenses = expenses
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 100); // Keep top 100 largest expenses
    
    // Priority 3: Most recent 30 days (regardless of size)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const veryRecent = recent.filter(t => new Date(t.date) >= thirtyDaysAgo);
  
  // Combine and deduplicate
  const selected = new Set([
      ...veryRecent,      // All from last 30 days
      ...income,          // All income transactions
      ...largeExpenses    // Large expenses from 31-90 days
  ]);
  
  const filtered = Array.from(selected);
    console.log(`OpenAI: Prioritized to ${filtered.length} transactions (all income + large expenses + recent 30 days)`);
  
    return filtered.slice(0, 150); // ✅ Reduced cap from 200 to 150
  }
  
  return recent; // Return all 90-day transactions if under limit
}

/**
 * Group small/old transactions for more concise context
 */
function groupSmallTransactions(transactions: any[], displayTransactions: any[]): string {
  const grouped = transactions.filter(t => !displayTransactions.includes(t));
  if (grouped.length === 0) return '';
  
  const total = grouped.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return `\n- ${grouped.length} additional small transactions totaling $${total.toFixed(2)}`;
}

/**
 * Intelligently filter conversation history based on relevance to current question
 * Keeps recent context and relevant older exchanges
 */
function filterConversationHistory(
  history: Conversation[],
  currentQuestion: string
): Conversation[] {
  if (history.length <= 6) return history;
  
  // Always keep last 3 exchanges (most recent context)
  const recent = history.slice(0, 3);
  const older = history.slice(3);
  
  // Extract keywords from current question
  const keywords = currentQuestion.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 4) // Filter out small words
    .filter(word => !['what', 'when', 'where', 'which', 'would', 'should', 'could'].includes(word));
  
  // Financial terms that indicate important context
  const importantTerms = [
    'account', 'balance', 'portfolio', 'investment', 'savings', 'checking',
    'retirement', 'ira', 'roth', '401k', 'mortgage', 'loan', 'credit',
    'debt', 'income', 'expense', 'budget', 'goal', 'treasury', 'bond',
    'stock', 'etf', 'mutual', 'fund', 'rate', 'interest'
  ];
  
  // Score older conversations by relevance
  const scored = older.map(conv => {
    const text = (conv.question + ' ' + conv.answer).toLowerCase();
    let score = 0;
    
    // Match current question keywords
    keywords.forEach(keyword => {
      if (text.includes(keyword)) score += 2;
    });
    
    // Match important financial terms
    importantTerms.forEach(term => {
      if (text.includes(term)) score += 1;
    });
    
    return { conv, score };
  });
  
  // Take top 5 relevant older conversations
  const relevant = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(item => item.conv);
  
  // Combine recent + relevant, maintain chronological order
  const combined = [...recent, ...relevant].sort((a, b) => 
    b.createdAt.getTime() - a.createdAt.getTime()
  );
  
  console.log(`OpenAI: Filtered conversation history from ${history.length} to ${combined.length} relevant exchanges`);
  
  return combined.slice(0, 8); // Cap at 8 exchanges
}

/**
 * Analyze recent conversation history for opportunities to reference prior threads
 */
export function analyzeConversationContext(
  conversationHistory: Conversation[],
  currentQuestion: string
): {
  hasContextOpportunities: boolean;
  instruction: string;
} {
  if (conversationHistory.length === 0) {
    return { hasContextOpportunities: false, instruction: '' };
  }

  const lowerQuestion = currentQuestion.toLowerCase();
  const contextOpportunities: string[] = [];

  const matchesAny = (patterns: (string | RegExp)[]): boolean =>
    patterns.some(pattern =>
      typeof pattern === 'string'
        ? lowerQuestion.includes(pattern)
        : pattern.test(lowerQuestion)
    );

  const questionMentions = (...patterns: (string | RegExp)[]) => matchesAny(patterns);

  const hasPriorQuestion = (...patterns: (string | RegExp)[]) =>
    conversationHistory.some(conv => {
      const lower = conv.question.toLowerCase();
      return patterns.some(pattern =>
        typeof pattern === 'string' ? lower.includes(pattern) : pattern.test(lower)
      );
    });

  const ageInfo = lowerQuestion.match(/\b(\d+)\s*(years?\s*old|y\.?o\.?|age)\b/);
  const incomeInfo = lowerQuestion.match(/\b(?:income|salary|earn|make)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/);
  const expenseInfo = lowerQuestion.match(/\b(?:expense|spend|cost)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/);
  const goalInfo = questionMentions('goal', 'target', 'planning for', 'saving for');
  const timelineInfo = lowerQuestion.match(/\b(?:in\s+(\d+)\s+years?|(\d+)\s+years?\s+from\s+now)\b/);

  if (hasPriorQuestion('portfolio', 'investment', 'asset allocation') && (ageInfo || incomeInfo || goalInfo)) {
    contextOpportunities.push(
      'User previously asked about portfolio analysis and now provided key personal information. Offer to complete the portfolio analysis with this new context.'
    );
  }

  if (hasPriorQuestion('plan', 'retirement', 'savings') && (ageInfo || timelineInfo)) {
    contextOpportunities.push(
      'User previously asked about financial planning and now provided timeline or age information. Offer to create a comprehensive financial plan.'
    );
  }

  if (hasPriorQuestion('debt', 'credit', 'loan') && (incomeInfo || expenseInfo)) {
    contextOpportunities.push(
      'User previously asked about debt analysis and now provided income/expense information. Offer to complete the debt-to-income analysis.'
    );
  }

  if (hasPriorQuestion('budget', 'spending', 'expense') && (incomeInfo || expenseInfo)) {
    contextOpportunities.push(
      'User previously asked about budgeting and provided income/expense data. Offer to build a budget breakdown.'
    );
  }

  if (
    hasPriorQuestion('business', 'business banking', 'business account', 'business savings', 'llc') &&
    questionMentions('rate', 'interest', 'apy', 'yield', 'compare', 'which', 'better', 'best')
  ) {
    contextOpportunities.push(
      'User previously asked about business banking/savings accounts and is now asking about rates or comparing options. Compare current business account and savings rates with a recommendation.'
    );
  }

  if (
    hasPriorQuestion('savings account', 'high-yield savings', 'bank account', 'cd', 'certificate of deposit') &&
    questionMentions('rate', 'interest', 'apy', 'yield', 'compare', 'which')
  ) {
    contextOpportunities.push(
      'User previously asked about savings, banking, or accounts and now wants rate information. Offer current high-yield savings rates, compare options, and reference earlier savings discussion when talking about rates or comparing options.'
    );
  }

  if (contextOpportunities.length === 0) {
    return { hasContextOpportunities: false, instruction: '' };
  }

  return {
    hasContextOpportunities: true,
    instruction: contextOpportunities.join(' ')
  };
}

// Safety net: Strip LaTeX syntax from GPT output (in case GPT ignores instructions)
function stripLatexSyntax(text: string): string {
  return text
    // Remove \text{...} - capture content and remove wrapper
    .replace(/\\text\{([^}]*)\}/g, '$1')
    // Replace \div with /
    .replace(/\\div/g, '/')
    // Replace \frac{A}{B} with (A / B)
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1 / $2)')
    // Replace \approx with ~
    .replace(/\\approx/g, '~')
    // Remove [ ... ] brackets around calculations (but keep content)
    .replace(/\[\s*\*\*([^[]*?)\*\*\s*\]/g, '**$1**')
    .replace(/\[\s*([^[]*?)\s*\]/g, '$1')
    // Clean up any remaining backslash commands
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .trim();
}

/**
 * Parse JSON output contract from OpenAI response
 * Extracts the JSON object from the response and returns both parsed JSON and narrative
 */
function parseJSONOutputContract(response: string): {
  jsonData: any | null;
  narrative: string;
  hasJSON: boolean;
} {
  try {
    // Look for JSON in a code block (```json ... ``` or ``` ... ```)
    const jsonBlockMatch = response.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
    
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      const jsonStr = jsonBlockMatch[1].trim();
      const jsonData = JSON.parse(jsonStr);
      
      // Extract narrative (everything after the JSON block)
      const jsonBlockEnd = response.indexOf(jsonBlockMatch[0]) + jsonBlockMatch[0].length;
      const narrative = response.substring(jsonBlockEnd).trim();
      
      return {
        jsonData,
        narrative,
        hasJSON: true
      };
    }
    
    // Fallback: Try to find JSON object at the start of the response
    const jsonStartMatch = response.match(/^\s*(\{[\s\S]*?\})\s*/);
    if (jsonStartMatch && jsonStartMatch[1]) {
      try {
        const jsonData = JSON.parse(jsonStartMatch[1].trim());
        const narrative = response.substring(jsonStartMatch[0].length).trim();
        
        return {
          jsonData,
          narrative,
          hasJSON: true
        };
      } catch (e) {
        // JSON parsing failed, treat as regular response
      }
    }
    
    // No JSON found, return original response as narrative
    return {
      jsonData: null,
      narrative: response,
      hasJSON: false
    };
  } catch (error) {
    console.error('Error parsing JSON output contract:', error);
    // Return original response if parsing fails
    return {
      jsonData: null,
      narrative: response,
      hasJSON: false
    };
  }
}

type PipelineSpan = ReturnType<typeof Sentry.startSpan> | undefined;

interface PipelineStageTiming {
  name: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

interface PipelineStageHandle {
  name: string;
  startedAt: number;
  span?: PipelineSpan;
}

class PipelineTracker {
  private readonly label: string;
  private readonly startedAt: number;
  private readonly stageTimings: PipelineStageTiming[] = [];
  private readonly pipelineSpan?: PipelineSpan;

  constructor(label: string) {
    this.label = label;
    this.startedAt = performance.now();
    const sentryHub = (Sentry as any).getCurrentHub?.();
    const parentSpan = sentryHub?.getScope?.().getSpan?.() as any;
    if (parentSpan?.startChild) {
      this.pipelineSpan = parentSpan.startChild({
        op: 'ai.pipeline',
        description: label
      });
    }
  }

  startStage(name: string, attributes?: Record<string, unknown>): PipelineStageHandle {
    const span: any = (this.pipelineSpan as any)?.startChild?.({
      op: `ai.${name}`,
      description: `${this.label}:${name}`
    });
    if (span && attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(`ai.stage.${key}`, value as any);
      });
    }
    return {
      name,
      startedAt: performance.now(),
      span: span as PipelineSpan
    };
  }

  endStage(handle: PipelineStageHandle, metadata?: Record<string, unknown>): void {
    const duration = performance.now() - handle.startedAt;
    this.stageTimings.push({
      name: handle.name,
      durationMs: Number(duration.toFixed(2)),
      metadata
    });
    if (handle.span) {
      const stageSpan: any = handle.span;
      stageSpan.setAttribute?.('ai.stage.duration_ms', duration);
      if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
          stageSpan.setAttribute?.(`ai.stage.${key}`, value as any);
        });
      }
      stageSpan.finish?.();
    }
  }

  finish(status: 'ok' | 'error'): void {
    const totalDuration = performance.now() - this.startedAt;
    if (this.pipelineSpan) {
      const span: any = this.pipelineSpan;
      span.setAttribute?.('ai.pipeline.status', status);
      span.setAttribute?.('ai.pipeline.total_ms', totalDuration);
      span.setAttribute?.('ai.pipeline.stage_count', this.stageTimings.length);
      for (const stage of this.stageTimings) {
        span.setAttribute?.(`ai.pipeline.stage.${stage.name}.duration_ms`, stage.durationMs);
        if (stage.metadata) {
          Object.entries(stage.metadata).forEach(([key, value]) => {
            span.setAttribute?.(`ai.pipeline.stage.${stage.name}.${key}`, value as any);
          });
        }
      }
      span.finish?.();
    }

    const stageBreakdown = this.stageTimings.reduce<Record<string, unknown>>((acc, stage) => {
      acc[stage.name] = stage.metadata
        ? { durationMs: stage.durationMs, ...stage.metadata }
        : { durationMs: stage.durationMs };
      return acc;
    }, {});

    console.log(`⏱️ AI Pipeline [${this.label}]`, {
      totalMs: Number(totalDuration.toFixed(2)),
      stages: stageBreakdown
    });
  }
}

// Enhanced post-processing function with tier-aware upgrade suggestions
function enhanceResponseWithUpgrades(answer: string, tierContext: TierAwareContext, searchContext?: string): string {
  // Don't add upgrade suggestions if search context is available (user already has access to real-time data)
  if (searchContext || tierContext.upgradeHints.length === 0) {
    return answer;
  }

  const upgradeSection = `


───────────────

**💡 Want more insights?** Upgrade your plan to access:

${tierContext.upgradeHints.map(hint => `• **${hint.feature}**: ${hint.benefit}`).join('\n')}

*Your current tier: ${tierContext.tierInfo.currentTier}*
`;

  return answer + upgradeSection;
}

/**
 * Enhanced OpenAI function with proactive market context caching
 * This version uses pre-processed market context for faster responses
 */
export async function askOpenAIWithEnhancedContext(
  question: string, 
  conversationHistory: Conversation[] = [], 
  userTier: UserTier | string = UserTier.STARTER, 
  isDemo: boolean = false, 
  userId?: string,
  model?: string,
  demoProfile?: string
): Promise<string> {
  const pipelineTracker = new PipelineTracker('askOpenAIWithEnhancedContext');
  let pipelineStatus: 'ok' | 'error' = 'ok';

  // Convert string tier to enum if needed
  const tier = typeof userTier === 'string' ? (userTier as UserTier) : userTier;

  console.log('🚀 askOpenAIWithEnhancedContext called with question:', question.substring(0, 50) + '...');
  console.log('🚀 User ID:', userId, 'Tier:', tier, 'Demo:', isDemo);
  console.log('OpenAI Enhanced: Starting enhanced context request for tier:', tier, 'isDemo:', isDemo);
  
  try {
  // ✅ Create anonymization services with session isolation
  // Use userId or generate a session fingerprint for demo mode
  const sessionId = userId || `demo-${Date.now()}`;
  const anonymizationService = new AnonymizationService();
  const deanonymizationService = new DeanonymizationService(anonymizationService);
  console.log('⚠️⚠️⚠️ DEDUPLICATION FIX VERSION 0bf8668 IS LOADED ⚠️⚠️⚠️');

    const questionAnalysisStage = pipelineTracker.startStage('question_analysis');
  const questionNeeds = analyzeQuestionNeeds(question);
    pipelineTracker.endStage(questionAnalysisStage);
  console.log('OpenAI Enhanced: Question analysis:', questionNeeds);

  // Get user-specific data
  let accounts: any[] = [];
  let transactions: any[] = [];
  let investmentData: any = null;
  let snapTradeData: any = null;
  let snapTradeActivities: any = null;
  let categorizationDetails: any = undefined; // ✅ Store for logging
    let financialData: any = null;

  // For demo mode, use demo data instead of database data
    const dataFetchStage = pipelineTracker.startStage('data_fetch');
    try {
  if (isDemo) {
    console.log('OpenAI Enhanced: Using demo data for accounts, transactions, and investments');
    try {
      const { demoData } = await import('./demo-data');
      accounts = demoData.accounts || [];
      transactions = demoData.transactions || [];
      
      investmentData = {
        portfolio: {
          totalValue: 619951.34,
          assetAllocation: [
            { type: 'Stocks', value: 450000, percentage: 72.6 },
            { type: 'Bonds', value: 120000, percentage: 19.4 },
            { type: 'Cash', value: 49951.34, percentage: 8.0 }
          ],
          holdingCount: 60,
          securityCount: 26
        },
        holdings: [
          {
            id: 'demo_account_1_security_1_100_50000',
            account_id: 'demo_account_1',
            security_id: 'demo_security_1',
            institution_value: 50000,
                institution_price: 500.0,
            institution_price_as_of: new Date().toISOString(),
            cost_basis: 48000,
            quantity: 100,
            iso_currency_code: 'USD',
            security_name: 'Apple Inc. (AAPL)',
            security_type: 'equity',
            ticker_symbol: 'AAPL'
          },
          {
            id: 'demo_account_1_security_2_200_75000',
            account_id: 'demo_account_1',
            security_id: 'demo_security_2',
            institution_value: 75000,
                institution_price: 375.0,
            institution_price_as_of: new Date().toISOString(),
            cost_basis: 70000,
            quantity: 200,
            iso_currency_code: 'USD',
            security_name: 'Microsoft Corporation (MSFT)',
            security_type: 'equity',
            ticker_symbol: 'MSFT'
          }
        ]
      };
      
          console.log(
            'OpenAI Enhanced: Demo data loaded - accounts:',
            accounts.length,
            'transactions:',
            transactions.length,
            'investments:',
            investmentData ? 'available' : 'none'
          );
    } catch (error) {
      console.error('OpenAI Enhanced: Error loading demo data:', error);
    }
      } else if (userId) {
        console.log('OpenAI Enhanced: Fetching user-specific data for userId:', userId);
            try {
            const { FinancialDataService } = await import('./services/financial-data-service');
            const financialDataService = new FinancialDataService();
            
            console.log('OpenAI Enhanced: Fetching unified financial data from FinancialDataService');
          financialData = await financialDataService.getUserFinancialData(userId, {
              includeTransactions: true,
            includeInvestments: true,
            includeHomeValue: questionNeeds.needsHomeValue,
            collectCategorizationDetails: true,
            shouldPersistTransactions: true
          });

            categorizationDetails = financialData.categorizationDetails;
                    
          accounts = financialData.accounts.map((acc: any) => ({
              id: acc.id,
              name: acc.name,
              type: acc.type,
              subtype: acc.subtype,
              institution: acc.institution,
              institution_id: acc.institution_id,
              institution_logo: acc.institution_logo,
              institution_url: acc.institution_url,
                        balance: {
                available: acc.balance.available,
                current: acc.balance.current,
                limit: acc.balance.limit,
                iso_currency_code: acc.balance.iso_currency_code,
                unofficial_currency_code: acc.balance.unofficial_currency_code
                        }
            }));

          console.log(
            'OpenAI Enhanced: Sample banking transaction structure:',
            financialData.bankingTransactions[0]
              ? {
      id: financialData.bankingTransactions[0].id,
      name: financialData.bankingTransactions[0].name,
      amount: financialData.bankingTransactions[0].amount,
      category: financialData.bankingTransactions[0].category,
      category_id: financialData.bankingTransactions[0].category_id,
                  personal_finance_category: (financialData.bankingTransactions[0] as any).personal_finance_category,
      enriched_data: financialData.bankingTransactions[0].enriched_data,
      allKeys: Object.keys(financialData.bankingTransactions[0])
                }
              : 'No banking transactions'
          );

          const bankingTxs = financialData.bankingTransactions.map((tx: any) => ({
            ...tx,
      id: tx.id || tx.transaction_id,
      account_id: tx.account_id,
      amount: tx.amount,
      date: tx.date,
      name: tx.name,
      category: tx.category,
      category_id: tx.category_id,
            personal_finance_category: (tx as any).personal_finance_category,
            transaction_type: (tx as any).transaction_type,
      enriched_data: tx.enriched_data
    }));
            
            const investmentTxs = financialData.investments.transactions
            .filter((tx: any) => {
                const txType = (tx.type || '').toLowerCase();
                const txName = (tx.name || '').toLowerCase();
                const excludeTypes = ['buy', 'sell', 'transfer', 'deposit', 'withdrawal', 'cash', 'fee', 'adjustment', 'contribution'];
                if (excludeTypes.some(type => txType.includes(type) || txName.includes(type))) {
                return false;
                }
                return (
                  txType.includes('dividend') ||
                  txType.includes('interest') ||
                  txType.includes('income') ||
                  txType.includes('distribution') ||
                  txName.includes('dividend') ||
                  txName.includes('interest')
                );
              })
            .map((tx: any) => ({
              ...tx,
                id: tx.id,
                account_id: tx.account_id,
                amount: tx.amount,
                date: tx.date,
                name: tx.name,
                category: tx.category || ['Investment', 'Income'],
                pending: false,
                enriched_data: tx.enriched_data || {},
              transaction_type: (tx as any).transaction_type
            }));

          const socialSecurityTx = bankingTxs.find((t: any) => Math.abs(Math.abs(t.amount) - 3732) < 1);
          const ampLifeTx = bankingTxs.find((t: any) => Math.abs(Math.abs(t.amount) - 1117.99) < 1);
          const vanguardTx = bankingTxs.find((t: any) => Math.abs(Math.abs(t.amount) - 842.53) < 1);

          const all3732 = bankingTxs.filter((t: any) => Math.abs(Math.abs(t.amount) - 3732) < 1);
          const all1117 = bankingTxs.filter((t: any) => Math.abs(Math.abs(t.amount) - 1117.99) < 1);
          const all842 = bankingTxs.filter((t: any) => Math.abs(Math.abs(t.amount) - 842.53) < 1);

          console.log('OpenAI Enhanced: DEBUG - Looking for specific transactions:', {
              socialSecurityFound: !!socialSecurityTx,
              socialSecurityAmount: socialSecurityTx?.amount,
              socialSecurityDate: socialSecurityTx?.date,
              socialSecurityCategory: socialSecurityTx?.category,
              socialSecurityMatches: all3732.length,
            allSocialSecurityTxs: all3732.map((t: any) => ({ amount: t.amount, date: t.date, name: t.name, category: t.category })),
              ampLifeFound: !!ampLifeTx,
              ampLifeAmount: ampLifeTx?.amount,
              ampLifeDate: ampLifeTx?.date,
              ampLifeCategory: ampLifeTx?.category,
              ampLifeMatches: all1117.length,
            allAmpLifeTxs: all1117.map((t: any) => ({ amount: t.amount, date: t.date, name: t.name, category: t.category })),
              vanguardFound: !!vanguardTx,
              vanguardAmount: vanguardTx?.amount,
              vanguardDate: vanguardTx?.date,
              vanguardCategory: vanguardTx?.category,
              vanguardMatches: all842.length,
            allVanguardTxs: all842.map((t: any) => ({ amount: t.amount, date: t.date, name: t.name, category: t.category })),
              totalBankingTxs: bankingTxs.length
                    });
                    
            transactions = [...bankingTxs, ...investmentTxs];
          console.log(
            `OpenAI Enhanced: Merged transactions - Banking: ${bankingTxs.length}, Investment (income only): ${investmentTxs.length}, Total: ${transactions.length}`
          );
            
            if (investmentTxs.length > 0) {
            console.log(
              `OpenAI Enhanced: Investment income transactions:`,
              investmentTxs.slice(0, 5).map((tx: any) => `${tx.name}: $${tx.amount}`)
            );
            }
            if (financialData.investments.transactions.length - investmentTxs.length > 0) {
            console.log(
              `OpenAI Enhanced: Filtered out ${
                financialData.investments.transactions.length - investmentTxs.length
              } non-income investment transactions (buy/sell/transfer)`
            );
          }

            if (financialData.investments.holdings.length > 0) {
              investmentData = {
                portfolio: financialData.investments.portfolio,
                holdings: financialData.investments.holdings
              };
            }
            
            console.log('OpenAI Enhanced: Holdings already include both Plaid and SnapTrade (merged by FinancialDataService)');
            
          const snapTradeTransactions = financialData.investments.transactions.filter((tx: any) =>
              tx.account_id.toString().startsWith('snaptrade-')
            );
            
            if (snapTradeTransactions.length > 0) {
              snapTradeActivities = snapTradeTransactions;
              console.log('OpenAI Enhanced: Extracted SnapTrade activities:', snapTradeActivities.length, 'activities');
                        }
                        
            console.log('OpenAI Enhanced: Unified data fetched -', accounts.length, 'accounts,', transactions.length, 'transactions');
            console.log('OpenAI Enhanced: Investment data:', investmentData ? 'available' : 'none');
            console.log('OpenAI Enhanced: SnapTrade data:', snapTradeData ? 'available' : 'none');
            console.log('OpenAI Enhanced: SnapTrade activities:', snapTradeActivities ? 'available' : 'none');
            console.log('OpenAI Enhanced: Token health:', financialData.metadata.tokenHealth);
            console.log('OpenAI Enhanced: Data fetch duration:', financialData.metadata.performance.totalDuration, 'ms');
            console.log('OpenAI Enhanced: Partial data:', financialData.metadata.partialData);
          if (financialData.metadata?.dataSources) {
            console.log('OpenAI Enhanced: Data sources:', financialData.metadata.dataSources);
          }
          if (financialData.metadata?.persistedAsOf) {
            console.log('OpenAI Enhanced: Persisted transactions last synced at:', financialData.metadata.persistedAsOf);
          }
                  } catch (error) {
            console.error('OpenAI Enhanced: Error fetching unified financial data:', error);
        }
                    } else {
        console.log('OpenAI Enhanced: No userId provided, fetching all data (this should not happen for authenticated users)');
      }
                  } catch (error) {
      console.error('OpenAI Enhanced: Error fetching user data:', error);
    } finally {
      pipelineTracker.endStage(dataFetchStage, {
        accountCount: accounts.length,
        transactionCount: transactions.length,
        hasInvestments: Boolean(investmentData)
      });
                }

  // Analyze income patterns BEFORE anonymization
  let incomeAnalysis = '';
  const incomeStage = pipelineTracker.startStage('income_analysis');
  let incomeTransactionCount = 0;
  try {
  if (!isDemo && transactions.length > 0) {
    const incomeTransactions = transactions.filter(transaction => {
        const type = (transaction as any).transaction_type;
        const amount = Number(transaction.amount) || 0;
        return type === 'income' && amount > 0;
      });

      incomeTransactionCount = incomeTransactions.length;

      if (incomeTransactionCount > 0) {
        const monthlyTotals = new Map<string, number>();
        const sourceTotals = new Map<string, number>();
      
      for (const transaction of incomeTransactions) {
          const amount = Number(transaction.amount) || 0;
          const date = transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) || 0) + amount);

          const primaryCategory = (transaction as any).personal_finance_category?.primary;
          const enrichedCategory = transaction.enriched_data?.category?.[0];
          const basicCategory = Array.isArray(transaction.category) ? transaction.category[0] : transaction.category;
          const sourceLabel = (primaryCategory || enrichedCategory || basicCategory || 'Income').toString();
          sourceTotals.set(sourceLabel, (sourceTotals.get(sourceLabel) || 0) + amount);
        }

        const monthEntries = Array.from(monthlyTotals.entries()).sort(([a], [b]) => a.localeCompare(b));
        const totalIncome = monthEntries.reduce((sum, [, value]) => sum + value, 0);
        const averageMonthlyIncome = monthEntries.length > 0 ? totalIncome / monthEntries.length : 0;
        const topSources = Array.from(sourceTotals.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([label, value]) => `${label}: $${value.toFixed(2)}`)
          .join(', ');

        incomeAnalysis = [
          `- Average Monthly Income: $${averageMonthlyIncome.toFixed(2)}`,
          `- Total Income Transactions: ${incomeTransactionCount}`,
          `- Analysis Months: ${monthEntries.length}`,
          `- Top Income Sources: ${topSources || 'Not available'}`
        ].join('\n');
      }
    }
  } finally {
    pipelineTracker.endStage(incomeStage, {
      totalTransactions: transactions.length,
      incomeTransactions: incomeTransactionCount
    });
  }

  // Anonymize data before sending to OpenAI (skip for demo mode)
  // Note: accountSummary and transactionSummary will be created later from tierContext
  // This section just tokenizes the account/transaction names for anonymization
  const anonymizationStage = pipelineTracker.startStage('anonymization');
  try {
  if (!isDemo && userId) {
    // ✅ Use new anonymization service with session isolation to tokenize names
    
    // Replace the accounts and transactions with anonymized versions for AI processing
    accounts = accounts.map(account => {
      const tokenizedName = anonymizationService.tokenizeAccount(userId, account.name, account.institution);
      return {
        ...account,
        name: tokenizedName,
        plaidAccountId: `plaid_${account.id.slice(-8)}`
      };
    });
    
    transactions = transactions.map(transaction => {
      const tokenizedName = transaction.name ? anonymizationService.tokenizeMerchant(userId, transaction.name) : 'Unknown';
      const tokenizedMerchantName = transaction.merchantName ? anonymizationService.tokenizeMerchant(userId, transaction.merchantName) : undefined;
      
      // ✅ Also anonymize enriched_data fields (merchant_name, brand_name, website, etc.)
      let anonymizedEnrichedData = undefined;
      if (transaction.enriched_data) {
        anonymizedEnrichedData = {
          ...transaction.enriched_data,
          merchant_name: transaction.enriched_data.merchant_name 
            ? anonymizationService.tokenizeMerchant(userId, transaction.enriched_data.merchant_name)
            : undefined,
          brand_name: transaction.enriched_data.brand_name
            ? anonymizationService.tokenizeMerchant(userId, transaction.enriched_data.brand_name)
            : undefined,
          website: transaction.enriched_data.website
            ? `website_${transaction.enriched_data.website.split('.').slice(-2).join('_')}`
            : undefined,
        };
      }
      
      return {
        ...transaction,
        name: tokenizedName,
        merchantName: tokenizedMerchantName,
        enriched_data: anonymizedEnrichedData
      };
      });
    }
  } finally {
    pipelineTracker.endStage(anonymizationStage, {
      anonymizedAccounts: !isDemo && userId ? accounts.length : 0,
      anonymizedTransactions: !isDemo && userId ? transactions.length : 0
    });
  }

  // ✅ OPTIMIZATION: Conditionally fetch market context only if needed (parallel with other operations)
  console.log('OpenAI Enhanced: Getting market news context for tier:', tier);
  let marketContextSummary = '';
  const marketContextStage = pipelineTracker.startStage('market_context');
  try {
  // Only fetch market context if question suggests it's needed
  if (questionNeeds.needsMarketContext) {
    try {
      const { MarketNewsManager } = await import('./market-news/manager');
      const marketNewsManager = new MarketNewsManager();
      marketContextSummary = await marketNewsManager.getMarketContext(tier);
      console.log('OpenAI Enhanced: Market news context length:', marketContextSummary.length);
      console.log('OpenAI Enhanced: Market news context preview:', marketContextSummary.substring(0, 200));
    } catch (error) {
      console.error('OpenAI Enhanced: Error getting market news context:', error);
      // Fallback to data orchestrator if market news manager fails
      try {
        marketContextSummary = await dataOrchestrator.getMarketContextSummary(tier, isDemo);
        console.log('OpenAI Enhanced: Fallback to data orchestrator market context length:', marketContextSummary.length);
        console.log('OpenAI Enhanced: Fallback market context preview:', marketContextSummary.substring(0, 200));
      } catch (fallbackError) {
        console.error('OpenAI Enhanced: Fallback market context also failed:', fallbackError);
        marketContextSummary = '';
      }
    }
  } else {
    console.log('OpenAI Enhanced: Skipping market context (not needed for this question)');
    }
  } finally {
    pipelineTracker.endStage(marketContextStage, {
      hasContext: marketContextSummary.length > 0
    });
  }

  // Get search context for real-time financial information
  let searchContext: string | undefined;
  const searchStage = pipelineTracker.startStage('search_context');
  try {
  if (tier === UserTier.STANDARD || tier === UserTier.PREMIUM) {
    try {
      // Enhance search query for better results
      let enhancedQuery = question;
      
      // Detect financial institutions and enhance search queries
      const financialInstitutions = [
        // Major Banks
        'wells fargo', 'chase', 'bank of america', 'citibank', 'us bank', 'pnc', 'capital one',
        'goldman sachs', 'morgan stanley', 'jpmorgan',
        
        // Regional Banks
        'bb&t', 'suntrust', 'regions bank', 'keybank', 'fifth third', 'huntington',
        'comerica', 'citizens bank', 'm&t bank', 'bmo harris',
        
        // Credit Unions
        'navy federal', 'penfed', 'alliant', 'state employees',
        
        // Fintech & Digital Banks
        'ally bank', 'marcus', 'sofi', 'chime', 'current', 'varo', 'upstart',
        'fidelity', 'vanguard', 'schwab', 'td ameritrade', 'robinhood',
        'betterment', 'wealthfront', 'acorns', 'stash'
      ];
      
      const rateRelatedTerms = [
        'mortgage rate', 'refinance', 'interest rate', 'apr', 'cd rate', 'savings rate',
        'credit card rate', 'loan rate', 'investment return', 'yield', 'unemployment rate',
        'inflation rate', 'fed rate', 'federal reserve rate', 'treasury rate'
      ];
      
      // Check if question mentions a specific financial institution
      const mentionedInstitution = financialInstitutions.find(institution => 
        question.toLowerCase().includes(institution)
      );
      
      // Check if question is about rates/returns
      const isRateQuestion = rateRelatedTerms.some(term => 
        question.toLowerCase().includes(term)
      );
      
      if (mentionedInstitution && isRateQuestion) {
        // Specific institution + rate question
        enhancedQuery = `${mentionedInstitution} current rates today 2025 ${question.split(' ').slice(-3).join(' ')}`;
      } else if (mentionedInstitution) {
        // Specific institution question
        enhancedQuery = `${mentionedInstitution} ${question} current information 2025`;
      } else if (isRateQuestion) {
        // General rate question
        enhancedQuery = `${question} current rates today 2025`;
      } else if (question.toLowerCase().includes('investment') || question.toLowerCase().includes('stock') || question.toLowerCase().includes('market')) {
        // Investment/market question
        enhancedQuery = `${question} current market data 2025`;
      } else if (question.toLowerCase().includes('savings') || question.toLowerCase().includes('budget') || question.toLowerCase().includes('spending')) {
        // Personal finance question
        enhancedQuery = `${question} financial advice current 2025`;
      }
      
      console.log('OpenAI Enhanced: Getting search context for question:', question);
      console.log('OpenAI Enhanced: Enhanced search query:', enhancedQuery);
      const searchResults = await dataOrchestrator.getSearchContext(enhancedQuery, tier, isDemo);
      
      if (searchResults && searchResults.results.length > 0) {
        searchContext = searchResults.summary;
        console.log('OpenAI Enhanced: Search context found with', searchResults.results.length, 'results');
      } else {
        console.log('OpenAI Enhanced: No search context found for question');
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Error getting search context:', error);
    }
  } else if (!questionNeeds.needsSearchContext) {
    console.log('OpenAI Enhanced: Skipping search context (not needed for this question)');
    }
  } finally {
    pipelineTracker.endStage(searchStage, {
      hasSearchContext: Boolean(searchContext)
    });
  }

  // Apply intelligent transaction filtering for better AI focus
  const filterStage = pipelineTracker.startStage('transaction_filter', {
    transactionCount: transactions.length
  });
  const filteredTransactions = filterTransactionsForAI(transactions);
  pipelineTracker.endStage(filterStage, {
    filteredCount: filteredTransactions.length
  });
  
  // Build tier-aware context using the new orchestrator
  console.log('OpenAI Enhanced: Building tier-aware context for tier:', tier);
  const contextStage = pipelineTracker.startStage('context_build', {
    accountCount: accounts.length,
    filteredTransactionCount: filteredTransactions.length
  });
  const tierContext = await dataOrchestrator.buildTierAwareContext(tier, accounts, filteredTransactions, isDemo);
  pipelineTracker.endStage(contextStage, {
    contextAccounts: tierContext.accounts.length,
    contextTransactions: tierContext.transactions.length
  });
  
  console.log('OpenAI Enhanced: Tier context built:', {
    tier: tierContext.tierInfo.currentTier,
    availableSources: tierContext.tierInfo.availableSources.length,
    unavailableSources: tierContext.tierInfo.unavailableSources.length,
    upgradeHints: tierContext.upgradeHints.length
  });

  const promptStage = pipelineTracker.startStage('prompt_build');

  // Create account summary
  const accountSummary = tierContext.accounts.map(account => {
    let balance;
    if (isDemo) {
      balance = account.balance;
    } else if (account.balance && account.balance.available !== undefined && account.balance.available !== null) {
      // ✅ FIX: For checking/savings accounts, use available balance (spendable amount)
      // For investment accounts, use current balance (total portfolio value)
      if (account.type === 'depository' || account.type === 'checking' || account.type === 'savings') {
        balance = account.balance.available; // Use available for checking/savings
      } else {
        balance = account.balance.current; // Use current for investments/loans/credit
      }
    } else if (account.balance && account.balance.current) {
      // Fallback to current balance for other account types
      balance = account.balance.current;
    } else if (account.availableBalance) {
      // Database structure - prioritize available balance for checking/savings
      if (account.type === 'depository' || account.type === 'checking' || account.type === 'savings') {
        balance = account.availableBalance;
      } else {
        balance = account.currentBalance;
      }
    } else if (account.currentBalance) {
      // Database structure - fallback to current balance
      balance = account.currentBalance;
    } else {
      balance = 0;
    }
    
    const subtype = isDemo ? account.type : (account.subtype || account.type);
    let summary = `- ${account.name} (${account.type}/${subtype}): $${balance?.toFixed(2) || '0.00'}`;
    
    // Add institution information if available (account.institution is already anonymized if anonymization ran)
    if (!isDemo && account.institution && userId) {
      // Use the anonymization service to tokenize the institution if not already tokenized
      // Note: account.institution should already be tokenized from line 900, but check if it's still a real name
      const institutionToken = anonymizationService.tokenizeInstitution(userId, String(account.institution));
      summary += ` at ${institutionToken}`;
    }
    
    // Add interest rate for loans in demo mode
    if (isDemo && account.type === 'loan' && (account as any).interestRate) {
      summary += ` (Rate: ${(account as any).interestRate}%)`;
    }
    
    // Add interest rate for credit cards in demo mode
    if (isDemo && account.type === 'credit' && (account as any).interestRate) {
      summary += ` (APR: ${(account as any).interestRate}%)`;
    }
    
    // Add interest rate for savings/CDs in demo mode
    if (isDemo && (account.type === 'savings') && (account as any).interestRate) {
      summary += ` (Rate: ${(account as any).interestRate}%)`;
    }
    
    return summary;
  }).join('\n');

  // Create transaction summary
  // ✅ DEBUG: Log transaction data structure before building summary
  console.log('OpenAI Enhanced: DEBUG - Sample transaction data before building summary:', {
    totalTransactions: tierContext.transactions.length,
    firstTransaction: tierContext.transactions[0] ? {
      id: tierContext.transactions[0].id,
      name: tierContext.transactions[0].name,
      category: tierContext.transactions[0].category,
      categoryType: typeof tierContext.transactions[0].category,
      isArray: Array.isArray(tierContext.transactions[0].category),
      enriched_data: tierContext.transactions[0].enriched_data ? {
        category: tierContext.transactions[0].enriched_data.category,
        categoryType: typeof tierContext.transactions[0].enriched_data.category,
        isArray: Array.isArray(tierContext.transactions[0].enriched_data.category)
      } : 'No enriched data'
    } : 'No transactions'
  });
  
  // ✅ DEBUG: Log category data BEFORE building summary
  console.log('OpenAI Enhanced: DEBUG - Sample transaction category data:', {
    sampleCount: Math.min(3, tierContext.transactions.length),
    samples: tierContext.transactions.slice(0, 3).map((t: any) => ({
      name: t.name,
      category: t.category,
      categoryType: typeof t.category,
      categoryIsArray: Array.isArray(t.category),
      enriched_data_category: t.enriched_data?.category,
      enriched_category_type: typeof t.enriched_data?.category,
      enriched_category_isArray: Array.isArray(t.enriched_data?.category)
    }))
  });
  
  const maxPromptTransactions = parseInt(process.env.MAX_PROMPT_TRANSACTIONS || '75', 10);
  const displayTransactions = tierContext.transactions.slice(0, maxPromptTransactions);

  console.log('OpenAI Enhanced: Transaction prompt limits:', {
    totalTransactions: tierContext.transactions.length,
    usingTransactions: displayTransactions.length,
    maxConfigured: maxPromptTransactions
  });
  
  // ✅ Use already-anonymized transaction fields (transactions were anonymized at lines 908-936)
  // The anonymization service has already tokenized name, merchantName, and enriched_data.merchant_name
  // We just need to use those already-anonymized fields directly
  let transactionSummary = displayTransactions.map(transaction => {
    // ✅ CRITICAL: Use transaction_type (from aiCategory) as the authoritative category
    const transactionType = (transaction as any).transaction_type || (transaction as any).aiCategory;
    
    // ✅ Use already-anonymized name field (guaranteed to be anonymized if anonymization ran)
    // transaction.name was tokenized at line 909, so use it directly
    const merchantName = isDemo ? (transaction.description || transaction.name) : transaction.name;
    
    // ✅ Use transaction_type for the category display (this is what GPT should use)
    let category = 'Unknown';
    if (transactionType) {
      category = transactionType.toUpperCase();
    } else {
      // Fallback to Plaid category only if no transaction_type
      if (transaction.category) {
        if (Array.isArray(transaction.category)) {
          const validBasicCategory = transaction.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
          if (validBasicCategory) {
            category = validBasicCategory;
          }
        } else if (typeof transaction.category === 'string' && transaction.category.trim() !== '') {
          category = transaction.category;
        }
      }
      
      // Fallback to enriched category if no basic category
      if (category === 'Unknown' && transaction.enriched_data?.category && Array.isArray(transaction.enriched_data.category)) {
        const validEnrichedCategory = transaction.enriched_data.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
        if (validEnrichedCategory) {
          category = validEnrichedCategory;
        }
      }
    }
    
    // ✅ Amount normalization for GPT context:
    // For GPT, expenses should be negative (money spent) regardless of account type
    // This provides a unified view where expenses = negative, income = positive
    let amount = transaction.amount || 0;
    if (transactionType) {
      const typeLower = String(transactionType).toLowerCase();
      // For expenses, ensure negative sign for GPT context (money spent)
      if (typeLower === 'expense' && amount > 0) {
        amount = -Math.abs(amount);
      }
      // For fees, also treat as negative (money spent)
      if (typeLower === 'fee' && amount > 0) {
        amount = -Math.abs(amount);
      }
      // For income, ensure positive sign (money earned)
      if (typeLower === 'income' && amount < 0) {
        amount = Math.abs(amount);
      }
    }
    
    // ✅ Include transaction_type if available (from categorization service)
    // Only show it once - transaction_type is the authoritative category
    const typeInfo = transactionType ? ` (${transactionType.toUpperCase()})` : (category !== 'Unknown' ? ` (${category})` : '');
    
    // ✅ Include enhanced information when available (already anonymized if anonymization ran)
    let enhancedInfo = '';
    if (transaction.enriched_data) {
      if (transaction.enriched_data.website) {
        enhancedInfo += ` [Website: ${transaction.enriched_data.website}]`;
      }
      // enriched_data.brand_name was already anonymized at line 921 if anonymization ran
      if (transaction.enriched_data.brand_name && transaction.enriched_data.brand_name !== merchantName) {
        enhancedInfo += ` [Brand: ${transaction.enriched_data.brand_name}]`;
      }
    }
    
    // ✅ Show Plaid categories for reference (only if different from transaction_type)
    const categoryParts: string[] = [];
    if (transactionType) {
      categoryParts.push(`${transactionType.toUpperCase()} (from aiCategory)`);
    }
    if (transaction.category && Array.isArray(transaction.category) && transaction.category.length > 0) {
      const validCategories = transaction.category.filter((cat: any) => cat && cat.trim() !== '' && cat !== '0');
      if (validCategories.length > 0) {
        categoryParts.push(...validCategories);
      }
    }
    if (categoryParts.length > 0) {
      enhancedInfo += ` [Categories: ${categoryParts.join(', ')}]`;
    }
    
    // ✅ Add explicit warning for transfers to prevent GPT from counting them as income
    const transferWarning = transactionType && ['transfer_in', 'transfer_out', 'deposit', 'withdrawal'].includes(transactionType.toLowerCase()) 
      ? ' [NOT INCOME - MONEY MOVEMENT]' 
      : '';
    
    const dateStr = transaction.date instanceof Date 
      ? transaction.date.toISOString().slice(0, 10)
      : (transaction.date || '').substring(0, 10);
    
    return `- ${merchantName}${typeInfo}: $${amount.toFixed(2)} on ${dateStr}${transferWarning}${enhancedInfo}`;
  }).join('\n');

  const overflowSummary = groupSmallTransactions(tierContext.transactions, displayTransactions);
  if (overflowSummary) {
    transactionSummary += overflowSummary;
  }

  const pickCategoryLabel = (transaction: any): string | undefined => {
    if (transaction.enriched_data?.category && Array.isArray(transaction.enriched_data.category)) {
      const enrichedLabel = transaction.enriched_data.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
      if (enrichedLabel) {
        return enrichedLabel;
      }
    }
    if (Array.isArray(transaction.category)) {
      const basicLabel = transaction.category.find((cat: any) => cat && cat.trim() !== '' && cat !== '0');
      if (basicLabel) {
        return basicLabel;
      }
    } else if (typeof transaction.category === 'string' && transaction.category.trim() !== '' && transaction.category !== '0') {
      return transaction.category;
    }
    return undefined;
  };

  const aggregatedFromMetadata = financialData?.metadata?.transactionAggregates;
  const expenseTotals = new Map<string, number>();
  const incomeTotals = new Map<string, number>();
  if (!aggregatedFromMetadata?.expense?.length || !aggregatedFromMetadata?.income?.length) {
    tierContext.transactions.forEach(transaction => {
      const transactionTypeRaw = (transaction as any).transaction_type || (transaction as any).aiCategory;
      if (!transactionTypeRaw) {
        return;
      }
      const normalizedType = String(transactionTypeRaw).toLowerCase();
      const amount = Math.abs(Number(transaction.amount) || 0);
      if (amount === 0) {
        return;
      }
      if (normalizedType === 'expense' || normalizedType === 'fee') {
        const label = (pickCategoryLabel(transaction) || normalizedType).toLowerCase();
        expenseTotals.set(label, (expenseTotals.get(label) || 0) + amount);
      } else if (normalizedType === 'income') {
        const label = (pickCategoryLabel(transaction) || normalizedType).toLowerCase();
        incomeTotals.set(label, (incomeTotals.get(label) || 0) + amount);
      }
    });
  }

  const resolveTopEntries = (entries: Array<[string, number]>): Array<[string, number]> =>
    entries
      .slice()
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

  const aggregatedExpenseEntries = aggregatedFromMetadata?.expense as Array<[string, number]> | undefined;
  const aggregatedIncomeEntries = aggregatedFromMetadata?.income as Array<[string, number]> | undefined;
  const fallbackExpenseEntries = Array.from(expenseTotals.entries());
  const fallbackIncomeEntries = Array.from(incomeTotals.entries());

  const categorySummaryParts: string[] = [];

  const topExpenseEntries = resolveTopEntries(
    aggregatedExpenseEntries && aggregatedExpenseEntries.length > 0
      ? aggregatedExpenseEntries
      : fallbackExpenseEntries
  );
  if (topExpenseEntries.length > 0) {
    categorySummaryParts.push('TOP EXPENSE TYPES (excludes transfers):');
    topExpenseEntries.forEach(([type, total]) => {
      categorySummaryParts.push(`• ${type.toUpperCase()}: $${total.toFixed(2)}`);
    });
  }

  const topIncomeEntries = resolveTopEntries(
    aggregatedIncomeEntries && aggregatedIncomeEntries.length > 0
      ? aggregatedIncomeEntries
      : fallbackIncomeEntries
  );
  if (topIncomeEntries.length > 0) {
    categorySummaryParts.push('TOP INCOME TYPES:');
    topIncomeEntries.forEach(([type, total]) => {
      categorySummaryParts.push(`• ${type.toUpperCase()}: $${total.toFixed(2)}`);
    });
  }

  if (categorySummaryParts.length > 0) {
    transactionSummary = `${categorySummaryParts.join('\n')}\n${transactionSummary}`;
  }

  // ✅ DEBUG: Log the final transaction summary to see what the AI receives
  console.log('OpenAI Enhanced: DEBUG - Final transaction summary preview:', {
    totalLength: transactionSummary.length,
    preview: transactionSummary.substring(0, 500),
    firstFewLines: transactionSummary.split('\n').slice(0, 3),
    overflowAppended: Boolean(overflowSummary)
  });

  // Create investment summary
  let investmentSummary = '';
  
  // Combine Plaid and SnapTrade data for unified portfolio composition
  let combinedPortfolioValue = 0;
  let combinedHoldings = [];
  let combinedAssetAllocation = new Map();
  
  // Add Plaid investment data
  if (investmentData) {
    const { portfolio, holdings } = investmentData;
    combinedPortfolioValue += portfolio.totalValue;
    combinedHoldings.push(...holdings);
    
    // Add Plaid asset allocation
    portfolio.assetAllocation.forEach((allocation: any) => {
      const currentValue = combinedAssetAllocation.get(allocation.type) || 0;
      combinedAssetAllocation.set(allocation.type, currentValue + allocation.value);
    });
    
    console.log('🔍 Plaid investment data: portfolio value =', portfolio.totalValue, ', holdings =', holdings.length);
  } else {
    console.log('🔍 No Plaid investment holdings data available (likely 400 error - tokens without Investments product)');
  }
  
  // Add Plaid investment accounts if holdings data wasn't available
  // If investmentData is null, it means Plaid's investmentsHoldingsGet failed (likely 400 error)
  // In this case, we should add investment account balances from the basic accounts API
  console.log('🔍 Checking if we need to add Plaid investment account balances...');
  console.log('🔍 investmentData is null?', investmentData === null);
  console.log('🔍 Total accounts in tierContext:', tierContext.accounts.length);
  
  let plaidInvestmentAccountsWithoutHoldings: any[] = [];
  
  // Only add Plaid investment accounts if we DON'T have detailed holdings data
  if (!investmentData) {
    console.log('🔍 No Plaid investment holdings data - will use account balances instead');
    console.log('🔍 Investment accounts in tierContext:', tierContext.accounts.filter((a: any) => a.type === 'investment').length);
    
    // Debug: Show a few sample investment accounts
    const sampleInvestmentAccounts = tierContext.accounts.filter((a: any) => a.type === 'investment').slice(0, 3);
    console.log('🔍 Sample investment accounts:', sampleInvestmentAccounts.map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      balance: a.balance?.current,
      isSnapTrade: a.id?.toString().startsWith('snaptrade-')
    })));
    
    // Get all Plaid investment accounts (exclude SnapTrade which is already handled)
    plaidInvestmentAccountsWithoutHoldings = tierContext.accounts.filter((account: any) => {
      const isInvestmentAccount = account.type === 'investment';
      const hasBalance = account.balance?.current && account.balance.current > 0;
      const isNotSnapTrade = !account.id?.toString().startsWith('snaptrade-');
      
      return isInvestmentAccount && hasBalance && isNotSnapTrade;
    });
    
    console.log('🔍 Found', plaidInvestmentAccountsWithoutHoldings.length, 'Plaid investment accounts to add');
    console.log('🔍 These accounts are:', plaidInvestmentAccountsWithoutHoldings.map((a: any) => ({ name: a.name, balance: a.balance?.current })));
  } else {
    console.log('🔍 Plaid investment holdings data available - skipping account-level balances');
  }
  
  if (plaidInvestmentAccountsWithoutHoldings.length > 0) {
    plaidInvestmentAccountsWithoutHoldings.forEach((account: any, index: number) => {
      const accountValue = account.balance?.current || 0;
      combinedPortfolioValue += accountValue;
      
      console.log(`🔍 [${index}] Adding Plaid investment account:`, account.name, 
        '| type:', account.type, '/', account.subtype,
        '| balance:', accountValue,
        '| institution:', account.institution,
        '| running total:', combinedPortfolioValue);
      
      // Create a synthetic holding for this account
      const syntheticHolding = {
        security_name: `${account.name} (${account.institution || 'Investment'})`,
        ticker_symbol: account.subtype?.toUpperCase() || 'INVESTMENT',
        security_type: account.subtype || 'Investment Account',
        quantity: 1,
        institution_price: accountValue,
        institution_value: accountValue,
        account_id: account.id
      };
      combinedHoldings.push(syntheticHolding);
      
      // Categorize by subtype
      let assetType = 'Other Investments';
      if (account.subtype) {
        const subtype = account.subtype.toLowerCase();
        if (subtype.includes('401k') || subtype.includes('403b') || subtype.includes('pension')) {
          assetType = 'Retirement (401k/403b/Pension)';
        } else if (subtype.includes('ira') || subtype.includes('roth')) {
          assetType = 'Retirement (IRA/Roth)';
        } else if (subtype.includes('brokerage')) {
          assetType = 'Brokerage Account';
        } else if (subtype.includes('529')) {
          assetType = 'Education (529)';
        }
      }
      
      const currentValue = combinedAssetAllocation.get(assetType) || 0;
      combinedAssetAllocation.set(assetType, currentValue + accountValue);
      console.log('🔍 Categorized as', assetType, ':', accountValue, 'Total now:', currentValue + accountValue);
    });
  }
  
  // ✅ NO NEED to process SnapTrade data separately - holdings already merged by FinancialDataService
  // The combinedHoldings and combinedPortfolioValue already include both Plaid and SnapTrade data
  console.log('🔍 Using unified holdings data (already includes both Plaid and SnapTrade)');
    console.log('🔍 Final combined portfolio value:', combinedPortfolioValue);
    console.log('🔍 Final asset allocation:', Array.from(combinedAssetAllocation.entries()));
    console.log('🔍 Total combined holdings:', combinedHoldings.length);
  
  // Create unified portfolio summary
  if (combinedPortfolioValue > 0) {
    const assetAllocationArray = Array.from(combinedAssetAllocation.entries()).map(([type, value]) => ({
      type,
      value,
      percentage: (value / combinedPortfolioValue) * 100
    }));
    
    // Calculate unique securities count
    const uniqueSecurityIds = new Set(combinedHoldings.map((h: any) => h.security_id));
    
    investmentSummary += `Portfolio Overview:
- Total Value: $${combinedPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Number of Holdings: ${combinedHoldings.length}
- Number of Securities: ${uniqueSecurityIds.size}

Portfolio Composition:
${assetAllocationArray.map((allocation: any) => 
  `- ${allocation.type}: $${allocation.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${allocation.percentage.toFixed(1)}%)`
).join('\n')}

Top Holdings (Top 15):
${userId ? anonymizationService.anonymizeInvestmentData(userId, combinedHoldings.slice(0, 15)) : combinedHoldings.slice(0, 15).map((h: any) => `- ${h.security_name}: $${h.institution_value || 0}`).join('\n')}`;
  
    // Group remaining holdings by asset type
    if (combinedHoldings.length > 15) {
      const remaining = combinedHoldings.slice(15);
      const groupedByType = new Map<string, { count: number; value: number }>();
      
      remaining.forEach((holding: any) => {
        const type = holding.security_type || 'Other';
        const current = groupedByType.get(type) || { count: 0, value: 0 };
        groupedByType.set(type, {
          count: current.count + 1,
          value: current.value + (holding.institution_value || 0)
        });
      });
      
      investmentSummary += '\n\nAdditional Holdings:';
      groupedByType.forEach((data, type) => {
        investmentSummary += `\n- ${data.count} ${type} holdings: $${data.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      });
    }
  }

  // Add SnapTrade activities if available
  if (snapTradeActivities && snapTradeActivities.length > 0) {
    if (investmentSummary) {
      investmentSummary += '\n\n';
    } else {
      investmentSummary = 'INVESTMENT DATA:\n';
    }
    const snapTradeActivitiesSummary = anonymizeSnapTradeData([], snapTradeActivities);
    investmentSummary += snapTradeActivitiesSummary;
    console.log('OpenAI Enhanced: SnapTrade activities added to investment data:', snapTradeActivitiesSummary.substring(0, 200));
  }

  console.log('OpenAI Enhanced: Account summary for AI:', accountSummary);
  console.log('OpenAI Enhanced: Transaction summary for AI:', transactionSummary);
  console.log('OpenAI Enhanced: Investment summary for AI:', investmentSummary ? 'available' : 'none');
  console.log('OpenAI Enhanced: Investment summary length:', investmentSummary ? investmentSummary.length : 0);
  console.log('OpenAI Enhanced: Number of accounts found:', tierContext.accounts.length);
  console.log('OpenAI Enhanced: Number of transactions found:', tierContext.transactions.length);
  console.log('OpenAI Enhanced: Investment data available:', investmentData ? 'yes' : 'no');
  console.log('OpenAI Enhanced: SnapTrade data available:', snapTradeData ? 'yes' : 'no');
  console.log('OpenAI Enhanced: SnapTrade activities available:', snapTradeActivities ? 'yes' : 'no');
  console.log('OpenAI Enhanced: User ID being used:', userId);
  
  // ✅ Debug: Log enhanced transaction data availability
  const enhancedTransactionsCount = tierContext.transactions.filter((t: any) => t.enriched_data).length;
  const totalTransactionsCount = tierContext.transactions.length;
  console.log(`OpenAI Enhanced: Enhanced data available for ${enhancedTransactionsCount}/${totalTransactionsCount} transactions`);
  
  if (enhancedTransactionsCount > 0) {
    console.log('OpenAI Enhanced: Sample enhanced transaction data:', {
      first: tierContext.transactions.find((t: any) => t.enriched_data)?.enriched_data,
      count: enhancedTransactionsCount
    });
  }

  // Get conversation history
  console.log('OpenAI Enhanced: Conversation history length:', conversationHistory.length);
  if (conversationHistory.length > 0) {
    console.log('OpenAI Enhanced: Recent conversation questions:', conversationHistory.slice(0, 3).map(c => c.question));
  }

  // For demo mode, use demo data
  if (isDemo) {
    console.log('OpenAI Enhanced: Demo accounts:', tierContext.accounts.length);
    console.log('OpenAI Enhanced: Demo transactions:', tierContext.transactions.length);
    console.log('OpenAI Enhanced: Demo investments:', investmentData ? 'available' : 'none');
    console.log('OpenAI Enhanced: Demo SnapTrade data:', snapTradeData ? 'available' : 'none');
    console.log('OpenAI Enhanced: Demo SnapTrade activities:', snapTradeActivities ? 'available' : 'none');
    console.log('OpenAI Enhanced: Account summary preview:', accountSummary.substring(0, 500));
    console.log('OpenAI Enhanced: Transaction summary preview:', transactionSummary.substring(0, 500));
    console.log('OpenAI Enhanced: Investment summary preview:', investmentSummary ? investmentSummary.substring(0, 500) : 'none');
    console.log('OpenAI Enhanced: Full account summary:', accountSummary);
    console.log('OpenAI Enhanced: Full transaction summary:', transactionSummary);
    console.log('OpenAI Enhanced: Full investment summary:', investmentSummary);
  }

  // Get user profile if available
  let userProfile: string = '';
  if (isDemo && demoProfile) {
    // Use provided demo profile (already anonymized)
    userProfile = demoProfile;
    console.log('OpenAI Enhanced: Using provided demo profile, length:', userProfile.length);
  } else if (userId && !isDemo) {
    try {
      const { ProfileManager } = await import('./profile/manager');
      // ✅ Pass the same AnonymizationService instance to ProfileManager for unified token management
      const profileManager = new ProfileManager(userId, anonymizationService);
      
      // ✅ CRITICAL FIX: Get ORIGINAL (non-anonymized) profile first for enhancement
      // We need the real profile to enhance it with real Plaid data
      let originalProfile = await profileManager.getOriginalProfile(userId);
      
      // Enhance profile with Plaid data if available (using ORIGINAL profile, not anonymized)
      if (accounts.length > 0 || transactions.length > 0) {
        try {
          const { PlaidProfileEnhancer } = await import('./profile/plaid-enhancer');
          const plaidEnhancer = new PlaidProfileEnhancer();
          const enhancedProfile = await plaidEnhancer.enhanceProfileFromPlaidData(
            userId,
            accounts,
            transactions,
            originalProfile
          );
          
          if (enhancedProfile !== originalProfile) {
            // Update the persistent profile with enhanced REAL data (not anonymized)
            try {
              const { ProfileManager } = await import('./profile/manager');
              // ProfileManager for update doesn't need AnonymizationService (not anonymizing)
              const profileManager = new ProfileManager();
              
              // ✅ CRITICAL: Preserve structured home data when enhancing profile
              // The AI-enhanced profile might not include the structured HOME_* fields
              const existingHomeData = profileManager.extractHomeData(originalProfile);
              const enhancedHomeData = profileManager.extractHomeData(enhancedProfile);
              
              let finalProfile = enhancedProfile;
              
              // If we have home data in the original profile but not in the enhanced profile, preserve it
              if (existingHomeData.address && !enhancedHomeData.address) {
                console.log('💾 Preserving structured home data during Plaid profile enhancement');
                
                // Remove any existing home data markers from enhanced profile (shouldn't be any, but just in case)
                finalProfile = finalProfile.replace(
                  /HOME_ADDRESS:.*?\n|HOME_VALUE:.*?\n|HOME_VALUE_LOW:.*?\n|HOME_VALUE_HIGH:.*?\n|HOME_VALUE_LAST_UPDATED:.*?\n/g,
                  ''
                ).trim();
                
                // Re-add the structured home data (only if we have all required fields)
                if (existingHomeData.address && existingHomeData.value !== null) {
                  const homeDataSection = `

HOME_ADDRESS: ${existingHomeData.address}
HOME_VALUE: ${existingHomeData.value}
HOME_VALUE_LOW: ${existingHomeData.valueLow ?? existingHomeData.value}
HOME_VALUE_HIGH: ${existingHomeData.valueHigh ?? existingHomeData.value}
HOME_VALUE_LAST_UPDATED: ${existingHomeData.lastUpdated?.toISOString() || new Date().toISOString()}`;
                  
                  finalProfile = finalProfile + homeDataSection;
                }
              }
              
              await profileManager.updateProfile(userId, finalProfile);
              console.log('OpenAI Enhanced: Persistent profile updated with Plaid insights (real data)');
              // Update local variable to use the enhanced profile
              originalProfile = finalProfile;
            } catch (profileUpdateError) {
              console.error('OpenAI Enhanced: Failed to update persistent profile with Plaid insights:', profileUpdateError);
              // Don't fail the main request if profile update fails
            }
          }
        } catch (error) {
          console.error('OpenAI Enhanced: Failed to enhance profile with Plaid data:', error);
          // Don't fail the main request if Plaid enhancement fails
        }
      }
      
      // ✅ NOW anonymize the profile for GPT use (after enhancement with real data)
      // This ensures the profile stored in DB is always real, and anonymization only happens for GPT
      // Use getAnonymizedProfile which will retrieve the updated profile and anonymize it using the shared AnonymizationService
      userProfile = await profileManager.getAnonymizedProfile(userId);
      console.log('OpenAI Enhanced: User profile retrieved, enhanced, and anonymized for GPT, length:', userProfile.length);
      
      // ✅ NEW: Fetch liabilities data for credit accounts
      const liabilitiesData = '';
      try {
        const accessTokens = await prisma.accessToken.findMany({
          where: { userId }
        });
        
        if (accessTokens.length > 0) {
          // Use the first token to get liabilities
          const token = accessTokens[0].token;
          const liabilitiesResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/plaid/liabilities`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (liabilitiesResponse.ok) {
            const liabilitiesData = await liabilitiesResponse.json();
            console.log('OpenAI Enhanced: Fetched liabilities data:', liabilitiesData);
            
            // Add liabilities context to user profile
            if (liabilitiesData.liabilities && liabilitiesData.liabilities.length > 0) {
              // Extract all liability accounts for anonymization
              const allLiabilityAccounts: any[] = [];
              liabilitiesData.liabilities.forEach((liability: any) => {
                if (liability.accounts && liability.accounts.length > 0) {
                  allLiabilityAccounts.push(...liability.accounts);
                }
              });
              
              if (allLiabilityAccounts.length > 0) {
                // Anonymize liability data before adding to profile - simplified in this code path
                const anonymizedLiabilities = allLiabilityAccounts.map((l: any) => `- Liability_${l.id?.slice(-4) || 'XXXX'}: $${l.balance || 0}`).join('\n');
                userProfile += `\n\nLIABILITIES INFORMATION:\n${anonymizedLiabilities}`;
                console.log('OpenAI Enhanced: Added anonymized liabilities context to profile');
              }
            }
          } else {
            // ✅ FIXED: Handle API failures gracefully
            console.log('OpenAI Enhanced: Liabilities API failed, status:', liabilitiesResponse.status);
            userProfile += `\n\nLIABILITIES INFORMATION:\nCredit limit information not available - your bank does not provide this data through Plaid.`;
            console.log('OpenAI Enhanced: Added fallback message for unavailable liabilities data');
          }
        }
      } catch (liabilitiesError) {
        console.error('OpenAI Enhanced: Error fetching liabilities:', liabilitiesError);
        // ✅ FIXED: Add fallback message when liabilities fetch fails
        userProfile += `\n\nLIABILITIES INFORMATION:\nCredit limit information not available - unable to fetch from your bank.`;
        console.log('OpenAI Enhanced: Added fallback message due to liabilities fetch error');
      }
    } catch (error) {
      console.error('OpenAI Enhanced: Failed to get user profile:', error);
      // Don't fail the main request if profile retrieval fails
    }
  }

  // Build enhanced system prompt with proactive market context
  const systemPrompt = buildEnhancedSystemPrompt(tierContext, accountSummary, transactionSummary, marketContextSummary, searchContext, userProfile, investmentSummary, incomeAnalysis);

  console.log('OpenAI Enhanced: System prompt length:', systemPrompt.length);
  console.log('OpenAI Enhanced: Context optimization - transactions filtered:', `${transactions.length} → ${filteredTransactions.length}`);
  console.log('OpenAI Enhanced: System prompt preview:', systemPrompt.substring(0, 500));

  // Prepare conversation history for OpenAI
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Enhanced conversation history processing with context analysis
  // Database returns conversations in descending order (newest first), so we need to reverse for chronological order
  const filteredHistory = filterConversationHistory(conversationHistory, question);
  const recentHistory = filteredHistory.reverse();
  
  // Log GPT context if enabled (after recentHistory is defined)
  if (process.env.PERSIST_GPT_CONTEXT === 'true') {
    try {
      console.log('OpenAI Enhanced: About to log context with userId:', userId);
      console.log('OpenAI Enhanced: userId type:', typeof userId, 'length:', userId?.length, 'contains dlf:', userId?.includes('dlf'), 'contains d1f:', userId?.includes('d1f'));
      
      await logGPTContext({
        userId,
        question,
        systemPrompt,
        conversationHistory: recentHistory,
        accountSummary,
        transactionSummary,
        investmentSummary: investmentSummary || '',
        marketContextSummary,
        searchContext,
        categorizationDetails: categorizationDetails,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('OpenAI Enhanced: Error logging GPT context:', error);
      // Don't fail the main request if logging fails
    }
  }
  
  console.log('OpenAI Enhanced: Processing conversation history:', {
    totalHistoryLength: conversationHistory.length,
    filteredHistoryLength: filteredHistory.length,
    recentHistoryLength: recentHistory.length,
    recentQuestions: recentHistory.map(conv => conv.question.substring(0, 50))
  });
  
  // Analyze conversation history for context building opportunities
  const contextAnalysis = analyzeConversationContext(recentHistory, question);
  
  console.log('OpenAI Enhanced: Conversation context analysis:', {
    hasOpportunities: contextAnalysis.hasContextOpportunities,
    instruction: contextAnalysis.instruction,
    historyLength: recentHistory.length
  });
  
  // Add context-aware instruction if there are opportunities to build on previous conversations
  if (contextAnalysis.hasContextOpportunities) {
    const contextInstruction = `CONTEXT BUILDING OPPORTUNITY: ${contextAnalysis.instruction}`;
    messages.push({ role: 'user', content: contextInstruction });
    console.log('OpenAI Enhanced: Added context building instruction:', contextInstruction);
  }
  
  // Add conversation history with enhanced context
  for (const conv of recentHistory) {
    messages.push({ role: 'user', content: conv.question });
    messages.push({ role: 'assistant', content: conv.answer });
  }

  // Add current question
  messages.push({ role: 'user', content: question });

  console.log('OpenAI Enhanced: Sending request to OpenAI with', messages.length, 'messages');
  console.log('OpenAI Enhanced: Using model:', model || 'gpt-4o');
  console.log('OpenAI Enhanced: Message breakdown:', {
    systemMessage: 1,
    contextInstructions: contextAnalysis.hasContextOpportunities ? 1 : 0,
    conversationHistory: recentHistory.length * 2, // Q&A pairs
    currentQuestion: 1
  });
  pipelineTracker.endStage(promptStage, {
    systemPromptLength: systemPrompt.length,
    messageCount: messages.length
  });

  const llmStage = pipelineTracker.startStage('llm_call', {
    requestedModel: model || 'gpt-4o'
  });
  let completion: Awaited<ReturnType<typeof openai.chat.completions.create>> | undefined;
  try {
    completion = await openai.chat.completions.create({
      model: model || 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 2000
    });
  } catch (error) {
    pipelineTracker.endStage(llmStage);
    console.error('OpenAI Enhanced: Error calling OpenAI API:', error);
    throw new Error('Failed to get AI response');
  }

  pipelineTracker.endStage(llmStage, {
    modelUsed: completion.model,
    promptTokens: completion.usage?.prompt_tokens,
    completionTokens: completion.usage?.completion_tokens
    });

    let answer = completion.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.';

  const postProcessStage = pipelineTracker.startStage('post_process');
  try {
    console.log('🔧 TEST: Got OpenAI response, length:', answer.length);

    // Optional: Parse and log JSON output contract for debugging/monitoring
    const parsed = parseJSONOutputContract(answer);
    if (parsed.hasJSON) {
      console.log('✅ JSON output contract detected in response');
      console.log('JSON data keys:', Object.keys(parsed.jsonData || {}));
      console.log('Narrative length:', parsed.narrative.length);
    }

    // Strip LaTeX syntax (safety net in case GPT ignores instructions)
    answer = stripLatexSyntax(answer);
    console.log('🔧 LaTeX stripped, new length:', answer.length);

    // Enhance response with upgrade suggestions
    answer = enhanceResponseWithUpgrades(answer, tierContext, searchContext);

    // ✅ De-anonymize response for user (replace tokens with real names)
    // This ensures Merchant_X, Account_X, etc. are converted back to real names for the user
    if (!isDemo && userId) {
      try {
        answer = deanonymizationService.convertResponseToUserFriendly(userId, answer);
        console.log('OpenAI Enhanced: Response deanonymized successfully');
      } catch (e) {
        console.error('OpenAI Enhanced: Error de-anonymizing response:', e);
        // Continue with tokenized response if de-anonymization fails
      }
    }

    console.log('OpenAI Enhanced: Response generated successfully');
    const paragraphSegments = answer
      .split(/\n{2,}/)
      .map(segment => segment.trim())
      .filter(segment => segment.length > 0);
    const uniqueParagraphs = new Set(paragraphSegments);
    console.log('OpenAI Enhanced: Response paragraph stats', {
      totalParagraphs: paragraphSegments.length,
      uniqueParagraphs: uniqueParagraphs.size
    });
    console.log('OpenAI Enhanced: Final answer preview:', answer.substring(0, 400));
  } finally {
    pipelineTracker.endStage(postProcessStage, {
      finalLength: answer.length
    });
  }
    
    // Update user profile from conversation BEFORE generating response (for authenticated users only)
    if (userId && !isDemo) {
      try {
        const { ProfileManager } = await import('./profile/manager');
        const profileManager = new ProfileManager();
        
        // Extract profile information from the user's question BEFORE AI response
        await profileManager.updateProfileFromConversation(userId, {
          id: 'temp',
          question,
          answer: '', // No answer yet - we're extracting from the question
          createdAt: new Date()
        });
        console.log('OpenAI Enhanced: User profile updated from conversation question');
      } catch (error) {
        console.error('OpenAI Enhanced: Failed to update user profile:', error);
        // Don't fail the main request if profile update fails
      }
    }
    
    return answer;
  } catch (error) {
  pipelineStatus = 'error';
  throw error;
} finally {
  pipelineTracker.finish(pipelineStatus);
}
}

/**
 * Enhanced system prompt builder with proactive market context
 */
function buildEnhancedSystemPrompt(
  tierContext: TierAwareContext, 
  accountSummary: string, 
  transactionSummary: string,
  marketContextSummary: string,
  searchContext?: string,
  userProfile?: string,
  investmentSummary?: string,
  incomeAnalysis?: string
): string {
  const { tierInfo, upgradeHints } = tierContext;

  const sections: string[] = [];

  sections.push(
    '# SYSTEM (Linc – Financial Analyst)',
    'You are Linc, an AI financial analyst. Use only the data provided in this prompt.'
  );

  sections.push(
    '## Data Precedence (highest → lowest)\n' +
      '1) INCOME ANALYSIS block (exact figures; do not recalc)\n' +
      "2) USER'S FINANCIAL DATA (transactions, balances, holdings)\n" +
      '3) USER PROFILE (personal context)\n' +
      '4) MARKET CONTEXT (current market conditions and trends)\n' +
      '5) REAL-TIME FINANCIAL DATA (use only when explicitly requested)'
  );

  sections.push(
    '## Response Rules\n' +
      '- Never use LaTeX or math notation.\n' +
      '- Do not expose chain-of-thought; provide results only.\n' +
      '- Calculations must appear in plain-text paragraphs (not bullet lists).\n' +
      '- Currency format: $X,XXX.XX; Percentages: XX.XX%.\n' +
      '- Be explicit about exclusions (transfers, investment buys/sells).\n' +
      '- If required data is missing, state the limitation and continue.'
  );

  sections.push(
    '## Income Rules (Critical)\n' +
      '- Use INCOME ANALYSIS figures exactly when present. Do not recalc from transactions.\n' +
      '- Exclude transfer_in, transfer_out, deposit, withdrawal, buy, sell.\n' +
      '- For unmatched periods, include only transactions explicitly marked (INCOME).'
  );

  sections.push(
    '## Expense Rules (Critical)\n' +
      '- Count only transaction_type: expense or fee.\n' +
      '- Exclude transfer_in, transfer_out, deposit, withdrawal, buy, sell, refund.\n' +
      '- When summarising spend by category, note that transfers and investment transactions were excluded.'
  );

  sections.push(
    '## Date-Specific Guidance\n' +
      '- Include all relevant transactions in the requested period.\n' +
      '- Mention visible gaps in dates if present.\n' +
      '- Report how many income and expense transactions you included.'
  );

  sections.push(
    '## Real-Time Data\n' +
      '- If the user explicitly asks for current rates/prices/averages, use the data inside the REAL-TIME section verbatim (cite by name, no links).\n' +
      '- Otherwise, treat real-time data as contextual comparisons only.'
  );

  sections.push(
    '## Output Contract\n' +
      'Return ONE JSON object first (no prose before it). After the JSON, write a 3–6 sentence narrative summary. Keep calculations in paragraphs (not bullets) and reference any real-time sources by name.'
  );

  if (searchContext) {
    sections.push(
      '=== REAL-TIME FINANCIAL DATA ===\n' + searchContext + '\n=== END REAL-TIME FINANCIAL DATA ==='
    );
  }

  if (marketContextSummary) {
    sections.push('MARKET CONTEXT:\n' + marketContextSummary);
  }

  if (userProfile && userProfile.trim()) {
    sections.push('USER PROFILE:\n' + userProfile.trim());
  } else {
    sections.push('USER PROFILE:\nNo profile available');
  }

  sections.push(
    'LIABILITIES INFORMATION:\nCredit limit information may be unavailable from Plaid. If limits are unknown, state "Credit Limit: Unknown" and never infer utilisation.'
  );

  sections.push(
    "USER'S FINANCIAL DATA:\nAccounts:\n" + (accountSummary || 'No accounts found')
  );

  sections.push(
    'RECENT TRANSACTIONS (authoritative types in parentheses):\n' +
      'IMPORTANT: Use only (INCOME) transactions for income calculations. Exclude (TRANSFER_IN), (TRANSFER_OUT), (DEPOSIT), and (WITHDRAWAL).\n' +
      (transactionSummary || 'No transactions found')
  );

  if (incomeAnalysis && incomeAnalysis.trim()) {
    sections.push('INCOME ANALYSIS (authoritative):\n' + incomeAnalysis.trim());
          } else {
    sections.push(
      'INCOME ANALYSIS (authoritative):\nNo income analysis provided. If asked for income, include only transactions marked (INCOME).'
    );
  }

  if (investmentSummary && investmentSummary.trim()) {
    sections.push('INVESTMENT DATA (overview):\n' + investmentSummary.trim());
  }

  const tierLines: string[] = [];
  tierLines.push(`USER TIER: ${String(tierInfo.currentTier).toUpperCase()}`);
  tierLines.push(
    'AVAILABLE DATA SOURCES:\n' +
      (tierInfo.availableSources.length > 0
        ? tierInfo.availableSources.map(source => `• ${source}`).join('\n')
        : '• Account data only')
  );
  if (tierInfo.unavailableSources.length > 0 && !searchContext) {
    tierLines.push(
      'UNAVAILABLE DATA SOURCES (upgrade to access):\n' +
        tierInfo.unavailableSources.map(source => `• ${source}`).join('\n')
    );
  }
  if (upgradeHints.length > 0) {
    tierLines.push(
      'UPGRADE SUGGESTIONS:\n' +
        upgradeHints
          .map(hint => `• ${hint.feature}: ${hint.benefit}`)
          .join('\n')
    );
  }
  sections.push(tierLines.join('\n\n'));

  sections.push(
    'ADDITIONAL INSTRUCTIONS:\n' +
      '- Compute average monthly spending excluding transfers/deposits/withdrawals/buys/sells/refunds; include expense/fee only.\n' +
      '- Provide detailed category breakdown using the authoritative transaction_type and categories provided.\n' +
      '- State the analysis period you infer from the transactions and mention any visible date gaps.\n' +
      '- After the JSON, follow with a concise narrative summary (3–6 sentences).' 
  );

  return sections.join('\n\n').trim();
}

export async function askOpenAI(
  question: string,
  conversationHistory: Conversation[] = [],
  userTier: UserTier | string = UserTier.STARTER,
  isDemo: boolean = false,
  userId?: string,
  model?: string
): Promise<string> {
  return askOpenAIWithEnhancedContext(question, conversationHistory, userTier, isDemo, userId, model);
}

export async function askOpenAIForTests(
  question: string, 
  conversationHistory: Conversation[] = [], 
  userTier: UserTier | string = UserTier.STARTER, 
  isDemo: boolean = false, 
  userId?: string,
  model: string = 'gpt-4o-mini'
): Promise<string> {
  return askOpenAIWithEnhancedContext(question, conversationHistory, userTier, isDemo, userId, model);
}
