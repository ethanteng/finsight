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

