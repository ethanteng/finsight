/**
 * Storing a retirement quick plan someone asked us to email them.
 *
 * The counterpart to `coast-fire-leads`, and it follows the same two rules.
 *
 * The row serves the link in that email: its CTA continues into signup with
 * the plan already in hand, and the only thing the link can carry is an opaque
 * token, because page URLs are collected by analytics and appear in browser
 * history, referrers, and screenshots.
 *
 * And the stored verdict is the one that was sent, not one recomputed later.
 * The model is deterministic given its inputs, but both the engine and the
 * checked-in dataset it runs against change over time, and a recipient opening
 * the link months later has to see the figures their inbox shows.
 */

import type { RetirementQuickPlanResult } from './retirement-quickplan';
import type { CalculatorLeadAttribution } from './calculator-lead-attribution';
import { generateLeadToken, isLeadToken, leadExpiresAt } from './lead-token';

export { generateLeadToken, isLeadToken };

/** The plan as submitted, after the model normalized it. */
export type RetirementLeadInputs = RetirementQuickPlanResult['inputs'];

/** The figures the signup page shows back, exactly as the email stated them. */
export interface RetirementLeadOutcome {
  survivalRate: number;
  sequencesTested: number;
  sequencesSurvived: number;
  projectedPortfolioAtRetirement: number;
  firstYearWithdrawalRate: number;
}

export interface RetirementLeadRecord {
  token: string;
  email: string;
  inputs: RetirementLeadInputs;
  outcome: RetirementLeadOutcome;
  /**
   * Whether this token has been handed to a browser as well as emailed.
   *
   * Registration skips the emailed verification code for someone presenting a
   * token whose lead names the address they are registering — holding one is
   * evidence of controlling that inbox, because it went nowhere else. Once the
   * page that asked for the email has been given the token too, that stops
   * being true: whoever typed the address received it. The lead still seeds a
   * first decision; it just cannot verify the address any more.
   */
  tokenDisclosed: boolean;
}

/**
 * Record the lead, and return whether it stored. A failure here must not stop
 * the email: the visitor asked for their results, and a full or unreachable
 * analytics table is not a reason to withhold them. The caller falls back to a
 * plain signup link when this returns false.
 */
export async function recordRetirementLead(params: {
  email: string;
  token: string;
  inputs: RetirementLeadInputs;
  outcome: RetirementLeadOutcome;
  attribution?: CalculatorLeadAttribution;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();

  try {
    const { getPrismaClient } = await import('../prisma-client');
    await getPrismaClient().retirementLead.create({
      data: {
        email: params.email,
        token: params.token,
        currentAge: params.inputs.currentAge,
        retirementAge: params.inputs.retirementAge,
        investableAssets: params.inputs.investableAssets,
        annualSpending: params.inputs.annualSpending,
        annualContributions: params.inputs.annualContributions,
        socialSecurityAnnual: params.inputs.socialSecurityAnnual,
        socialSecurityStartAge: params.inputs.socialSecurityStartAge,
        lifeExpectancy: params.inputs.lifeExpectancy,
        allocation: params.inputs.allocation,
        survivalRate: params.outcome.survivalRate,
        sequencesTested: params.outcome.sequencesTested,
        sequencesSurvived: params.outcome.sequencesSurvived,
        projectedPortfolioAtRetirement: params.outcome.projectedPortfolioAtRetirement,
        firstYearWithdrawalRate: params.outcome.firstYearWithdrawalRate,
        ...params.attribution,
        expiresAt: leadExpiresAt(now),
      } as never,
    });
    return true;
  } catch (error) {
    console.error('⚠️  Could not record retirement lead:', error);
    return false;
  }
}

/**
 * Record that this token is about to be handed to the browser, and report
 * whether that is now durable.
 *
 * Unlike the delivery flags beside it, this one is allowed to fail the thing
 * it describes. The caller discloses the token only on true: the column is
 * what withholds the emailed verification code from a token its own page was
 * given, so a token disclosed while the mark was lost would be one that still
 * proves an address nobody proved. Failing closed costs the visitor a
 * redirect and nothing else — their results are still in their inbox.
 */
export async function markRetirementLeadTokenDisclosed(token: string): Promise<boolean> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    await getPrismaClient().retirementLead.updateMany({
      // First disclosure is the one that counts; a second never un-discloses.
      where: { token, tokenDisclosedAt: null },
      data: { tokenDisclosedAt: new Date() },
    });
    return true;
  } catch (error) {
    console.error('⚠️  Could not mark retirement lead token disclosure:', error);
    return false;
  }
}

