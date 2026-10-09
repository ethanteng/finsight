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
import { spendingLinked, type LinkedData } from './linked-data';
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
  executions: FinancialContextSnapshot['scenarioExecutions'],
  linked: LinkedData | undefined
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
    // The market-history test already ran on a preset, so what linking adds
    // is the user's own mix in its place.
    const tested = coastFire.scenarios.find((scenario) => scenario.historicalTest)?.historicalTest;
    if (tested) {
      return {
        id: 'coast_fire_link_for_holdings',
        message: 'Link your investment accounts and ask again, and I will run that market-history test on what ' +
          `you actually hold instead of the ${tested.allocation.label} preset. The mix is what decides how a ` +
          'portfolio rides out a bad decade, and any international funds you hold get modeled against their own returns.',
      };
    }
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
  // The calculator already spoke: either it is asking for the figures, or it
  // explained why the stated run could not finish (a bad age, a refused
  // input). A second paragraph about linking would bury that, and for a
  // validation failure it would also imply linking could fix something it
  // cannot.
  if (stated?.status === 'unavailable' || coastFire?.status === 'unavailable') {
    return null;
  }
  // An investment balance the user entered is already the amount invested;
  // asking for it again would tell them Linc ignored it.
  const statedFigures = (linked?.entered?.investments ?? 0) > 0
    ? 'what you expect to spend a year in retirement, your age and when you want to retire, and I will test ' +
      'the investment balance you entered on a preset mix in the meantime.'
    : 'roughly how much you have invested, what you expect to spend a year in retirement, your age and when ' +
      'you want to retire, and I will test it on a preset mix in the meantime.';
  return {
    id: 'retirement_no_holdings',
    message: 'I have not run a historical retirement projection because no investment holdings are linked yet. ' +
      'That projection runs your actual mix of stocks, bonds and cash through a century of real market ' +
      'history, so it needs the holdings themselves, not just a total. Link an investment account and ask ' +
      `again — or tell me ${statedFigures}`,
  };
}

/** Whether a calculator already ran market history on a preset in place of the holdings. */
function presetStoodIn(executions: FinancialContextSnapshot['scenarioExecutions']): boolean {
  const stated = executions?.[STATED_RETIREMENT_PLAN_CALCULATOR_ID] as StatedRetirementPlanExecution | undefined;
  const coastFire = executions?.[COAST_FIRE_CALCULATOR_ID] as CoastFireScenarioExecution | undefined;
  return (stated?.status === 'completed' && stated.scenarios.length > 0) ||
    (coastFire?.status === 'completed' && coastFire.scenarios.some((scenario) => scenario.historicalTest));
}

type AskNeeds = Pick<QuestionNeeds, 'needsRetirement' | 'needsHomeValue'> &
  Partial<Pick<QuestionNeeds, 'needsInvestments' | 'needsTransactionDetails' | 'needsMonthlyCashFlow' | 'needsCashFlowForecast'>>;

/**
 * What linking one specific kind of account would change about this answer.
 *
 * Ask Linc answers with what it has, so linking is never the price of an
 * answer. It is the upgrade, and this says what the upgrade is, concretely,
 * for the data this question needed and the account it would come from. One
 * note at most, the most specific that applies:
 *
 *  - a question about spending or cash flow, with no checking account or card
 *    to read it from (or, with only a card, no income);
 *  - a question about investments, with no brokerage or retirement account;
 *  - otherwise a question about the user's own money, with nothing linked.
 *
 * Nothing is said when the account is linked but has not reported yet, which
 * the user cannot act on, or when the question is general rather than about
 * their money. Debt is never raised: no linked card or loan is as likely to
 * mean no debt as unlinked debt.
 *
 * A balance the user entered by hand is not linked: it has no transactions or
 * holdings behind it. Linking is still the upgrade, and where the answer used
 * an entered balance the note says linking replaces it.
 */
