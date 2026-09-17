/**
 * The calculator run a new account starts with.
 *
 * Someone who runs `/retirement-calculator` or `/coast-fire-calculator` and
 * asks us to save it gets an email with a link; the link lands on signup with
 * their address filled in, and choosing a password is the whole of what is
 * left. This turns the run they already saw into the first decision in that
 * account, so the app opens on their own question rather than on an empty
 * state.
 *
 * Two properties are worth stating plainly, because both are load-bearing:
 *
 *  1. **The figures come from the lead, not from a fresh run.** The engines and
 *     their datasets change; a token lives for ninety days. Re-running would
 *     let the saved decision disagree with the email that produced it, over a
 *     difference the reader has no way to see. This is the same reasoning the
 *     signup-context endpoints already follow.
 *  2. **The address must match.** The token is the only key to a lead, and a
 *     lead holds a stranger's retirement figures. Without this check, anyone
 *     holding a forwarded link could register under their own address and copy
 *     that person's plan into their own account.
 *
 * That second check is also what lets registration skip the verification code
 * on this path. A lead token is forty-eight random characters that only ever
 * left this system inside an email to the lead's own address, so presenting
 * one *and* registering that address demonstrates control of the inbox —
 * which is the entire thing the code demonstrates. `resolveCalculatorLead` is
 * therefore resolved **before** the account is created, on the server, from
 * the token alone: a client cannot declare itself verified.
 *
 * Writing the decision, by contrast, may never fail a registration. The caller
 * runs it after responding, and every path returns a reason instead of
 * throwing.
 */

import { getPrismaClient } from '../prisma-client';
import { readRetirementLead, type RetirementLeadRecord } from './retirement-leads';
import { readCoastFireLead, type CoastFireLeadRecord } from './coast-fire-leads';

/** Why a run did not become a decision, for the log and for the tests. */
export type FirstDecisionOutcome =
  | 'seeded'
  /** No token, or one that did not resolve to this address. */
  | 'no-lead'
  | 'already-has-decisions'
  | 'failed';

/**
 * A resolved lead, and which calculator produced it.
 *
 * The two write different decisions, so the kind travels with the record
 * rather than being sniffed back out of its shape later.
 */
