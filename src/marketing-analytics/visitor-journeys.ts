import { aggregateSignupConversionFunnel } from './funnel';
import type { AnalyticsSession } from './types';

export interface VisitorJourneyStep {
  id: string;
  label: string;
  sessions: number;
  continuedRate: number | null;
  droppedSessions: number | null;
  dropoffRate: number | null;
  /** Form events observed after signup view, in the same cohort as this step. */
  breakdown?: VisitorJourneyStep[];
  /** Sessions with missing/out-of-order form events. Suppress diagnostic losses. */
  breakdownTrackingGapSessions?: number;
}

export interface VisitorJourney {
  id: string;
  label: string;
  device: string;
  steps: VisitorJourneyStep[];
}

export interface VisitorJourneys {
  state: 'available' | 'unavailable';
  ratesAvailable: boolean;
  period: { start: string; end: string };
  note: string;
  rows: VisitorJourney[];
}

/** These paths are nested same-session cohorts, not a subtraction of independent
 * event totals or a join to first-party emails/accounts. First-occurrence timing
 * is conservative: retries after an out-of-order first occurrence aren't inferred.
 */
export function buildVisitorJourneys(
  sessions: AnalyticsSession[],
  options: { available: boolean; ratesAvailable: boolean; period: VisitorJourneys['period'] },
): VisitorJourneys {
  const result: VisitorJourneys = {
    state: options.available ? 'available' : 'unavailable',
    ratesAvailable: options.available && options.ratesAvailable,
    period: options.period,
    note: 'One count per session at each main step. Every later main step requires the earlier main steps in order. Account creation requires an observed sign_up after signup view, not form-start or form-submit events. Form diagnostics are separate; missing or out-of-order form events suppress their drop-off rates, not confirmed conversions. Drop-off means the next step was not observed in that session, not that the person never returned. First-occurrence timestamps can undercount retries. Signup handoff is not proof the app loaded or the email was verified.',
    rows: [],
  };
  if (!options.available) return result;
  const devices = [...new Set(['all', 'mobile', 'desktop', ...sessions.map(session => session.device)])];
  const steps = (counts: Array<[string, string, number]>, trackingComplete = true): VisitorJourneyStep[] => counts.map(([id, label, count], index) => {
    const prior = index ? counts[index - 1][2] : 0;
    const measurable = index > 0 && prior > 0 && result.ratesAvailable && trackingComplete;
    return {
      id, label, sessions: count,
      continuedRate: measurable ? count / prior : null,
      droppedSessions: measurable ? prior - count : null,
      dropoffRate: measurable ? (prior - count) / prior : null,
    };
  });

  const attachFormDiagnostics = (account: VisitorJourneyStep, cohort: AnalyticsSession[]) => {
    const viewed = cohort.filter(session => session.firstEventAt.trial_signup_viewed !== undefined);
    const afterView = (session: AnalyticsSession, event: string) => {
      const at = session.firstEventAt[event];
      return at !== undefined && at >= session.firstEventAt.trial_signup_viewed!;
    };
    // Check each session, not just aggregate counts: equal totals can hide gaps
    // in different sessions. No synthetic start/submit events are inserted.
    const gaps = viewed.filter(session => {
      const started = afterView(session, 'trial_signup_started');
      const submitted = afterView(session, 'trial_signup_submit');
      const orderedSubmit = started && submitted
        && session.firstEventAt.trial_signup_submit! >= session.firstEventAt.trial_signup_started!;
      return (session.firstEventAt.trial_signup_started !== undefined && !started)
        || (session.firstEventAt.trial_signup_submit !== undefined && !submitted)
        || (submitted && !orderedSubmit) || (afterView(session, 'sign_up')
        && (!orderedSubmit || session.firstEventAt.sign_up! < session.firstEventAt.trial_signup_submit!));
    }).length;
    account.breakdownTrackingGapSessions = gaps;
    account.breakdown = steps([
      ['trial_signup_viewed', 'Reached signup', viewed.length],
      ['trial_signup_started', 'Started the form', viewed.filter(session => afterView(session, 'trial_signup_started')).length],
      ['trial_signup_submit', 'Submitted the form', viewed.filter(session => afterView(session, 'trial_signup_submit')).length],
      ['sign_up', 'Created an account', account.sessions],
    ], gaps === 0);
  };

  for (const device of devices) {
    const population = sessions.filter(session => device === 'all' || session.device === device);
    for (const calculator of ['retirement', 'coast_fire'] as const) {
      const label = calculator === 'retirement' ? 'Retirement calculator' : 'Coast FIRE calculator';
      const path = calculator === 'retirement' ? '/retirement-calculator' : '/coast-fire-calculator';
      const resultEvent = calculator === 'retirement' ? 'retirement_model_run' : 'coast_fire_calculated';
      const ctaEvent = calculator === 'retirement' ? 'quickplan_cross_sell_click' : 'coast_fire_plan_cta_click';
      const landed = population.filter(session => session.acquisition.landingPage.replace(/\/$/, '') === path);
      const calculated = landed.filter(session => session.firstEventAt[resultEvent] !== undefined);
      const continueAt = (session: AnalyticsSession) => {
        const after = session.firstEventAt[resultEvent]!;
        const times = [session.firstEventAt[`${calculator}_results_emailed`], session.firstEventAt[ctaEvent]]
          .filter((at): at is number => at !== undefined && at >= after);
        return times.length ? Math.min(...times) : undefined;
      };
      const continued = calculated.filter(session => continueAt(session) !== undefined);
      const viewed = continued.filter(session => session.signupOrigin === `${calculator}_calculator`
        && ['results_page', 'calculator_cta'].includes(session.signupEntry || '')
        && session.firstEventAt.trial_signup_viewed !== undefined
        && session.firstEventAt.trial_signup_viewed >= continueAt(session)!);
      const signup = aggregateSignupConversionFunnel(viewed);
      const calculatorSteps = steps([
        ['landed', 'Landed on the calculator', landed.length],
        ['result', 'Got a result', calculated.length],
        ['continue', 'Saved results or chose to sign up', continued.length],
        ['signup', 'Reached signup', viewed.length],
        ['account', 'Created an account', signup[1].sessions!],
        ['handoff', 'Continued to the app', signup[2].sessions!],
      ]);
      // Keep the overview compact without attributing form abandonment to the
      // registration request. These use the SAME result/continuation cohort,
      // not the broader signup-origin cohort reported separately below.
      attachFormDiagnostics(calculatorSteps[4], viewed);
      result.rows.push({ id: calculator, label, device, steps: calculatorSteps });
    }

    const signupPaths: Array<{ id: string; label: string; origin?: string; entry?: string }> = [
      { id: 'signup', label: 'All signup visits' },
      ...(['retirement', 'coast_fire'] as const).flatMap(calculator => {
        const name = calculator === 'retirement' ? 'Retirement' : 'Coast FIRE';
        return [
          { id: `signup_${calculator}`, label: `${name} · all signup routes`, origin: `${calculator}_calculator` },
          ...[
            ['results_page', 'Save results'], ['results_email', 'Email return'], ['calculator_cta', 'Calculator signup button'],
          ].map(([entry, label]) => ({ id: `signup_${calculator}_${entry}`, label: `${name} · ${label}`, origin: `${calculator}_calculator`, entry })),
        ];
      }),
    ];
    for (const path of signupPaths) {
      const cohort = population.filter(session => (!path.origin || session.signupOrigin === path.origin)
        && (!path.entry || session.signupEntry === path.entry));
      const labels = ['Reached signup', 'Created an account', 'Continued to the app'];
      const funnel = aggregateSignupConversionFunnel(cohort);
      const signupSteps = steps(funnel.map((step, index) => [step.event, labels[index], step.sessions!]));
      attachFormDiagnostics(signupSteps[1], cohort);
      result.rows.push({ id: path.id, label: path.label, device, steps: signupSteps });
    }
  }
  return result;
}
