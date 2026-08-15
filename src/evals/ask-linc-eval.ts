import { analyzeQuestionNeeds } from '../openai/question-analysis';
import { validateResponseFacts } from '../openai/response-facts';
import type { CanonicalFactPack } from '../openai/canonical-facts';
import { resolveRetirementInputs } from '../openai/retirement-inputs';

export type AskLincEvalCategory =
  | 'numerical_accuracy'
  | 'follow_up'
  | 'stale_data'
  | 'missing_data'
  | 'retirement';

export interface AskLincEvalResult {
  id: string;
  category: AskLincEvalCategory;
  passed: boolean;
  detail: string;
}

const snapshotFactPack: CanonicalFactPack = {
  version: 1,
  snapshotComputedAt: '2026-08-14T12:00:00.000Z',
  snapshotAsOf: '2026-08-13T12:00:00.000Z',
  facts: [{
    id: 'net_worth',
    label: 'Net worth',
    value: 250_000,
    unit: 'usd',
    provenance: {
      kind: 'snapshot',
      source: 'financialSummary.financialOverview.netWorth',
      asOf: '2026-08-13T12:00:00.000Z',
    },
  }],
};

export function runAskLincEvalSet(): AskLincEvalResult[] {
  const exactNumber = validateResponseFacts({
    summary: 'Your net worth is $250,000.',
    key_numbers: { net_worth: { value: 250_000, unit: 'usd', provenance: 'net_worth' } },
  }, snapshotFactPack);
  const inventedNumber = validateResponseFacts({ summary: 'Your net worth is $275,000.' }, snapshotFactPack);

  const followUpNeeds = analyzeQuestionNeeds(
    'What about that one instead?',
    ['How should I diversify my investment portfolio?']
  );

  const staleResponse = validateResponseFacts({
    summary: 'The latest stored snapshot shows $250,000 in net worth.',
    key_numbers: { net_worth: { value: 250_000, unit: 'usd', provenance: 'net_worth' } },
  }, snapshotFactPack);

  const missingDataResponse = validateResponseFacts(
    { summary: 'Your net worth is $100,000.' },
    { version: 1, facts: [] }
  );

  const retirementInputs = resolveRetirementInputs({
    questionParams: { retirementAge: 65 } as any,
    profileAge: 45,
    profileRetirementAge: null,
  });

  return [
    {
      id: 'authoritative-number-must-match-fact',
      category: 'numerical_accuracy',
      passed: exactNumber.valid && !inventedNumber.valid,
      detail: 'Exact, cited values pass; model-invented arithmetic fails locally.',
    },
    {
      id: 'follow-up-inherits-question-intent',
      category: 'follow_up',
      passed: followUpNeeds.needsInvestments && followUpNeeds.needsAccountDetails,
      detail: 'Short follow-ups inherit the latest relevant question intent.',
    },
    {
      id: 'stale-snapshot-keeps-provenance',
      category: 'stale_data',
      passed: staleResponse.valid && snapshotFactPack.facts[0].provenance.asOf === snapshotFactPack.snapshotAsOf,
      detail: 'Stored values remain traceable to their as-of timestamp.',
    },
    {
      id: 'missing-data-cannot-create-number',
      category: 'missing_data',
      passed: !missingDataResponse.valid,
      detail: 'A response cannot introduce a financial value absent from canonical facts.',
    },
    {
      id: 'retirement-does-not-default-withdrawal',
      category: 'retirement',
      passed: retirementInputs.missingParams.includes('annualWithdrawalAmount') &&
        retirementInputs.annualWithdrawalAmount == null,
      detail: 'Retirement analysis requests a missing withdrawal amount instead of assuming one.',
    },
  ];
}

export function summarizeAskLincEval(results = runAskLincEvalSet()) {
  const passed = results.filter(result => result.passed).length;
  const categories = Object.fromEntries(results.map(result => [result.category, result.passed]));
  return {
    passed,
    total: results.length,
    score: results.length ? passed / results.length : 0,
    requiredScore: 1,
    categories,
    results,
  };
}

if (require.main === module) {
  const summary = summarizeAskLincEval();
  console.log(JSON.stringify(summary, null, 2));
  if (summary.score < summary.requiredScore) process.exitCode = 1;
}
