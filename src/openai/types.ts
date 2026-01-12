import { TierAwareContext } from '../data/orchestrator';
import { Transaction as UnifiedTransaction, UnifiedFinancialData, Holding, Security } from '../services/financial-data-service';

export interface QuestionNeeds {
  needsMarketContext: boolean;
  needsSearchContext: boolean;
  needsHomeValue: boolean;
  needsInvestments: boolean;
}

export interface AccountSummaryItem {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  balance: number;
  institution?: string;
  interestRate?: number;
}

export interface TransactionSummaryItem {
  id: string;
  name: string;
  amount: number;
  date: string;
  typeLabel: string;
  categoryLabel?: string;
  merchantName?: string;
  accountName?: string;
  accountInstitution?: string;
}

export interface InvestmentSnapshot {
  totalValue: number;
  holdingCount: number;
  summaryLines: string[];
  holdings?: Holding[];
  securities?: Security[];
}

export interface FinancialContextSnapshot {
  accounts: AccountSummaryItem[];
  bankingTransactions: TransactionSummaryItem[];
  investments?: InvestmentSnapshot;
  metadata: UnifiedFinancialData['metadata'];
  tierContext: TierAwareContext;
  incomeAnalysis?: string;
  searchContext?: string;
  marketContext?: string;
  userProfile?: string;
  homeValueSummary?: string;
  retirementAnalysis?: {
    summary: {
      characteristics: {
        growthPotential: 'high' | 'moderate' | 'low';
        drawdownResistance: 'high' | 'moderate' | 'low';
        withdrawalFragility: 'high' | 'moderate' | 'low';
        inflationProtection: 'high' | 'moderate' | 'low';
      };
      tradeoffs: {
        upside: string;
        downside: string;
      };
      primaryObservation: string;
      confidence: 'high' | 'medium' | 'low';
      timelineBucket: '10' | '20' | '30';
      timelineBucketNote: string;
    };
    metrics: {
      equityAllocation: number;
      withdrawalRate: number;
      yearsOfExpenses: number;
      historicalWithdrawalRates: {
        p10: number;
        p25: number;
        p50: number;
        p75: number;
        p90: number;
      };
    };
    stressTest: {
      totalSequences: number;
      survivalRate: number;
      depletionPercentiles: {
        p10: number | null;
        p25: number | null;
        p50: number | null;
        p75: number | null;
        p90: number | null;
      };
      worstSequences: {
        byDepletion: Array<{ sequenceId: string; yearsUntilDepletion: number }>;
        byDrawdown: Array<{ sequenceId: string; maximumDrawdown: number }>;
        byRecovery: Array<{ sequenceId: string; timeToRecovery: number }>;
      };
      notablePeriods?: Array<{
        period: string;
        rank: number;
        metric: 'depletion' | 'drawdown' | 'recovery';
      }>;
    };
    historicalImplications: Array<{
      category: 'allocation' | 'diversification' | 'expenses' | 'withdrawal';
      observation: string;
      historicalContext: string;
    }>;
    dataQuality: {
      completeness: number;
      priceHistoryCoverage: number;
      metadataConfidence: 'high' | 'medium' | 'low';
      portfolioMappingConfidence: 'high' | 'medium' | 'low';
      proxiedValuePercentage: number;
      assumptions: string[];
      missingData: string[];
    };
    disclaimers: string[];
  };
  financialSummary?: {
    financialOverview?: {
      netWorth: number;
      totalCash: number;
      totalInvestments: number;
      totalDebt: number;
      homeValue: number | null;
    };
    investmentPortfolio?: {
      totalValue: number;
      holdingsCount: number;
      assetAllocation: Array<{
        type: string;
        value: number;
        percentage: number;
      }>;
      securityCount: number;
    };
  };
}

export interface ConversationEntry {
  id: string;
  question: string;
  answer: string;
  createdAt: Date;
}

export interface PromptPayload {
  systemPrompt: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

