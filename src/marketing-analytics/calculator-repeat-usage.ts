import type { AnalyticsSession, CalculatorRepeatUsage, CalculatorRepeatRow } from './types';

const EVENTS = {
  retirement: 'retirement_model_run',
  coast_fire: 'coast_fire_calculated',
} as const;
const ratio = (n: number, d: number) => d > 0 ? n / d : null;

/** Input is the dashboard's period- and quality-filtered session population.
 * The BigQuery adapter groups by user_pseudo_id AND ga_session_id, and counts
 * only submitted Coast FIRE calculations (not the default example result).
 * Do not use the mutually exclusive beachhead cohorts: a session can run both.
 */
export function buildCalculatorRepeatUsage(
  sessions: AnalyticsSession[],
  available: boolean,
): CalculatorRepeatUsage {
  if (!available) return {
    state: 'unavailable', rows: [], bothCalculators: [],
    note: 'Repeat-run reporting requires a successful, untruncated GA4 BigQuery session export. Missing data is not zero usage.',
  };
  const devices = ['all', 'desktop', 'mobile', ...new Set(sessions.map(s => s.device)
    .filter(device => !['all', 'desktop', 'mobile'].includes(device)))];
  const rows: CalculatorRepeatRow[] = [];
  for (const calculator of ['retirement', 'coast_fire'] as const) {
    const event = EVENTS[calculator];
    for (const device of devices) {
      const deviceSessions = sessions.filter(s => device === 'all' || s.device === device);
      const limitSessions = deviceSessions.filter(s => (s.eventCounts[`${calculator}_run_limit_reached`] || 0) > 0);
      const accountsAfterLimitSessions = limitSessions.filter(s => {
        const limitAt = s.firstEventAt[`${calculator}_run_limit_reached`];
        const accountAt = s.firstEventAt[`${calculator}_account_created`];
        return limitAt !== undefined && accountAt !== undefined && accountAt > limitAt;
      }).length;
      const calculating = deviceSessions.filter(s => (s.eventCounts[event] || 0) > 0);
      const distribution: [number, number, number, number] = [0, 0, 0, 0];
      let runs = 0;
      let singleRunCtaSessions = 0;
      let repeatRunCtaSessions = 0;
      for (const session of calculating) {
        const count = session.eventCounts[event];
        runs += count;
        distribution[Math.min(count, 4) - 1]++;
        if ((session.eventCounts.start_free_click || 0) > 0) {
          if (count === 1) singleRunCtaSessions++;
          else repeatRunCtaSessions++;
        }
      }
      const repeatSessions = calculating.length - distribution[0];
      rows.push({ calculator, device, sessions: calculating.length, runs, repeatSessions,
        repeatRate: ratio(repeatSessions, calculating.length),
        averageRuns: ratio(runs, calculating.length), distribution,
        singleRunCtaSessions, repeatRunCtaSessions,
        singleRunCtaRate: ratio(singleRunCtaSessions, distribution[0]),
        repeatRunCtaRate: ratio(repeatRunCtaSessions, repeatSessions),
        limitReachedSessions: limitSessions.length,
        accountsAfterLimitSessions,
      });
    }
  }
  return {
    state: 'available', rows,
    bothCalculators: devices.map(device => ({ device, sessions: sessions.filter(s =>
      (device === 'all' || s.device === device)
      && (s.eventCounts[EVENTS.retirement] || 0) > 0
      && (s.eventCounts[EVENTS.coast_fire] || 0) > 0).length })),
    note: 'Observed successful result events, grouped by visitor + GA4 session. Repeat means 2+ runs of the same calculator in one session, including unchanged inputs. Clicks, errors, and the Coast FIRE default example do not count. The new limit allows three savable results per calculator per browser tab, not per GA4 session; retirement rates-only results do not consume the limit. Keep 4+ for older traffic, multiple tabs, and storage restrictions. Limit counts require the new limit event and include restored locks without a run in this session. Accounts after limit require a later free-trial sign_up attributed to that calculator in the same session; they do not prove the limit caused signup. Start-free rates still measure literal CTA clicks, not automatic save-results redirects. Missing tracking is not proof of zero usage.',
  };
}