/**
 * Note what happened after the fact. Both flags are bookkeeping for the
 * experiment — which leads actually received mail, which reached MailerLite —
 * and neither is allowed to fail the request that triggered it.
 */
export async function markRetirementLeadDelivery(
  token: string,
  delivery: { emailSent?: boolean; mailerliteSynced?: boolean },
): Promise<void> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    await getPrismaClient().retirementLead.update({
      where: { token },
      data: delivery as never,
    });
  } catch (error) {
    console.error('⚠️  Could not update retirement lead delivery state:', error);
  }
}

/**
 * The plan behind a token, for the signup page the email links to.
 * Expired and unknown tokens are the same answer — null — so a caller cannot
 * learn from the response whether a token was ever real.
 */
export async function readRetirementLead(
  token: string,
  now: Date = new Date(),
  /**
   * Whether reading counts as the recipient continuing from the email.
   *
   * True for the signup page's own exchange, which is what `continuedAt`
   * measures. False for registration, which resolves the token again to decide
   * whether it may seed a first decision and skip the verification code — and
   * gets there by way of an address match that can refuse. Marking before that
   * refusal would count a forwarded link opened by somebody else as the
   * recipient continuing.
   */
  options: { markContinuation?: boolean } = {},
): Promise<RetirementLeadRecord | null> {
  if (!isLeadToken(token)) return null;

  try {
    const { getPrismaClient } = await import('../prisma-client');
    const lead = await getPrismaClient().retirementLead.findUnique({ where: { token } });
    if (!lead || lead.expiresAt <= now) return null;

    // Persist the first successful emailed CTA continuation. Reloads and
    // concurrent exchanges do not move the timestamp forward.
    try {
      if (options.markContinuation !== false) {
        await getPrismaClient().retirementLead.updateMany({
          where: { token, continuedAt: null },
          data: { continuedAt: now },
        });
      }
    } catch (error) {
      console.error('⚠️  Could not mark retirement lead continuation:', error);
    }

    return {
      token: lead.token,
      email: lead.email,
      inputs: {
        currentAge: lead.currentAge,
        retirementAge: lead.retirementAge,
        investableAssets: lead.investableAssets,
        annualSpending: lead.annualSpending,
        annualContributions: lead.annualContributions,
        socialSecurityAnnual: lead.socialSecurityAnnual,
        socialSecurityStartAge: lead.socialSecurityStartAge,
        lifeExpectancy: lead.lifeExpectancy,
        allocation: lead.allocation as RetirementLeadInputs['allocation'],
      },
      // Read back rather than recomputed, so a change to the engine or its
      // dataset cannot make this disagree with the message in the inbox.
      outcome: {
        survivalRate: lead.survivalRate,
        sequencesTested: lead.sequencesTested,
        sequencesSurvived: lead.sequencesSurvived,
        projectedPortfolioAtRetirement: lead.projectedPortfolioAtRetirement,
        firstYearWithdrawalRate: lead.firstYearWithdrawalRate,
      },
      tokenDisclosed: lead.tokenDisclosedAt !== null,
    };
  } catch (error) {
    console.error('⚠️  Could not read retirement lead:', error);
    return null;
  }
}
