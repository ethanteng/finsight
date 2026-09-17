/**
 * The calculator run a new account starts with.
 *
 * Someone who runs `/retirement-calculator` and asks us to save it gets an
 * email with a link; the link lands on signup with their address filled in,
 * and choosing a password is the whole of what is left. This turns the run
 * they already saw into the first decision in that account, so the app opens
 * on their own question rather than on an empty state.
 *
 * Two properties are worth stating plainly, because both are load-bearing:
 *
 *  1. **The figures come from the lead, not from a fresh run.** The engine and
 *     its dataset change; a token lives for ninety days. Re-running would let
 *     the saved decision disagree with the email that produced it, over a
 *     difference the reader has no way to see. This is the same reasoning the
 *     signup-context endpoint already follows.
 *  2. **The address must match.** The token is the only key to a lead, and a
 *     lead holds a stranger's retirement figures. Without this check, anyone
 *     holding a forwarded link could register under their own address and copy
 *     that person's plan into their own account.
 *
 * Nothing here may fail a registration. The caller runs it after responding,
 * and every path returns a reason instead of throwing.
 */

import { getPrismaClient } from '../prisma-client';
import { readRetirementLead, type RetirementLeadRecord } from './retirement-leads';

/** Why a run did not become a decision, for the log and for the tests. */
export type FirstDecisionOutcome =
  | 'seeded'
  | 'no-token'
  | 'unknown-token'
  | 'email-mismatch'
  | 'already-has-decisions'
  | 'failed';

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * The question the visitor never typed.
 *
 * A calculator is a form, so there is no prompt to carry over — but a decision
 * with no question reads as a stray note, and the thread it opens needs
 * something for a follow-up to continue from. This states the plan back in the
 * first person, using only figures they entered, so the answer below it
 * answers something.
 */
export function buildDecisionQuestion(lead: RetirementLeadRecord): string {
  const { inputs } = lead;

  // One clause per figure, joined as a list rather than pushed into one run of
  // commas: Social Security is a second independent clause, and comma-joining
  // it to the first is a splice that reads as a typo in the user's own words.
  const holdings = [
    `I have ${money(inputs.investableAssets)} invested`,
    `expect to spend ${money(inputs.annualSpending)} a year in retirement`,
  ];
  if (inputs.annualContributions > 0) {
    holdings.push(`am saving ${money(inputs.annualContributions)} a year until then`);
  }

  const sentences = [
    `Can I retire at ${inputs.retirementAge}?`,
    `I am ${inputs.currentAge} now.`,
    `${joinClauses(holdings)}.`,
  ];

  if (inputs.socialSecurityAnnual > 0) {
    sentences.push(
      `I also expect ${money(inputs.socialSecurityAnnual)} a year of Social Security from age ` +
      `${inputs.socialSecurityStartAge}.`
    );
  }

  return sentences.join(' ');
}

/** "a and b", or "a, b, and c" — never a bare run of commas. */
function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? '';
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

/**
 * The answer, as the email stated it.
 *
 * Deliberately the emailed figures rather than a fresh run or a model-written
 * reading: this is a record of the answer they were given, and it has to still
 * say that a year later. The closing line is the honest limit of a run made
 * from six numbers, and the reason the app is worth opening.
 */
export function buildDecisionAnswer(lead: RetirementLeadRecord): string {
  const { inputs, outcome } = lead;
  const failed = outcome.sequencesTested - outcome.sequencesSurvived;

  const lines = [
    `Retiring at ${inputs.retirementAge} worked in ` +
    `${outcome.sequencesSurvived.toLocaleString('en-US')} of the ` +
    `${outcome.sequencesTested.toLocaleString('en-US')} retirements in market history we could ` +
    `test it against — ${percent(outcome.survivalRate)}.`,
    '',
    `Each test is a real, month-by-month stretch of US market returns and inflation, running ` +
    `from age ${inputs.currentAge} through age ${inputs.lifeExpectancy}, with your contributions ` +
    `before retirement and your spending after it.`,
    '',
    `**Portfolio at ${inputs.retirementAge}:** ` +
    `${money(outcome.projectedPortfolioAtRetirement)} — the median across those histories, in ` +
    `today's dollars.`,
    `**First-year withdrawal rate:** ${percent(outcome.firstYearWithdrawalRate, 2)} of that ` +
    `portfolio.`,
    failed > 0
      ? `**Histories that ran short:** ${failed.toLocaleString('en-US')}.`
      : `**Histories that ran short:** none.`,
  ];

  if (inputs.socialSecurityAnnual > 0) {
    lines.push(
      `**Social Security:** ${money(inputs.socialSecurityAnnual)} a year from age ` +
      `${inputs.socialSecurityStartAge}, modeled as an inflation-adjusted income that reduces ` +
      `what the portfolio has to cover.`
    );
  }

  lines.push(
    '',
    `This came from the free retirement calculator, so the asset mix behind it is the ` +
    `${inputs.allocation} preset rather than anything you own — and taxes, fees and account ` +
    `types are not modeled at all. Connect your accounts and ask me this again to replace the ` +
    `preset with your actual holdings.`
  );

  return lines.join('\n');
}

/**
 * Turn a saved calculator run into the account's first decision.
 *
 * Returns why it did or did not, and never throws: registration has already
 * succeeded by the time this runs, and a missing first decision is a worse
 * home screen, not a failed signup.
 */
export async function seedRetirementFirstDecision(params: {
  userId: string;
  /** The address that just registered, lowercased by the caller. */
  email: string;
  /** The lead token from the emailed link, if this signup carried one. */
  token: unknown;
}): Promise<FirstDecisionOutcome> {
  const { userId, email } = params;
  if (typeof params.token !== 'string' || params.token.trim() === '') return 'no-token';

  try {
    const lead = await readRetirementLead(params.token.trim());
    if (!lead) return 'unknown-token';

    // The control that matters. See the header: a token is the only key to a
    // lead, and a lead is somebody's retirement plan.
    if (lead.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
      console.warn('⚠️  Retirement lead token did not match the registering address; not seeding.');
      return 'email-mismatch';
    }

    const prisma = getPrismaClient();

    // A brand-new account has none, but registration can be retried and this
    // runs unawaited, so two calls must not leave two copies of one run.
    const existing = await prisma.conversation.count({ where: { userId } });
    if (existing > 0) return 'already-has-decisions';

    await prisma.conversation.create({
      data: {
        userId,
        question: buildDecisionQuestion(lead),
        answer: buildDecisionAnswer(lead),
      },
    });

    return 'seeded';
  } catch (error) {
    console.error('⚠️  Could not seed the first decision from a calculator run:', error);
    return 'failed';
  }
}
