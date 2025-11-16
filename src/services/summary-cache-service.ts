import { PrismaClient } from '@prisma/client';
import { plaidClient } from '../plaid';
import { BalanceService } from './balance-service';
import { FinancialDataService } from './financial-data-service';

// Lazy Prisma to avoid multiple instances during different runtimes
let prisma: PrismaClient | null = null;
const getPrisma = (): PrismaClient => {
  if (!prisma) prisma = new PrismaClient();
  return prisma!;
};

type ViewMode = 'summary' | 'full';

export class SummaryCacheService {
  static getEnvWindows() {
    const txDays = Number(process.env.TRANSACTION_HISTORY_DAYS || 365);
    const invYears = Number(process.env.INVESTMENT_HISTORY_YEARS || 5);
    const balanceHours = Number(process.env.BALANCE_REFRESH_HOURS || 24);
    return { txDays, invYears, balanceHours };
  }

  /**
   * Compute and upsert the snapshot for a given user.
   * Applies env-driven windows and balance refresh throttling.
   */
  static async computeForUser(userId: string) {
    const prisma = getPrisma();
    const { txDays, invYears, balanceHours } = this.getEnvWindows();

    // Determine date ranges
    const txSince = new Date(Date.now() - txDays * 24 * 60 * 60 * 1000);
    const invSince = new Date();
    invSince.setFullYear(invSince.getFullYear() - invYears);

    // Ensure balances are fresh (token-scoped; throttle by BALANCE_REFRESH_HOURS)
    // Strategy: if any account for the user has stale balanceLastFetched, refresh all tokens' balances once.
    const oldestRecentAllowed = new Date(Date.now() - balanceHours * 60 * 60 * 1000);
    const anyStale = await prisma.account.findFirst({
      where: {
        userId,
        OR: [
          { balanceLastFetched: null },
          { balanceLastFetched: { lt: oldestRecentAllowed } },
        ],
      },
      select: { plaidAccountId: true },
    });

    if (anyStale) {
      // Refresh balances for all access tokens of this user (throttled via BalanceService internals)
      const tokens = await prisma.accessToken.findMany({
        where: { userId, isActive: true },
        select: { token: true, id: true },
      });
      for (const t of tokens) {
        try {
          await BalanceService.getAccountBalances(t.token, plaidClient, false);
        } catch (err) {
          console.warn(`SummaryCacheService: Balance refresh skipped/failed for token ${t.id}:`, err);
        }
      }
    }

    // Fetch unified financial data using existing service
    const fds = new FinancialDataService();
    const data = await fds.getUserFinancialData(userId, {
      includeTransactions: true,
      includeInvestments: true,
      includeHomeValue: true,
      // Keep categorization enabled so GPT gets enriched context
      skipCategorization: false,
    });

    // Derive overview/portfolio and pre-aggregations
    const overview = SummaryCacheService.computeFinancialOverview(data);
    const portfolio = SummaryCacheService.computeInvestmentPortfolio(data);
    const { windowedTransactions, transactionsSummary } = SummaryCacheService.extractWindowedTransactions(
      data,
      txSince
    );
    const activities = SummaryCacheService.extractWindowedInvestmentActivities(data, invSince);

    const payload: any = {
      computedAt: new Date(),
      financialOverview: overview,
      investmentPortfolio: portfolio,
      accounts: data?.accounts || [],
      holdings: data?.investments?.holdings || [],
      securities: data?.investments?.securities || [],
      transactions: windowedTransactions,
      transactionsSummary,
      activities,
      meta: {
        version: '1.0',
        source: 'SummaryCacheService',
        transactionsWindowDays: txDays,
        investmentWindowYears: invYears,
        balanceRefreshHours: balanceHours,
      },
    };

    await this.upsertSnapshot(userId, payload);
    return payload;
  }

  static async upsertSnapshot(userId: string, payload: any) {
    const prisma = getPrisma();
    await prisma.financialSummarySnapshot.upsert({
      where: { userId },
      update: {
        computedAt: payload.computedAt,
        financialOverview: payload.financialOverview,
        investmentPortfolio: payload.investmentPortfolio,
        accounts: payload.accounts,
        holdings: payload.holdings,
        securities: payload.securities,
        transactions: payload.transactions,
        transactionsSummary: payload.transactionsSummary,
        activities: payload.activities,
        meta: payload.meta,
      },
      create: {
        userId,
        computedAt: payload.computedAt,
        financialOverview: payload.financialOverview,
        investmentPortfolio: payload.investmentPortfolio,
        accounts: payload.accounts,
        holdings: payload.holdings,
        securities: payload.securities,
        transactions: payload.transactions,
        transactionsSummary: payload.transactionsSummary,
        activities: payload.activities,
        meta: payload.meta,
      },
    });
  }

