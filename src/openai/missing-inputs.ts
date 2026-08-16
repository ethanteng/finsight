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
    }
  }

  // 2. A figure the question needed that the profile does not carry.
  if (needs.needsHomeValue && snapshot.homeValueSummary === HOME_VALUE_UNAVAILABLE) {
    asks.push({
      id: 'home_value',
      message: 'I do not have a current value for your home. Add it under Accounts & profile, or tell me ' +
        'what you think it is worth, and I will factor it in.',
    });
  }

  // 3. A connection that has stopped reporting, which quietly skews every total
  //    derived from it. Stale sources are deliberately not raised here — the
  //    figures are still real, just older, and the dashboard already says so.
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
        'not reporting right now, so the totals above may be incomplete. Reconnecting under Accounts & profile ' +
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
