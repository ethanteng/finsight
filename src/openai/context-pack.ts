import type { FinancialContextSnapshot, QuestionNeeds } from './types';
import type { CanonicalFactPack } from './canonical-facts';
import { RETIREMENT_CALCULATOR_ID } from '../scenarios/retirement-scenario';
import { scenarioCalculatorRegistry } from '../scenarios/calculator-registry';
import { questionMentionsSecurity } from './security-question-match';

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
    portfolioComposition: {
      equityAllocation: analysis.metrics.equityAllocation,
      fixedIncomeAllocation: analysis.metrics.fixedIncomeAllocation,
      tipsAllocation: analysis.metrics.tipsAllocation,
      tipsAllocationStatus: analysis.metrics.tipsAllocationStatus,
      cashAllocation: analysis.metrics.cashAllocation,
      internationalAllocation: analysis.metrics.internationalAllocation,
      expenseRatioWeighted: analysis.metrics.expenseRatioWeighted,
      expenseRatioCoverage: analysis.metrics.expenseRatioCoverage,
      countryAllocation: analysis.metrics.countryAllocation?.slice(0, 12),
      sectorAllocation: analysis.metrics.sectorAllocation?.slice(0, 12),
      countryCoverage: analysis.metrics.countryCoverage,
      sectorCoverage: analysis.metrics.sectorCoverage,
    },
    historicalImplications: analysis.historicalImplications,
    dataQuality: {
      metadataConfidence: analysis.dataQuality.metadataConfidence,
      portfolioMappingConfidence: analysis.dataQuality.portfolioMappingConfidence,
      mappingMethod: analysis.dataQuality.proxyUsage.mappingMethod,
      assumptions: analysis.dataQuality.assumptions,
      missingData: analysis.dataQuality.missingData,
      // What the projection was computed on, and what it left out on purpose.
      modeledValue: analysis.dataQuality.modeledValue,
      unmodeledValue: analysis.dataQuality.unmodeledValue,
      valueCoverage: analysis.dataQuality.valueCoverage,
      unmodeledReasons: analysis.dataQuality.unmodeledReasons,
    },
    historicalData: analysis.historicalData,
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
  if (needs.needsInvestments && snapshot.investments) {
    const externalData = snapshot.investments.externalData;
    const matchingExternalSecurities = externalData?.securities.filter(security =>
      questionMentionsSecurity(question, security.ticker, security.name)
    ) ?? [];
    const compactExternalData = externalData ? {
      ...externalData,
      securities: matchingExternalSecurities.length > 0
        ? matchingExternalSecurities
        : externalData.securities.map(security => {
            const compact = { ...security };
            delete compact.countryAllocations;
            delete compact.sectorAllocations;
            return compact;
          }),
    } : undefined;
    details.investments = {
      summary: snapshot.investments.summaryLines,
      externalData: compactExternalData,
    };
  }
  if (needs.needsMonthlyCashFlow) details.monthlyCashFlow = snapshot.transactionSummary?.byMonth;
  if (needs.needsRetirement) {
    details.retirementAnalysis = compactRetirementAnalysis(snapshot);
    details.retirementAnalysisNeedsInfo = snapshot.retirementAnalysisNeedsInfo;
  }
  const scenarioExecutions = snapshot.scenarioExecutions
    ?? (snapshot.retirementScenarioExecution
      ? { [RETIREMENT_CALCULATOR_ID]: snapshot.retirementScenarioExecution }
      : undefined);
  if (scenarioExecutions && Object.keys(scenarioExecutions).length > 0) {
    details.scenarios = scenarioCalculatorRegistry.compactEvidenceRecord(scenarioExecutions);
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