  static async getLatestSnapshot(userId: string, view: ViewMode = 'summary') {
    const prisma = getPrisma();
    const snap = await prisma.financialSummarySnapshot.findUnique({
      where: { userId },
    });
    if (!snap) return null;
    if (view === 'full') return snap;
    // summary view: strip heavy arrays
    const { accounts, holdings, securities, transactions, activities, ...rest } = snap as any;
    return rest;
  }

  static async refreshAllUsers() {
    const prisma = getPrisma();
    const userIds = await prisma.user.findMany({
      where: {
        accessTokens: { some: { isActive: true } },
      },
      select: { id: true },
    });

    let processed = 0;
    for (const u of userIds) {
      try {
        await this.computeForUser(u.id);
        processed++;
      } catch (err) {
        console.error(`SummaryCacheService: Failed to refresh snapshot for user ${u.id}`, err);
      }
    }
    return { success: true, usersProcessed: processed };
  }

  // ---- Helpers to compute sections ----
  private static computeFinancialOverview(data: any) {
    const holdings = Array.isArray(data?.investments?.holdings) ? data.investments.holdings : [];
    const totalInvestments = holdings.reduce((s: number, h: any) => s + (h.institution_value ?? h.value ?? 0), 0);
    const totalCash = (data?.accounts || []).reduce((sum: number, a: any) => {
      const t = a.type;
      const st = a.subtype;
      if (t === 'investment' || ['401k','ira','roth','brokerage','hsa','529','pension','annuity'].includes(st)) return sum;
      if (t === 'depository' || ['checking','savings','cd','money market','prepaid'].includes(st)) {
        const b = a.balance?.available ?? a.balance?.current ?? 0;
        return sum + Math.max(0, b);
      }
      // credit/loan and others are handled in debt
      return sum;
    }, 0);
    const totalDebt = (data?.accounts || []).reduce((sum: number, a: any) => {
      const t = a.type;
      const st = a.subtype;
      if (t === 'credit') return sum + Math.abs(a.balance?.current ?? 0);
      if (t === 'loan' || ['mortgage','student','personal','auto','home equity'].includes(st)) {
        return sum + Math.max(0, a.balance?.current ?? 0);
      }
      return sum;
    }, 0);
    const homeValue = data?.homeValue?.valueMid ?? 0;
    const netWorth = totalCash + totalInvestments + homeValue - totalDebt;
    return { netWorth, totalCash, totalInvestments, totalDebt, homeValue };
  }

  private static computeInvestmentPortfolio(data: any) {
    const holdings = Array.isArray(data?.investments?.holdings) ? data.investments.holdings : [];
    const totalValue = holdings.reduce((s: number, h: any) => s + (h.institution_value ?? h.value ?? 0), 0);
    const holdingCount = holdings.length;
    const securityCount = new Set(holdings.map((h: any) => h.security_id)).size;
    const assetAllocation = data?.investments?.portfolio?.assetAllocation || [];
    return { totalValue, holdingCount, securityCount, assetAllocation };
  }

  private static extractWindowedTransactions(data: any, txSince: Date) {
    const allBank = Array.isArray(data?.bankingTransactions) ? data.bankingTransactions : [];
    const allInv = Array.isArray(data?.investments?.transactions) ? data.investments.transactions : [];
    const all = [...allBank, ...allInv];
    const windowed = all.filter((t: any) => {
      const d = new Date(t.date || t.authorized_date || t.posted_date || t.trade_date || t.transaction_date || t.createdAt);
      return !isNaN(d.getTime()) && d >= txSince;
    });
    // Aggregate simple monthly income/expense and by-category totals
    const summary = {
      incomeTotal: windowed.filter((t: any) => t.amount < 0).reduce((s: number, t: any) => s + Math.abs(t.amount), 0),
      expenseTotal: windowed.filter((t: any) => t.amount > 0).reduce((s: number, t: any) => s + t.amount, 0),
      byCategory: {} as Record<string, number>,
      byMonth: {} as Record<string, { income: number; expense: number }>,
    };
    for (const t of windowed) {
      const cat = t.category || 'Uncategorized';
      summary.byCategory[cat] = (summary.byCategory[cat] || 0) + Math.abs(t.amount);
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = summary.byMonth[key] || { income: 0, expense: 0 };
      if (t.amount < 0) bucket.income += Math.abs(t.amount);
      else bucket.expense += t.amount;
      summary.byMonth[key] = bucket;
    }
    return { windowedTransactions: windowed, transactionsSummary: summary };
  }

  private static extractWindowedInvestmentActivities(data: any, invSince: Date) {
    const acts = Array.isArray(data?.investments?.transactions) ? data.investments.transactions : [];
    return acts.filter((a: any) => {
      const d = new Date(a.tradeDate || a.settlementDate || a.date || a.createdAt);
      return !isNaN(d.getTime()) && d >= invSince;
    });
  }
}

export default SummaryCacheService;

