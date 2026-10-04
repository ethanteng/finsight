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
import {
  COAST_FIRE_CALCULATOR_ID,
  type CoastFireScenarioExecution,
} from '../scenarios/coast-fire-scenario';
import {
  STATED_RETIREMENT_PLAN_CALCULATOR_ID,
  type StatedRetirementPlanExecution,
} from '../scenarios/stated-retirement-plan-scenario';

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

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * What to say when a retirement question met an account with no holdings
 * linked -- or nothing, when a calculator's own disclosure already asks the
 * user for the figures that would answer it.
 *
 * This used to be one sentence: no projection, link an account. Everyone the
 * public calculators send here arrives in exactly that state, so the first
 * follow-up they asked ended on a wall with no reason given. Two calculators
 * now answer those questions from stated figures, and when one has, linking
 * is no longer the price of an answer. It is the upgrade, and the note says
 * concretely what it would change about the answer they just read.
 */
function noHoldingsAsk(
  executions: FinancialContextSnapshot['scenarioExecutions']
): MissingInputAsk | null {
  const stated = executions?.[STATED_RETIREMENT_PLAN_CALCULATOR_ID] as StatedRetirementPlanExecution | undefined;
  const coastFire = executions?.[COAST_FIRE_CALCULATOR_ID] as CoastFireScenarioExecution | undefined;

  if (stated?.status === 'completed' && stated.scenarios[0]) {
    const mix = stated.scenarios[0].allocation;
    return {
      id: 'retirement_link_for_holdings',
      message: 'Link your investment accounts and ask again, and I will run your actual holdings and balances ' +
        `through the same history instead of the ${mix.label} preset. The mix is what decides how a portfolio ` +
        'rides out a bad decade, and any international funds you hold get modeled against their own returns.',
    };
  }
  if (coastFire?.status === 'completed' && coastFire.scenarios[0]) {
    const m = coastFire.scenarios[0].metrics;
    // The holdings-based projection models spending, not a pension against it,
    // so the amount is named only when the two are the same thing.
    const spending = m.annualRetirementIncome === 0
      ? `, then paying ${money(m.annualRetirementSpending)} a year`
      : '';
    return {
      id: 'coast_fire_link_for_holdings',
      message: 'Link your investment accounts and ask again, and I will also run what you actually hold — left ' +
        `alone from ${m.currentAge} to ${m.retirementAge}${spending} — through a century of real market history. ` +
        `Markets never deliver ${Number(m.realReturnRate.toFixed(2))}% every year, so that shows how often ` +
        'coasting from today would actually have worked, not just whether one average return clears the bar.',
    };
  }
  // The calculator is already asking for the figures that would answer this,
  // and offering the link as the alternative. A second paragraph about the
  // same gap would bury that ask.
  if (
    (stated?.status === 'unavailable' && stated.missingInputs?.length) ||
    (coastFire?.status === 'unavailable' && coastFire.missingInputs?.length)
  ) {
    return null;
  }
  return {
    id: 'retirement_no_holdings',
    message: 'I have not run a historical retirement projection because no investment holdings are linked yet. ' +
      'That projection runs your actual mix of stocks, bonds and cash through a century of real market ' +
      'history, so it needs the holdings themselves, not just a total. Link an investment account and ask ' +
      'again — or tell me roughly how much you have invested, what you expect to spend a year in retirement, ' +
      'your age and when you want to retire, and I will test it on a preset mix in the meantime.',
  };
}

export function collectMissingInputAsks(
  snapshot: Pick<FinancialContextSnapshot,
    'retirementAnalysisNeedsInfo' | 'homeValueSummary' | 'financialSummary' | 'scenarioExecutions'>,
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
      const ask = noHoldingsAsk(snapshot.scenarioExecutions);
      if (ask) asks.push(ask);
    } else if (needsInfo?.unavailableCode === 'no_supported_simulation') {
      asks.push({
        id: 'retirement_no_supported_simulation',
        message:
          'I could not run a retirement projection because none of your holdings map to a supported ' +
          'historical return series (US equity, international equity, nominal US government bonds, or cash). ' +
          'TIPS, credit, international bonds, real assets, and unresolved equity geography are disclosed ' +
          'but not simulated.',
      });
    } else if (needsInfo?.unavailableCode === 'unmapped_negative_holding') {
      const holding = needsInfo.blockingHoldingLabel;
      asks.push({
        id: 'retirement_unmapped_negative_holding',
        message:
          `I could not run a retirement projection because ${holding ? `"${holding}"` : 'one of your holdings'} ` +
          'has a negative balance I cannot match to an asset class. Dropping it would overstate your ' +
          'portfolio and I will not guess a return for it, so check that position under Accounts & ' +
          'context — asking again on its own will not change the result.',
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
  //
  // Advisory account annotations (`:holdings-coverage`, `:balance-derived`) are
  // also excluded: the balance is present; reconnecting cannot change them, and
  // telling the user a connection "stopped reporting" would be false.
  const quality = snapshot.financialSummary?.quality;
  const isConnectionGap = (id: string) =>
    !id.endsWith(':holdings-coverage') && !id.endsWith(':balance-derived');
  const unavailableSources = new Set(
    [
      ...(quality?.requiredUnavailableSourceIds || []),
      ...(quality?.unavailableSourceIds || []),
    ].filter(isConnectionGap),
  );
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
