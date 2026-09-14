import { getPrismaClient } from '../prisma-client';
import { calendarDateInTimeZone, instantAtStartOfCalendarDate } from '../domain/time-zone';
import {
  hasLeadAttribution,
  hasPaidLeadAttribution,
  type CalculatorLeadAttribution,
} from './calculator-lead-attribution';

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
  attributionCaptured: number | null;
  paidAttributionCaptured: number | null;
  deliveryRate: number | null;
  continuationRate: number | null;
  accountMatchRate: number | null;
  attributionRate: number | null;
  note: string;
}

export interface CalculatorLeadRow extends CalculatorLeadAttribution {
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

const REPORTING_TIME_ZONE = 'America/Los_Angeles';
const reportingDate = (value: Date): string => calendarDateInTimeZone(value, REPORTING_TIME_ZONE);

function nextCalendarDate(value: string): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Match first-party lead rows to the settled GA4 reporting calendar. */
export function calculatorLeadPeriodForReportingWindow(
  periodStart: string,
  periodEnd: string,
): { periodStart: Date; periodEndExclusive: Date } {
  return {
    periodStart: instantAtStartOfCalendarDate(periodStart, REPORTING_TIME_ZONE),
    periodEndExclusive: instantAtStartOfCalendarDate(nextCalendarDate(periodEnd), REPORTING_TIME_ZONE),
  };
}

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
  const attributionCaptured = leads.filter(hasLeadAttribution).length;
  const paidAttributionCaptured = leads.filter(hasPaidLeadAttribution).length;

  return {
    state: 'live',
    periodStart: reportingDate(periodStart),
    periodEnd: reportingDate(new Date(periodEndExclusive.getTime() - 1)),
    requests: leads.length,
    emailsSent,
    uniqueEmails,
    mailerliteSynced: leads.filter(lead => lead.mailerliteSynced).length,
    continuedToSignup,
    matchedAccounts,
    attributionCaptured,
    paidAttributionCaptured,
    deliveryRate: ratio(emailsSent, leads.length),
    continuationRate: ratio(continuedToSignup, emailsSent),
    accountMatchRate: ratio(matchedAccounts, uniqueEmails),
    attributionRate: ratio(attributionCaptured, leads.length),
    note: 'First-party lead records for the same completed calendar window as GA4. “Continued” is the first successful emailed-link scenario exchange; matched accounts use a normalized email equality join and are counted only when the account was created after the first lead in this window.',
  };
}

export function unavailableCalculatorLeadSummary(
  periodStart: Date,
  periodEndExclusive: Date,
): CalculatorLeadSummary {
  return {
    state: 'error',
    periodStart: reportingDate(periodStart),
    periodEnd: reportingDate(new Date(periodEndExclusive.getTime() - 1)),
    requests: null,
    emailsSent: null,
    uniqueEmails: null,
    mailerliteSynced: null,
    continuedToSignup: null,
    matchedAccounts: null,
    attributionCaptured: null,
    paidAttributionCaptured: null,
    deliveryRate: null,
    continuationRate: null,
    accountMatchRate: null,
    attributionRate: null,
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
    landingPage: true,
    referrer: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
    utmTerm: true,
    utmContent: true,
    gclid: true,
    gbraid: true,
    wbraid: true,
    gaClientId: true,
    gaSessionId: true,
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