export type CalculatorLead =
  | { kind: 'retirement'; lead: RetirementLeadRecord }
  | { kind: 'coast-fire'; lead: CoastFireLeadRecord };

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** A rate the visitor typed as percentage points: 5 becomes "5%", 4.5 "4.5%". */
function rate(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** "a and b", or "a, b, and c" — never a bare run of commas. */
function joinClauses(clauses: string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? '';
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
}

/* ------------------------------------------------------------------ *
 * The retirement quick plan
 * ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ *
 * Coast FIRE
 * ------------------------------------------------------------------ */

/**
 * The same idea for a Coast FIRE run, stated back in the visitor's own terms.
 *
 * The seven numbers include two assumptions the visitor typed rather than
 * facts about them — the return and the withdrawal rate — so the question owns
 * them as assumptions. A follow-up that changes either is the most useful
 * thing they can ask next, and it should read as a thing they chose.
 */
export function buildCoastFireQuestion(lead: CoastFireLeadRecord): string {
  const { inputs } = lead;

  const holdings = [
    `I have ${money(inputs.currentSavings)} in retirement savings`,
    `expect to spend ${money(inputs.annualRetirementSpending)} a year once I stop`,
  ];
  if (inputs.annualRetirementIncome > 0) {
    holdings.push(
      `expect ${money(inputs.annualRetirementIncome)} a year of income from the day I retire`
    );
  }

  return [
    'Have I reached Coast FIRE?',
    `I am ${inputs.currentAge} now and plan to retire at ${inputs.retirementAge}.`,
    `${joinClauses(holdings)}.`,
    `I assumed ${rate(inputs.realReturnRate)} growth a year after inflation and a ` +
    `${rate(inputs.withdrawalRate)} withdrawal rate.`,
  ].join(' ');
}

/**
 * The Coast FIRE answer, as the email stated it.
 *
 * Two things this deliberately does not do. It does not tell anyone whether to
 * keep contributing — reaching the number is a fact about one projection, not
 * permission to stop — and it does not soften the fact that the whole answer
 * rides on a return the visitor typed. Both are the reason the closing line
 * points at the app rather than at the badge.
 */
export function buildCoastFireAnswer(lead: CoastFireLeadRecord): string {
  const { inputs } = lead;
  const portfolioSpendingNeed = Math.max(
    0,
    inputs.annualRetirementSpending - inputs.annualRetirementIncome
  );

  // The scenario that asks nothing of the portfolio. Its Coast FIRE number is
  // zero, and writing "you need $0 invested today" reads as a bug rather than
  // as the answer it is.
  if (portfolioSpendingNeed === 0) {
    return [
      `The retirement income you entered — ${money(inputs.annualRetirementIncome)} a year from ` +
      `age ${inputs.retirementAge} — already covers the ` +
      `${money(inputs.annualRetirementSpending)} a year you plan to spend, so this formula asks ` +
      `nothing of your portfolio at all.`,
      '',
      `**What your savings alone would become:** ${money(inputs.currentSavings)} left untouched ` +
      `for ${inputs.retirementAge - inputs.currentAge} years at ${rate(inputs.realReturnRate)} a ` +
      `year after inflation grows to ${money(lead.projectedSavingsAtRetirement)}.`,
      '',
      coastFireLimitations(inputs.realReturnRate),
    ].join('\n');
  }

  const lines = [
    `On the assumptions you entered, ${lead.hasReachedCoastFire ? 'yes' : 'not yet'}. Your Coast ` +
    `FIRE number was ${money(lead.coastFireNumber)}, and you have ` +
    `${money(inputs.currentSavings)}.`,
    '',
    `That number is what would need to be invested today to reach your retirement target at ` +
    `${inputs.retirementAge} without adding another dollar.`,
    '',
    `**Portfolio needed at ${inputs.retirementAge}:** ${money(lead.retirementTarget)} — the ` +
    `${money(portfolioSpendingNeed)} a year your portfolio would have to cover, at a ` +
    `${rate(inputs.withdrawalRate)} withdrawal rate.`,
    // "$0 grows to $0" is true and reads as a bug. Compounding is the whole
    // idea of the page, and there is nothing here to compound yet.
    inputs.currentSavings === 0
      ? `**If you add nothing further:** nothing. This projection only compounds what you ` +
        `already have, and you entered ${money(0)}.`
      : `**If you add nothing further:** ${money(inputs.currentSavings)} grows to ` +
        `${money(lead.projectedSavingsAtRetirement)} by ${inputs.retirementAge}, at ` +
        `${rate(inputs.realReturnRate)} a year after inflation.`,
  ];

  if (inputs.annualRetirementIncome > 0) {
    lines.push(
      `**Retirement income:** ${money(inputs.annualRetirementIncome)} a year, counted from the ` +
      `day you retire, which is what reduces the ${money(inputs.annualRetirementSpending)} to ` +
      `${money(portfolioSpendingNeed)}.`
    );
  }

  lines.push('', coastFireLimitations(inputs.realReturnRate));
  return lines.join('\n');
}

/** The honest limit of a run made from seven numbers, and what changes it. */
function coastFireLimitations(realReturnRate: number): string {
  return (
    `This came from the free Coast FIRE calculator, so it is a single straight line: ` +
    `${rate(realReturnRate)} every year, with no taxes, fees, account types, healthcare, ` +
    `uneven markets, or income starting later than retirement modeled at all. Connect your ` +
    `accounts and ask me this again to run it against your actual holdings and a century of ` +
    `real market sequences.`
  );
}

/* ------------------------------------------------------------------ *
 * Resolving and writing
 * ------------------------------------------------------------------ */

/** Case- and whitespace-insensitive, since the two addresses arrive separately. */
function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The lead a signup is entitled to, or null.
 *
 * Resolved before the account exists, because two things hang off it: what the
 * first decision is written from, and whether the address needs verifying by
 * code. Both rest on the same check, and it is made here rather than trusted
 * from the request.
 *
 * Both calculators mint tokens from the same forty-eight-character space, so
 * the token alone says which table to look in — the tables are tried in turn
 * rather than the client being asked which calculator it came from. A client
 * that could name the table could not gain anything by lying, but it also has
 * no reason to be asked.
 *
 * Returns null — never throws — for anything that is not a live token
 * belonging to the address being registered.
 */
export async function resolveCalculatorLead(params: {
  token: unknown;
  /** The address being registered. */
  email: string;
}): Promise<CalculatorLead | null> {
  if (typeof params.token !== 'string' || params.token.trim() === '') return null;
  const token = params.token.trim();

  // The control that matters. See the header: a token is the only key to a
  // lead, a lead is somebody's retirement plan, and matching the address is
  // what makes holding the token proof of controlling the inbox.
  const claimable = (resolved: CalculatorLead): CalculatorLead | null => {
    if (sameAddress(resolved.lead.email, params.email)) return resolved;
    console.warn('⚠️  Calculator lead token did not match the registering address.');
    return null;
  };

  // Neither read counts as continuing from the email. `continuedAt` measures
  // the signup page's own exchange, which has already happened by the time
  // anyone reaches this; marking here would also mark it for a forwarded link
  // the address check below is about to refuse.
  const resolving = { markContinuation: false };

  try {
    const retirement = await readRetirementLead(token, new Date(), resolving);
    if (retirement) return claimable({ kind: 'retirement', lead: retirement });

    const coastFire = await readCoastFireLead(token, new Date(), resolving);
    if (coastFire) return claimable({ kind: 'coast-fire', lead: coastFire });

    return null;
  } catch (error) {
    console.error('⚠️  Could not resolve a calculator lead:', error);
    return null;
  }
}

/** The question and answer one resolved lead becomes. */
function composeDecision(resolved: CalculatorLead): { question: string; answer: string } {
  return resolved.kind === 'retirement'
    ? {
      question: buildDecisionQuestion(resolved.lead),
      answer: buildDecisionAnswer(resolved.lead),
    }
    : {
      question: buildCoastFireQuestion(resolved.lead),
      answer: buildCoastFireAnswer(resolved.lead),
    };
}

/**
 * Write a resolved lead as the account's first decision.
 *
 * Takes the lead rather than the token: the caller resolved it before creating
 * the account. Reading it again here would be a second round trip for the same
 * figures; continuation is already recorded on the first successful read.
 */
export async function seedFirstDecisionFromLead(params: {
  userId: string;
  lead: CalculatorLead | null;
}): Promise<FirstDecisionOutcome> {
  const { userId, lead } = params;
  if (!lead) return 'no-lead';

  try {
    const prisma = getPrismaClient();

    // A brand-new account has none, but registration can be retried and this
    // runs unawaited, so two calls must not leave two copies of one run.
    const existing = await prisma.conversation.count({ where: { userId } });
    if (existing > 0) return 'already-has-decisions';

    await prisma.conversation.create({ data: {
      userId, ...composeDecision(lead),
      origin: lead.kind === 'retirement' ? 'calculator_retirement' : 'calculator_coast_fire',
    } });

    return 'seeded';
  } catch (error) {
    console.error('⚠️  Could not seed the first decision from a calculator run:', error);
    return 'failed';
  }
}
