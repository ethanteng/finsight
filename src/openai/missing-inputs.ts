/**
 * What the user could supply to make the next answer better.
 *
 * The pipeline knows when it is working without something — a retirement input
 * nobody has given, a home with no value, an account connection that stopped
 * reporting. Until now that knowledge only ever went to the model, buried in the
 * context pack, and the model answered around it. The person who can fix any of
 * it is the user, so the answer says so.
 *
 * Two rules keep this from becoming noise:
 *  - Only ask about something the question actually needed.
 *  - Only ask for what the user can act on. A failing pricing service is our
 *    problem, not theirs, and telling them about it is just an apology.
 */

import { describeMissingRetirementInputs } from './retirement-inputs';
import type { FinancialContextSnapshot, QuestionNeeds } from './types';

export interface MissingInputAsk {
  /** Stable identifier for telemetry; never shown to the user. */
  id: string;
  message: string;
}

/** More than a couple of asks stops reading as help and starts reading as a form. */
const MAX_ASKS = 2;

const HOME_VALUE_UNAVAILABLE = 'Home value data is currently unavailable.';

/**
 * "Shorten the timeline" is not an instruction anyone can follow. The engine
 * knows how far its record reaches, so say which timeline would work, and why
 * this portfolio's record is shorter than the full history when it is.
 */
function describeHistoryLimit(
  limit: NonNullable<FinancialContextSnapshot['retirementAnalysisNeedsInfo']>['historyLimit']
): string {
  const because = limit?.limitedByInternationalHistory
    ? 'Because your portfolio holds international equity, I model it against the developed-international record, which is shorter than the US one'
    : 'I model against the complete historical record for the asset classes you hold';
  const span = limit?.firstMonth && limit.lastMonth
    ? ` (${limit.firstMonth} through ${limit.lastMonth})`
    : '';

  if (!limit || limit.maxTimelineYears <= 0) {
    return `${because}${span}, and it is too short to project this portfolio at all. ` +
      'I would rather say so than invent returns to fill the gap.';
  }

  const target = limit.maxTimelineAge != null
    ? `through age ${limit.maxTimelineAge}`
    : `about ${limit.maxTimelineYears} years out`;
  return `That timeline runs past the history I can model. ${because}${span}, ` +
    `so ask again ${target} or earlier and I will run the projection without inventing returns.`;
}

export function collectMissingInputAsks(
  snapshot: Pick<FinancialContextSnapshot,
    'retirementAnalysisNeedsInfo' | 'homeValueSummary' | 'financialSummary'>,
  needs: Pick<QuestionNeeds, 'needsRetirement' | 'needsHomeValue'>
): MissingInputAsk[] {
  const asks: MissingInputAsk[] = [];
  const needsInfo = snapshot.retirementAnalysisNeedsInfo;

  // 1. Inputs for an analysis the question asked for, which only the user has.
  if (needs.needsRetirement) {
    const retirementAsk = describeMissingRetirementInputs(needsInfo);
    if (retirementAsk) {
      asks.push({ id: 'retirement_inputs', message: retirementAsk });
    } else if (needsInfo?.unavailableCode === 'no_holdings') {
      asks.push({
        id: 'retirement_no_holdings',
        message: 'I could not run a retirement projection because no investment holdings are connected. ' +
          'Link an investment account and ask again, and I will include it.',
      });
    } else if (needsInfo?.unavailableCode === 'no_supported_simulation') {
      asks.push({
        id: 'retirement_no_supported_simulation',
        message:
          'I could not run a retirement projection because none of your holdings map to a supported ' +
          'historical return series (US equity, international equity, nominal US government bonds, or cash). ' +
          'TIPS, credit, international bonds, real assets, and unresolved equity geography are disclosed ' +
          'but not simulated.',
      });
    } else if (needsInfo?.unavailableCode === 'insufficient_history') {
      asks.push({
        id: 'retirement_insufficient_history',
        message: describeHistoryLimit(needsInfo.historyLimit),
      });
    }
  }

  // 2. A figure the question needed that the profile does not carry.
  if (needs.needsHomeValue && snapshot.homeValueSummary === HOME_VALUE_UNAVAILABLE) {
    asks.push({
      id: 'home_value',
      message: 'I do not have a current value for your home. Add it under Accounts & context, or tell me ' +
        'what you think it is worth, and I will factor it in.',
    });
  }

  // 3. A connection that has stopped reporting, which quietly skews every total
  //    derived from it. Stale sources are deliberately not raised here — the
  //    figures are still real, just older than our refresh window, and no user
  //    action (including refresh) can clear that.
  const quality = snapshot.financialSummary?.quality;
  const unavailableSources = new Set([
    ...(quality?.requiredUnavailableSourceIds || []),
    ...(quality?.unavailableSourceIds || []),
  ]);
  if (unavailableSources.size > 0) {
    const count = unavailableSources.size;
    asks.push({
      id: 'unavailable_sources',
      message: `${count === 1 ? 'One of your account connections is' : `${count} of your account connections are`} ` +
        'not reporting right now, so the totals above may be incomplete. Reconnecting under Accounts & context ' +
        'will fill the gap.',
    });
  }

  return asks.slice(0, MAX_ASKS);
}

/** The asks as one block of text, or null when there is nothing to ask for. */
export function describeMissingInputs(
  snapshot: Parameters<typeof collectMissingInputAsks>[0],
  needs: Parameters<typeof collectMissingInputAsks>[1]
): string | null {
  const asks = collectMissingInputAsks(snapshot, needs);
  return asks.length === 0 ? null : asks.map((ask) => ask.message).join('\n\n');
}
