/**
 * End-to-end audit: real authenticated user, connected data, canonical snapshot,
 * retirement analysis, canonical-facts response grounding, and lazy evidence.
 *
 * Usage:
 *   npx ts-node scripts/audit-canonical-facts-e2e.ts [--skip-snaptrade-wait]
 *
 * Prerequisites:
 *   - Backend running on BASE_URL (default http://localhost:3000)
 *   - ANTHROPIC_API_KEY configured; optionally ENABLE_RESPONSE_VALIDATION=true
 *   - SnapTrade connected for user (or run with computer/browser flow first)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:3000';
const SKIP_SNAPTRADE_WAIT = process.argv.includes('--skip-snaptrade-wait');
const SNAPTRADE_POLL_MS = 15000;
const SNAPTRADE_MAX_POLLS = 40;

type Json = Record<string, unknown>;

interface AuditIssue {
  severity: 'error' | 'warn' | 'info';
  category: string;
  message: string;
}

interface AuthoritativeMetrics {
  netWorth?: number;
  totalCash?: number;
  totalInvestments?: number;
  totalDebt?: number;
  homeValue?: number | null;
  withdrawalRate?: number;
  survivalRate?: number;
  yearsOfExpenses?: number;
  equityAllocation?: number;
  annualWithdrawalAmount?: number;
  currentAge?: number;
  retirementAge?: number;
}

function log(step: string, detail?: unknown) {
  console.log(`\n[audit] ${step}`);
  if (detail !== undefined) console.log(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
}

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<{ status: number; body: Json }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 300000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let body: Json = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function createPlaidSandboxPublicToken(): Promise<string> {
  const res = await fetch('https://sandbox.plaid.com/sandbox/public_token/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      institution_id: 'ins_109508',
      initial_products: ['transactions', 'investments', 'assets', 'liabilities'],
      options: {
        webhook: 'https://www.example.com/webhook',
      },
    }),
  });
  const data = (await res.json()) as Json;
  if (!res.ok || typeof data.public_token !== 'string') {
    throw new Error(`Plaid sandbox public_token create failed: ${JSON.stringify(data)}`);
  }
  return data.public_token;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function extractAuthoritativeFromManifest(showTheMath: Json): AuthoritativeMetrics {
  const manifest = (showTheMath.evidenceManifest || {}) as Json;
  const facts = (manifest.facts || []) as Json[];
  const value = (id: string) => num(facts.find((fact) => fact.id === id)?.value);
  const metrics: AuthoritativeMetrics = {
    netWorth: value('net_worth'),
    totalCash: value('total_cash'),
    totalInvestments: value('total_investments'),
    totalDebt: value('total_debt'),
    homeValue: value('home_value') ?? null,
    withdrawalRate: value('withdrawal_rate'),
    survivalRate: value('survival_rate'),
    yearsOfExpenses: value('years_of_expenses'),
    equityAllocation: value('equity_allocation'),
    annualWithdrawalAmount: value('annual_withdrawal_amount'),
    currentAge: value('retirement_current_age'),
    retirementAge: value('retirement_age'),
  };
  return metrics;
}

async function seedManualAccountsAndHoldings(token: string, userId: string): Promise<void> {
  const manualAccounts = [
    { name: 'Audit Checking', amount: 85000, type: 'cash' },
    { name: 'Audit Brokerage (manual)', amount: 650000, type: 'investment' },
    { name: 'Audit Mortgage', amount: 320000, type: 'mortgage' },
  ];
  for (const acct of manualAccounts) {
    await api('/api/manual-accounts', { method: 'POST', token, body: acct });
  }

  const securities = [
    { security_id: 'audit-sec-vti', ticker_symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'etf' },
    { security_id: 'audit-sec-vxus', ticker_symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', type: 'etf' },
    { security_id: 'audit-sec-bnd', ticker_symbol: 'BND', name: 'Vanguard Total Bond Market ETF', type: 'etf' },
  ];
  const holdings = [
    { security_id: 'audit-sec-vti', ticker_symbol: 'VTI', security_name: 'VTI', institution_value: 450000, quantity: 1800 },
    { security_id: 'audit-sec-vxus', ticker_symbol: 'VXUS', security_name: 'VXUS', institution_value: 120000, quantity: 2000 },
    { security_id: 'audit-sec-bnd', ticker_symbol: 'BND', security_name: 'BND', institution_value: 80000, quantity: 1000 },
  ];
  const totalHoldingsValue = holdings.reduce((s, h) => s + h.institution_value, 0);

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.financialSummarySnapshot.findUnique({ where: { userId } });
    const overview = {
      netWorth: 85000 + 650000 - 320000,
      totalCash: 85000,
      totalInvestments: 650000,
      totalDebt: 320000,
      homeValue: null,
    };
    const investmentPortfolio = {
      totalValue: totalHoldingsValue,
      holdingCount: holdings.length,
      securityCount: securities.length,
      assetAllocation: [
        { type: 'Equity', value: 570000, percentage: 87.7 },
        { type: 'Fixed Income', value: 80000, percentage: 12.3 },
      ],
    };
    const payload = {
      financialOverview: overview,
      investmentPortfolio,
      holdings,
      securities,
      computedAt: new Date(),
    };
    if (existing) {
      await prisma.financialSummarySnapshot.update({
        where: { userId },
        data: payload,
      });
    } else {
      await prisma.financialSummarySnapshot.create({
        data: { userId, ...payload },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

function verifyKeyNumbersAgainstManifest(keyNumbers: Record<string, unknown> | undefined, showTheMath: Json): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (!keyNumbers) return [{ severity: 'warn', category: 'key_numbers', message: 'No key_numbers in structured response' }];
  const manifest = (showTheMath.evidenceManifest || {}) as Json;
  const facts = (manifest.facts || []) as Json[];
  for (const [key, rawMetric] of Object.entries(keyNumbers)) {
    if (!rawMetric || typeof rawMetric !== 'object') {
      issues.push({
        severity: 'error',
        category: 'key_numbers',
        message: `${key} does not use the typed value/unit/provenance schema`,
      });
      continue;
    }
    const metric = rawMetric as Json;
    const fact = facts.find((candidate) => candidate.id === metric.provenance);
    if (!fact || num(metric.value) !== num(fact.value) || metric.unit !== fact.unit) {
      issues.push({
        severity: 'error',
        category: 'key_numbers',
        message: `${key} does not exactly match its cited canonical fact`,
      });
    }
  }
  return issues;
}

async function waitForSnapTradeAccounts(token: string): Promise<boolean> {
  if (SKIP_SNAPTRADE_WAIT) {
    log('Skipping SnapTrade wait (--skip-snaptrade-wait)');
    return false;
  }

  for (let i = 0; i < SNAPTRADE_MAX_POLLS; i++) {
    const { status, body } = await api('/snaptrade/accounts', { token });
    const accounts = ((body.data as Json)?.accounts || body.accounts) as Json[] | undefined;
    if (status === 200 && Array.isArray(accounts) && accounts.length > 0) {
      log(`SnapTrade connected with ${accounts.length} account(s)`, accounts.map((a) => a.name));
      return true;
    }
    if (i === 0) {
      const login = await api('/snaptrade/login', { method: 'POST', token });
      if (login.status === 200) {
        const redirect = ((login.body.data as Json)?.redirectURI || (login.body.data as Json)?.redirectUri) as string | undefined;
        if (redirect) {
          log('Complete SnapTrade sandbox connection in browser, then polling /snaptrade/accounts', redirect);
        }
      }
    }
    log(`Waiting for SnapTrade accounts (${i + 1}/${SNAPTRADE_MAX_POLLS})...`);
    await new Promise((r) => setTimeout(r, SNAPTRADE_POLL_MS));
  }
  return false;
}

async function main() {
  const issues: AuditIssue[] = [];
  const email = `audit-math-${Date.now()}@example.com`;
  const password = 'AuditTest123!';

  log('Health check');
  const health = await api('/health');
  if (health.status !== 200) throw new Error(`Backend unhealthy: ${health.status}`);

  log('Register authenticated user', { email });
  const register = await api('/auth/register', {
    method: 'POST',
    body: { email, password, tier: 'premium' },
  });
  if (register.status !== 201 || typeof register.body.token !== 'string') {
    throw new Error(`Registration failed: ${register.status} ${JSON.stringify(register.body)}`);
  }
  const token = register.body.token as string;
  const userId = (register.body.user as Json)?.id as string;
  log('Registered', { userId });

  // Bounded personal context only accepts allowlisted biographical fields.
  // Retirement age, spending goals, and risk tolerance must come from the
  // question / scenario path — they are intentionally not stored here.
  log('Set remembered personal context age for retirement analysis');
  await api('/profile', {
    method: 'PUT',
    token,
    body: {
      memory: { age: 48 },
    },
  });

  let plaidConnected = false;
  try {
    log('Create Plaid sandbox public token');
    const publicToken = await createPlaidSandboxPublicToken();
    log('Exchange Plaid public token');
    const exchange = await api('/plaid/exchange_public_token', {
      method: 'POST',
      token,
      body: { public_token: publicToken },
    });
    if (exchange.status === 200 && exchange.body.access_token) {
      plaidConnected = true;
      log('Sync Plaid transactions (triggers snapshot compute)');
      await api('/plaid/sync_transactions', {
        method: 'POST',
        token,
        body: { access_token: exchange.body.access_token },
        timeoutMs: 600000,
      });
    } else {
      issues.push({
        severity: 'warn',
        category: 'plaid',
        message: `Plaid sandbox connect failed (${exchange.status}): ${JSON.stringify(exchange.body)}`,
      });
    }
  } catch (err) {
    issues.push({
      severity: 'warn',
      category: 'plaid',
      message: `Plaid sandbox unavailable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (!plaidConnected) {
    await seedManualAccountsAndHoldings(token, userId);
  }

  log('Initialize SnapTrade');
  await api('/snaptrade/init', { method: 'POST', token });
  const snapTradeConnected = await waitForSnapTradeAccounts(token);
  if (!snapTradeConnected) {
    issues.push({
      severity: 'warn',
      category: 'snaptrade',
      message: 'SnapTrade accounts not detected before timeout; continuing with Plaid-only data',
    });
  }

  log('Recompute financial summary snapshot');
  const refresh = await api('/api/refresh-summary', { method: 'POST', token, timeoutMs: 600000 });
  if (refresh.status !== 200) {
    throw new Error(`Snapshot refresh failed: ${refresh.status} ${JSON.stringify(refresh.body)}`);
  }

  // refresh-summary rebuilds from live providers and drops seeded ticker holdings; re-apply after refresh
  if (!plaidConnected && !snapTradeConnected) {
    await seedManualAccountsAndHoldings(token, userId);
  }
  const overview = await api('/api/finances/overview', { token });
  if (overview.status !== 200) {
    throw new Error(`Finances overview fetch failed: ${overview.status} ${JSON.stringify(overview.body)}`);
  }
  log('Snapshot refresh complete', {
    netWorth: (overview.body.financialOverview as Json | undefined)?.netWorth,
    totalInvestments: (overview.body.financialOverview as Json | undefined)?.totalInvestments,
  });

  const question =
    'Based on my current portfolio and retirement analysis, am I on track to retire at 68 with $100,000 per year in withdrawals? Show net worth, withdrawal rate, survival rate, and years of expenses covered.';

  log('POST /ask/display-real (canonical-facts pipeline)');
  const ask = await api('/ask/display-real', {
    method: 'POST',
    token,
    body: { question },
    timeoutMs: 600000,
  });
  if (ask.status !== 200) {
    throw new Error(`/ask/display-real failed: ${ask.status} ${JSON.stringify(ask.body)}`);
  }

  const conversationId = ask.body.conversationId as string | undefined;
  const structured = (ask.body.structuredResponse || ask.body.structured || {}) as Json;
  const keyNumbers = structured.key_numbers as Record<string, unknown> | undefined;
  const displayText = (ask.body.answer || ask.body.displayText || '') as string;

  log('Ask response received', {
    conversationId,
    summaryPreview: String(structured.summary || displayText).slice(0, 200),
    keyNumbers,
  });

  if (!conversationId) throw new Error('No conversationId returned from /ask/display-real');

  log('Fetch Show the Math payload');
  const stm = await api(`/conversations/${conversationId}/show-the-math`, { token });
  if (stm.status !== 200) {
    throw new Error(`show-the-math fetch failed: ${stm.status} ${JSON.stringify(stm.body)}`);
  }
  const showTheMath = (stm.body.showTheMathData || stm.body) as Json;

  const manifest = showTheMath.evidenceManifest as Json | undefined;
  if (!manifest) {
    issues.push({ severity: 'error', category: 'manifest', message: 'Canonical evidence manifest is missing' });
  }
  const validation = (manifest?.validation || {}) as Json;
  const deterministic = (validation.deterministic || {}) as Json;
  if (deterministic.valid !== true) {
    issues.push({ severity: 'error', category: 'grounding', message: `Deterministic validation did not pass: ${JSON.stringify(deterministic.issues)}` });
  }
  if ('claudeFirstCall' in showTheMath || 'geminiValidation' in showTheMath) {
    issues.push({ severity: 'error', category: 'manifest', message: 'Show the Math still persists raw prompts or model responses' });
  }

  const authority = extractAuthoritativeFromManifest(showTheMath);
  log('Authoritative manifest metrics', authority);

  const metricChecks: Array<{ label: string; value?: number; required?: boolean }> = [
    { label: 'netWorth', value: authority.netWorth, required: true },
    { label: 'totalCash', value: authority.totalCash },
    { label: 'totalInvestments', value: authority.totalInvestments, required: true },
    { label: 'totalDebt', value: authority.totalDebt },
    { label: 'withdrawalRate', value: authority.withdrawalRate, required: true },
    { label: 'survivalRate', value: authority.survivalRate, required: true },
    { label: 'yearsOfExpenses', value: authority.yearsOfExpenses, required: true },
    { label: 'equityAllocation', value: authority.equityAllocation },
  ];

  for (const check of metricChecks) {
    if (check.required && check.value === undefined) {
      issues.push({ severity: 'error', category: check.label, message: 'Required canonical fact is missing from the manifest' });
    }
  }

  issues.push(...verifyKeyNumbersAgainstManifest(keyNumbers, showTheMath));

  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');

  console.log('\n' + '='.repeat(80));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(80));
  console.log(`User: ${email} (${userId})`);
  console.log(`Conversation: ${conversationId}`);
  console.log(`Plaid connected: ${plaidConnected ? 'yes' : 'no (used manual+holdings fallback)'}`);
  console.log(`SnapTrade connected: ${snapTradeConnected ? 'yes' : 'no'}`);
  console.log(`Deterministic grounding: ${String(deterministic.valid)}`);
  console.log(`Errors: ${errors.length}, Warnings: ${warns.length}`);

  if (errors.length) {
    console.log('\nErrors:');
    for (const e of errors) console.log(`  [${e.category}] ${e.message}`);
  }
  if (warns.length) {
    console.log('\nWarnings:');
    for (const w of warns) console.log(`  [${w.category}] ${w.message}`);
  }

  const reportPath = `/workspace/logs/audit-canonical-facts-${Date.now()}.json`;
  const fs = await import('fs');
  fs.mkdirSync('/workspace/logs', { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        email,
        userId,
        conversationId,
        plaidConnected,
        snapTradeConnected,
        authority,
        keyNumbers,
        validation,
        issues,
        askSummary: structured.summary,
      },
      null,
      2
    )
  );
  log(`Wrote report ${reportPath}`);

  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error('\n[audit] FATAL', err);
  process.exit(1);
});
