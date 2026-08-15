import type { FinancialContextSnapshot, QuestionNeeds } from './types';
import type { CanonicalFactPack } from './canonical-facts';

export interface QuestionContextPack {
  facts: CanonicalFactPack;
  snapshot: {
    status?: string;
    reportingCurrency?: string;
    quality?: NonNullable<FinancialContextSnapshot['financialSummary']>['quality'];
  };
  details: Record<string, unknown>;
}

function compactRetirementAnalysis(snapshot: FinancialContextSnapshot): unknown {
  const analysis = snapshot.retirementAnalysis;
  if (!analysis) return undefined;
  return {
    assessment: {
      characteristics: analysis.summary.characteristics,
      tradeoffs: analysis.summary.tradeoffs,
      primaryObservation: analysis.summary.primaryObservation,
      confidence: analysis.summary.confidence,
      timelineBucketNote: analysis.summary.timelineBucketNote,
    },
    historicalImplications: analysis.historicalImplications,
    dataQuality: {
      metadataConfidence: analysis.dataQuality.metadataConfidence,
      portfolioMappingConfidence: analysis.dataQuality.portfolioMappingConfidence,
      mappingMethod: analysis.dataQuality.proxyUsage.mappingMethod,
      assumptions: analysis.dataQuality.assumptions,
      missingData: analysis.dataQuality.missingData,
    },
    disclaimers: analysis.disclaimers,
  };
}

/** Build a compact, question-specific prompt payload from the gathered snapshot. */
export function buildQuestionContextPack(
  snapshot: FinancialContextSnapshot,
  needs: QuestionNeeds,
  facts: CanonicalFactPack,
  question = ''
): QuestionContextPack {
  const details: Record<string, unknown> = {};
  if (needs.needsAccountDetails) {
    const matchedAccounts = snapshot.accounts.filter((account) =>
      question.toLowerCase().includes(account.name.toLowerCase()) ||
      Boolean(account.institution && question.toLowerCase().includes(account.institution.toLowerCase()))
    );
    details.accounts = matchedAccounts.length > 0 ? matchedAccounts : snapshot.accounts;
  }
  if (needs.needsTransactionDetails) details.recentTransactions = snapshot.bankingTransactions;
  if (needs.needsMonthlyCashFlow) details.monthlyCashFlow = snapshot.transactionSummary?.byMonth;
  if (needs.needsRetirement) {
    details.retirementAnalysis = compactRetirementAnalysis(snapshot);
    details.retirementAnalysisNeedsInfo = snapshot.retirementAnalysisNeedsInfo;
  }
  if (needs.needsHomeValue) details.homeValue = snapshot.homeValueSummary;

  return {
    facts,
    snapshot: {
      status: snapshot.financialSummary?.status,
      reportingCurrency: snapshot.financialSummary?.reportingCurrency,
      quality: snapshot.financialSummary?.quality,
    },
    details,
  };
}

export function formatQuestionContextPack(pack: QuestionContextPack): string {
  return JSON.stringify(pack, null, 2);
}
