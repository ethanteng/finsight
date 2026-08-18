import type {
  InvestmentTransaction,
  InvestmentsTransactionsGetRequest,
  LiabilitiesObject,
  PlaidApi,
} from 'plaid';

const PLAID_INVESTMENT_PAGE_SIZE = 500;

type InvestmentTransactionsClient = Pick<PlaidApi, 'investmentsTransactionsGet'>;

export interface PlaidLiabilityApr {
  type: string;
  percentage: number;
  balanceSubjectToApr?: number;
  interestChargeAmount?: number;
}

export interface PlaidLiabilityDetails {
  provider: 'plaid';
  kind: 'credit' | 'mortgage' | 'student';
  retrievedAt: string;
  aprs?: PlaidLiabilityApr[];
  interestRatePercentage?: number;
  interestRateType?: string;
  minimumPaymentAmount?: number;
  nextMonthlyPayment?: number;
  nextPaymentDueDate?: string;
  lastPaymentAmount?: number;
  lastPaymentDate?: string;
  lastStatementBalance?: number;
  lastStatementIssueDate?: string;
  originationPrincipalAmount?: number;
  originationDate?: string;
  maturityDate?: string;
  loanTerm?: string;
  loanTypeDescription?: string;
  outstandingInterestAmount?: number;
  escrowBalance?: number;
  pastDueAmount?: number;
  currentLateFee?: number;
  isOverdue?: boolean;
  hasPmi?: boolean;
  hasPrepaymentPenalty?: boolean;
  expectedPayoffDate?: string;
  loanStatus?: string;
  loanStatusEndDate?: string;
  repaymentPlanType?: string;
  repaymentPlanDescription?: string;
  ytdInterestPaid?: number;
  ytdPrincipalPaid?: number;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

/**
 * Plaid's investment-transaction endpoint defaults to 100 records and exposes
 * the full result size separately. Fetch every stable reverse-chronological
 * page or fail instead of silently presenting a truncated activity history.
 */
export async function fetchAllPlaidInvestmentTransactions(
  client: InvestmentTransactionsClient,
  request: Omit<InvestmentsTransactionsGetRequest, 'options'> & {
    options?: InvestmentsTransactionsGetRequest['options'];
  },
): Promise<InvestmentTransaction[]> {
  const transactions: InvestmentTransaction[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const response = await client.investmentsTransactionsGet({
      ...request,
      options: {
        ...(request.options ?? {}),
        count: PLAID_INVESTMENT_PAGE_SIZE,
        offset,
      },
    });
    const page = Array.isArray(response.data.investment_transactions)
      ? response.data.investment_transactions
      : [];
    const reportedTotal = response.data.total_investment_transactions;
    total = typeof reportedTotal === 'number' && Number.isFinite(reportedTotal)
      ? Math.max(0, reportedTotal)
      : offset + page.length;

    if (page.length === 0) {
      if (offset < total) {
        throw new Error(`Plaid investment transaction pagination stalled at ${offset} of ${total}`);
      }
      break;
    }

    transactions.push(...page);
    offset += page.length;
  }

  return transactions;
}

/** Convert the three Plaid liability schemas into one compact account payload. */
export function normalizePlaidLiabilities(
  liabilities: LiabilitiesObject | null | undefined,
  retrievedAt: string,
): Map<string, PlaidLiabilityDetails[]> {
  const byAccount = new Map<string, PlaidLiabilityDetails[]>();
  const add = (accountId: unknown, details: PlaidLiabilityDetails) => {
    const id = text(accountId);
    if (!id) return;
    byAccount.set(id, [...(byAccount.get(id) ?? []), details]);
  };

  for (const liability of liabilities?.credit ?? []) {
    const aprs = (liability.aprs ?? []).flatMap(apr => {
      const percentage = finite(apr.apr_percentage);
      if (percentage === undefined) return [];
      return [compact({
        type: String(apr.apr_type),
        percentage,
        balanceSubjectToApr: finite(apr.balance_subject_to_apr),
        interestChargeAmount: finite(apr.interest_charge_amount),
      })];
    });
    add(liability.account_id, compact({
      provider: 'plaid' as const,
      kind: 'credit' as const,
      retrievedAt,
      aprs: aprs.length ? aprs : undefined,
      minimumPaymentAmount: finite(liability.minimum_payment_amount),
      nextPaymentDueDate: text(liability.next_payment_due_date),
      lastPaymentAmount: finite(liability.last_payment_amount),
      lastPaymentDate: text(liability.last_payment_date),
      lastStatementBalance: finite(liability.last_statement_balance),
      lastStatementIssueDate: text(liability.last_statement_issue_date),
      isOverdue: boolean(liability.is_overdue),
    }));
  }

  for (const liability of liabilities?.mortgage ?? []) {
    // Intentionally omit property_address: street-level mortgage addresses are
    // PII and would flow into the account-details LLM context pack.
    add(liability.account_id, compact({
      provider: 'plaid' as const,
      kind: 'mortgage' as const,
      retrievedAt,
      interestRatePercentage: finite(liability.interest_rate?.percentage),
      interestRateType: text(liability.interest_rate?.type),
      nextMonthlyPayment: finite(liability.next_monthly_payment),
      nextPaymentDueDate: text(liability.next_payment_due_date),
      lastPaymentAmount: finite(liability.last_payment_amount),
      lastPaymentDate: text(liability.last_payment_date),
      originationPrincipalAmount: finite(liability.origination_principal_amount),
      originationDate: text(liability.origination_date),
      maturityDate: text(liability.maturity_date),
      loanTerm: text(liability.loan_term),
      loanTypeDescription: text(liability.loan_type_description),
      escrowBalance: finite(liability.escrow_balance),
      pastDueAmount: finite(liability.past_due_amount),
      currentLateFee: finite(liability.current_late_fee),
      hasPmi: boolean(liability.has_pmi),
      hasPrepaymentPenalty: boolean(liability.has_prepayment_penalty),
      ytdInterestPaid: finite(liability.ytd_interest_paid),
      ytdPrincipalPaid: finite(liability.ytd_principal_paid),
    }));
  }

  for (const liability of liabilities?.student ?? []) {
    // Intentionally omit loan_name: provider loan names often include the
    // borrower's personal name and are not needed for rate/payment analysis.
    add(liability.account_id, compact({
      provider: 'plaid' as const,
      kind: 'student' as const,
      retrievedAt,
      interestRatePercentage: finite(liability.interest_rate_percentage),
      minimumPaymentAmount: finite(liability.minimum_payment_amount),
      nextPaymentDueDate: text(liability.next_payment_due_date),
      lastPaymentAmount: finite(liability.last_payment_amount),
      lastPaymentDate: text(liability.last_payment_date),
      lastStatementBalance: finite(liability.last_statement_balance),
      lastStatementIssueDate: text(liability.last_statement_issue_date),
      originationPrincipalAmount: finite(liability.origination_principal_amount),
      originationDate: text(liability.origination_date),
      outstandingInterestAmount: finite(liability.outstanding_interest_amount),
      expectedPayoffDate: text(liability.expected_payoff_date),
      loanStatus: text(liability.loan_status?.type),
      loanStatusEndDate: text(liability.loan_status?.end_date),
      repaymentPlanType: text(liability.repayment_plan?.type),
      repaymentPlanDescription: text(liability.repayment_plan?.description),
      ytdInterestPaid: finite(liability.ytd_interest_paid),
      ytdPrincipalPaid: finite(liability.ytd_principal_paid),
      isOverdue: boolean(liability.is_overdue),
    }));
  }

  return byAccount;
}
