import { getPrismaClient } from '../prisma-client';

export type CalculatorLeadKind = 'coast_fire' | 'retirement';

export interface CalculatorLeadSummary {
  state: 'live' | 'error';
  periodStart: string;
  periodEnd: string;
  requests: number | null;
  emailsSent: number | null;
  uniqueEmails: number | null;
  mailerliteSynced: number | null;
  continuedToSignup: number | null;
  matchedAccounts: number | null;
  deliveryRate: number | null;
  continuationRate: number | null;
  accountMatchRate: number | null;
  note: string;
}

export interface CalculatorLeadRow {
  email: string;
  emailSent: boolean;
  mailerliteSynced: boolean;
  continuedAt: Date | null;
  createdAt: Date;
}

export interface CalculatorLeadAccountRow {
  email: string;
  createdAt: Date;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

/**
 * Build a live, calendar-day window for first-party lead records. Unlike the
 * GA4 daily export window, this deliberately includes the current UTC day up
 * to the instant the report is requested.
 */
export function liveCalculatorLeadPeriod(
  days: number,
  now: Date = new Date(),
): { periodStart: Date; periodEndExclusive: Date } {
  const safeDays = Math.max(1, Math.floor(days));
  const periodEndExclusive = new Date(now);
  const periodStart = new Date(Date.UTC(
    periodEndExclusive.getUTCFullYear(),
    periodEndExclusive.getUTCMonth(),
    periodEndExclusive.getUTCDate(),
  ));
  periodStart.setUTCDate(periodStart.getUTCDate() - (safeDays - 1));
  return { periodStart, periodEndExclusive };
}

/**
 * Produce only aggregates. Addresses are used for a first-party equality join
 * in memory and never leave the backend response.
 */
export function buildCalculatorLeadSummary(args: {
  leads: CalculatorLeadRow[];
  accounts: CalculatorLeadAccountRow[];
  periodStart: Date;
  periodEndExclusive: Date;
}): CalculatorLeadSummary {
  const { leads, accounts, periodStart, periodEndExclusive } = args;
  const firstLeadByEmail = new Map<string, Date>();
  for (const lead of leads) {
    const email = lead.email.trim().toLowerCase();
    const previous = firstLeadByEmail.get(email);
    if (!previous || lead.createdAt < previous) firstLeadByEmail.set(email, lead.createdAt);
  }

  const matchedAccounts = new Set(
    accounts.flatMap(account => {
      const email = account.email.trim().toLowerCase();
      const firstLeadAt = firstLeadByEmail.get(email);
      return firstLeadAt && account.createdAt >= firstLeadAt ? [email] : [];
    }),
  ).size;
  const emailsSent = leads.filter(lead => lead.emailSent).length;
  const continuedToSignup = leads.filter(lead => lead.continuedAt !== null).length;
  const uniqueEmails = firstLeadByEmail.size;

  return {
    state: 'live',
    periodStart: isoDate(periodStart),
    periodEnd: isoDate(new Date(periodEndExclusive.getTime() - 1)),
    requests: leads.length,
    emailsSent,
    uniqueEmails,
    mailerliteSynced: leads.filter(lead => lead.mailerliteSynced).length,
    continuedToSignup,
    matchedAccounts,
    deliveryRate: ratio(emailsSent, leads.length),
    continuationRate: ratio(continuedToSignup, emailsSent),
    accountMatchRate: ratio(matchedAccounts, uniqueEmails),
    note: 'Live first-party lead records. “Continued” is the first successful emailed-link scenario exchange; matched accounts use a normalized email equality join and are counted only when the account was created after the first lead in this window.',
  };
}

export function unavailableCalculatorLeadSummary(
  periodStart: Date,
  periodEndExclusive: Date,
): CalculatorLeadSummary {
  return {
    state: 'error',
    periodStart: isoDate(periodStart),
    periodEnd: isoDate(new Date(periodEndExclusive.getTime() - 1)),
    requests: null,
    emailsSent: null,
    uniqueEmails: null,
    mailerliteSynced: null,
    continuedToSignup: null,
    matchedAccounts: null,
    deliveryRate: null,
    continuationRate: null,
    accountMatchRate: null,
    note: 'The first-party calculator lead store could not be read. These values are unavailable, not zero.',
  };
}

export async function calculatorLeadSummary(
  kind: CalculatorLeadKind,
  periodStart: Date,
  periodEndExclusive: Date,
): Promise<CalculatorLeadSummary> {
  const prisma = getPrismaClient();
  const where = { createdAt: { gte: periodStart, lt: periodEndExclusive } };
  const select = {
    email: true,
    emailSent: true,
    mailerliteSynced: true,
    continuedAt: true,
    createdAt: true,
  } as const;
  const leads: CalculatorLeadRow[] = kind === 'coast_fire'
    ? await prisma.coastFireLead.findMany({ where, select })
    : await prisma.retirementLead.findMany({ where, select });
  const emails = [...new Set(leads.map(lead => lead.email.trim().toLowerCase()))];
  const accounts = emails.length === 0
    ? []
    : await prisma.user.findMany({
      where: {
        email: { in: emails },
        createdAt: { gte: periodStart, lt: periodEndExclusive },
      },
      select: { email: true, createdAt: true },
    });

  return buildCalculatorLeadSummary({ leads, accounts, periodStart, periodEndExclusive });
}
