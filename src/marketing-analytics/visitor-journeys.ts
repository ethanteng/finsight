import { aggregateTrialFunnel } from './funnel';
import type { AnalyticsSession } from './types';

export interface VisitorJourneyStep {
  id: string;
  label: string;
  sessions: number;
  continuedRate: number | null;
  droppedSessions: number | null;
  dropoffRate: number | null;
  /** Ordered boundaries inside a compact step, with the preceding step as base. */
  breakdown?: VisitorJourneyStep[];
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
    note: 'One count per session at each step. Every later step requires the earlier steps in order. Drop-off means the next step was not observed in that session, not that the person never returned. First-occurrence timestamps can undercount retries. Signup handoff is not proof the app loaded or the email was verified.',
    rows: [],
  };
  if (!options.available) return result;
  const devices = [...new Set(['all', 'mobile', 'desktop', ...sessions.map(session => session.device)])];
  const steps = (counts: Array<[string, string, number]>): VisitorJourneyStep[] => counts.map(([id, label, count], index) => {
    const prior = index ? counts[index - 1][2] : 0;
    const measurable = index > 0 && prior > 0 && result.ratesAvailable;
    return {
      id, label, sessions: count,
      continuedRate: measurable ? count / prior : null,
      droppedSessions: measurable ? prior - count : null,
      dropoffRate: measurable ? (prior - count) / prior : null,
    };
  });

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
      const signup = aggregateTrialFunnel(viewed);
      const calculatorSteps = steps([
        ['landed', 'Landed on the calculator', landed.length],
        ['result', 'Got a result', calculated.length],
        ['continue', 'Saved results or chose to sign up', continued.length],
        ['signup', 'Reached signup', viewed.length],
        ['account', 'Created an account', signup[3].sessions!],
        ['handoff', 'Continued to the app', signup[4].sessions!],
      ]);
      // Keep the overview compact without attributing form abandonment to the
      // registration request. These use the SAME result/continuation cohort,
      // not the broader signup-origin cohort reported separately below.
      calculatorSteps[4].breakdown = steps(signup.slice(0, 4).map((step, index) => [
        step.event, ['Reached signup', 'Started the form', 'Submitted the form', 'Created an account'][index], step.sessions!,
      ]));
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
      const labels = ['Reached signup', 'Started the form', 'Submitted the form', 'Created an account', 'Continued to the app'];
      const funnel = aggregateTrialFunnel(cohort);
      result.rows.push({ id: path.id, label: path.label, device,
        steps: steps(funnel.map((step, index) => [step.event, labels[index], step.sessions!])),
      });
    }
  }
  return result;
}
