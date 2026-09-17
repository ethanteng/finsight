/**
 * Storing a Coast FIRE result someone asked us to email them.
 *
 * The row exists to serve the link in that email. Its CTA continues into
 * signup with the scenario already in hand, and the only thing the link can
 * carry is an opaque token: page URLs are collected by analytics and appear in
 * browser history, referrers, and screenshots, so the figures themselves must
 * never be in one. The token is random rather than derived from anything, so
 * it cannot be guessed from an address or enumerated from a sequence.
 *
 * The stored copy of the result is what the email said, not what the formula
 * would say today. If the formula changes, the signup page a recipient opens
 * next month must still show the number they were sent.
 */

import type { CoastFireInputs, CoastFireResult } from './coast-fire';
import type { CalculatorLeadAttribution } from './calculator-lead-attribution';
import { generateLeadToken, isLeadToken, leadExpiresAt } from './lead-token';

// Token shape and lifetime are shared with every other calculator that emails
// a result; see `services/lead-token`.
export { generateLeadToken, isLeadToken };

export interface CoastFireLeadRecord {
  token: string;
  email: string;
  inputs: CoastFireInputs;
  /**
   * The figures the email actually carried. Returned so signup can show the
   * same number the inbox shows, even if the browser formula has changed
   * since the message was sent — and so the first decision a saved run
   * becomes states what the reader was actually sent.
   */
  coastFireNumber: number;
  retirementTarget: number;
  projectedSavingsAtRetirement: number;
  hasReachedCoastFire: boolean;
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
export async function recordCoastFireLead(params: {
  email: string;
  token: string;
  result: CoastFireResult;
  attribution?: CalculatorLeadAttribution;
  now?: Date;
}): Promise<boolean> {
  const now = params.now ?? new Date();

  try {
    const { getPrismaClient } = await import('../prisma-client');
    await getPrismaClient().coastFireLead.create({
      data: {
        email: params.email,
        token: params.token,
        currentAge: params.result.currentAge,
        retirementAge: params.result.retirementAge,
        currentSavings: params.result.currentSavings,
        annualRetirementSpending: params.result.annualRetirementSpending,
        annualRetirementIncome: params.result.annualRetirementIncome,
        realReturnRate: params.result.realReturnRate,
        withdrawalRate: params.result.withdrawalRate,
        coastFireNumber: params.result.coastFireNumber,
        retirementTarget: params.result.retirementTarget,
        projectedSavingsAtRetirement: params.result.projectedSavingsAtRetirement,
        hasReachedCoastFire: params.result.hasReachedCoastFire,
        ...params.attribution,
        expiresAt: leadExpiresAt(now),
      } as never,
    });
    return true;
  } catch (error) {
    console.error('⚠️  Could not record Coast FIRE lead:', error);
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
export async function markCoastFireLeadTokenDisclosed(token: string): Promise<boolean> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    await getPrismaClient().coastFireLead.updateMany({
      // First disclosure is the one that counts; a second never un-discloses.
      where: { token, tokenDisclosedAt: null },
      data: { tokenDisclosedAt: new Date() },
    });
    return true;
  } catch (error) {
    console.error('⚠️  Could not mark Coast FIRE lead token disclosure:', error);
    return false;
  }
}

/**
 * Note what happened after the fact. Both flags are bookkeeping for the
 * experiment — which leads actually received mail, which reached MailerLite —
 * and neither is allowed to fail the request that triggered it.
 */
export async function markCoastFireLeadDelivery(
  token: string,
  delivery: { emailSent?: boolean; mailerliteSynced?: boolean },
): Promise<void> {
  try {
    const { getPrismaClient } = await import('../prisma-client');
    await getPrismaClient().coastFireLead.update({
      where: { token },
      data: delivery as never,
    });
  } catch (error) {
    console.error('⚠️  Could not update Coast FIRE lead delivery state:', error);
  }
}

/**
 * The scenario behind a token, for the signup page the email links to.
 * Expired and unknown tokens are the same answer — null — so a caller cannot
 * learn from the response whether a token was ever real.
 */
export async function readCoastFireLead(
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
): Promise<CoastFireLeadRecord | null> {
  if (!isLeadToken(token)) return null;

  try {
    const { getPrismaClient } = await import('../prisma-client');
    const lead = await getPrismaClient().coastFireLead.findUnique({ where: { token } });
    if (!lead || lead.expiresAt <= now) return null;

    // This endpoint is the first-party source of truth for an emailed CTA
    // continuation. `updateMany` makes the write idempotent across reloads and
    // concurrent requests while preserving the time of the first open.
    try {
      if (options.markContinuation !== false) {
        await getPrismaClient().coastFireLead.updateMany({
          where: { token, continuedAt: null },
          data: { continuedAt: now },
        });
      }
    } catch (error) {
      // Personalization is the product request; analytics bookkeeping cannot
      // turn a valid emailed link into a 404.
      console.error('⚠️  Could not mark Coast FIRE lead continuation:', error);
    }

    return {
      token: lead.token,
      email: lead.email,
      inputs: {
        currentAge: lead.currentAge,
        retirementAge: lead.retirementAge,
        currentSavings: lead.currentSavings,
        annualRetirementSpending: lead.annualRetirementSpending,
        annualRetirementIncome: lead.annualRetirementIncome,
        realReturnRate: lead.realReturnRate,
        withdrawalRate: lead.withdrawalRate,
      },
      coastFireNumber: lead.coastFireNumber,
      retirementTarget: lead.retirementTarget,
      projectedSavingsAtRetirement: lead.projectedSavingsAtRetirement,
      hasReachedCoastFire: lead.hasReachedCoastFire,
      tokenDisclosed: lead.tokenDisclosedAt !== null,
    };
  } catch (error) {
    console.error('⚠️  Could not read Coast FIRE lead:', error);
    return null;
  }
}