function linkingAsk(
  linked: LinkedData | undefined,
  needs: AskNeeds,
  personalDataQuestion: boolean
): MissingInputAsk | null {
  // A general question is the same for anyone, whatever packs it drew: the
  // fallback plan selects every pack, so packs alone cannot say it is personal.
  if (!linked || !personalDataQuestion) return null;
  const cashFlowNeeded = Boolean(
    needs.needsTransactionDetails || needs.needsMonthlyCashFlow || needs.needsCashFlowForecast
  );
  if (cashFlowNeeded && linked.cash === 0 && linked.credit === 0) {
    return {
      id: 'link_for_cash_flow',
      message: 'Link the checking account your pay lands in, and the cards you spend on, and I will answer this ' +
        'from your actual money: what you really spend each month and on what, which bills recur, and what is ' +
        'left after them.',
    };
  }
  if (cashFlowNeeded && linked.cash === 0 && spendingLinked(linked)) {
    return {
      id: 'link_for_income',
      message: 'Link the checking account your pay lands in, and I will add what actually comes in each month, so ' +
        'this can show what is left after your spending rather than the spending alone.',
    };
  }
  if (needs.needsInvestments && linked.investments === 0) {
    return {
      id: 'link_for_investments',
      message: (linked.entered?.investments ?? 0) > 0
        ? 'Link your brokerage and retirement accounts in place of the balance you entered, and I will look at ' +
          'what you actually hold: your real mix of stocks and bonds, what each fund charges, and where you are ' +
          'concentrated.'
        : 'Link your brokerage and retirement accounts, and I will look at what you actually hold: your real ' +
          'mix of stocks and bonds, what each fund charges, and where you are concentrated.',
    };
  }
  if (linked.accounts === 0) {
    return {
      id: 'link_anything',
      message: (linked.entered?.accounts ?? 0) > 0
        ? 'Link your accounts and I will answer this from live numbers instead of the balances you entered and ' +
          'general rules of thumb: balances that stay current, what comes in and goes out each month, and what ' +
          'you hold.'
        : 'Link your accounts and I will answer this from your real numbers instead of what you have told ' +
          'me and general rules of thumb: your actual balances, what comes in and goes out each month, and what ' +
          'you hold.',
    };
  }
  return null;
}

export function collectMissingInputAsks(
  snapshot: Pick<FinancialContextSnapshot,
    'retirementAnalysisNeedsInfo' | 'homeValueSummary' | 'financialSummary' | 'scenarioExecutions'> &
    Partial<Pick<FinancialContextSnapshot, 'linkedData'>>,
  needs: AskNeeds,
  context: { personalDataQuestion?: boolean } = {}
): MissingInputAsk[] {
  const asks: MissingInputAsk[] = [];
  const needsInfo = snapshot.retirementAnalysisNeedsInfo;

  // 1. Inputs for an analysis the question asked for, which only the user has.
  if (needs.needsRetirement) {
    const retirementAsk = describeMissingRetirementInputs(needsInfo);
    if (retirementAsk) {
      asks.push({ id: 'retirement_inputs', message: retirementAsk });
    } else if (needsInfo?.unavailableCode === 'no_holdings') {
      const ask = noHoldingsAsk(snapshot.scenarioExecutions, snapshot.linkedData);
      if (ask) asks.push(ask);
    } else if (needsInfo?.unavailableCode === 'no_supported_simulation') {
      // A preset may have stood in already; then this is the reason it did,
      // not a projection that failed to happen.
      const lead = presetStoodIn(snapshot.scenarioExecutions)
        ? 'The preset stood in for your holdings because none of them map'
        : 'I could not run a retirement projection because none of your holdings map';
      asks.push({
        id: 'retirement_no_supported_simulation',
        message:
          `${lead} to a supported ` +
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

  // 2. What linking would add, when the retirement path has not already said
  //    it: a retirement question with nothing linked gets its own, more
  //    specific note above, or none at all while a calculator asks for figures.
  const retirementSpokeToLinking = needs.needsRetirement && needsInfo?.unavailableCode === 'no_holdings';
  if (!retirementSpokeToLinking) {
    const ask = linkingAsk(snapshot.linkedData, needs, context.personalDataQuestion ?? false);
    if (ask) asks.push(ask);
  }

  // 3. A figure the question needed that the profile does not carry.
  if (needs.needsHomeValue && snapshot.homeValueSummary === HOME_VALUE_UNAVAILABLE) {
    asks.push({
      id: 'home_value',
      message: 'I do not have a current value for your home. Add it under Accounts & context, or tell me ' +
        'what you think it is worth, and I will factor it in.',
    });
  }

  // 4. A connection that has stopped reporting, which quietly skews every total
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
  needs: Parameters<typeof collectMissingInputAsks>[1],
  context: Parameters<typeof collectMissingInputAsks>[2] = {}
): string | null {
  const asks = collectMissingInputAsks(snapshot, needs, context);
  return asks.length === 0 ? null : asks.map((ask) => ask.message).join('\n\n');
}
