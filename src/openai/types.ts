import { TierAwareContext } from '../data/orchestrator';
import { Transaction as UnifiedTransaction, UnifiedFinancialData } from '../services/financial-data-service';

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
}

export interface TransactionSummaryItem {
  id: string;
  name: string;
  amount: number;
  date: string;
  typeLabel: string;
  categoryLabel?: string;
}

export interface InvestmentSnapshot {
  totalValue: number;
  holdingCount: number;
  summaryLines: string[];
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

