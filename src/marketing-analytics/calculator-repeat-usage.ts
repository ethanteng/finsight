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
      const calculating = sessions.filter(s => (device === 'all' || s.device === device)
        && (s.eventCounts[event] || 0) > 0);
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
      });
    }
  }
  return {
    state: 'available', rows,
    bothCalculators: devices.map(device => ({ device, sessions: sessions.filter(s =>
      (device === 'all' || s.device === device)
      && (s.eventCounts[EVENTS.retirement] || 0) > 0
      && (s.eventCounts[EVENTS.coast_fire] || 0) > 0).length })),
    note: 'Observed successful result events, grouped by visitor + GA4 session. Repeat means 2+ runs of the same calculator in one session, including unchanged inputs. Clicks, errors, and the Coast FIRE default example do not count. Start-free rates mean a click anywhere in the same session, not necessarily after a run; this is an association, not evidence that rerunning causes conversion. Uses the dashboard date and traffic filters. Missing or duplicate tracking can affect counts; zero observed runs does not verify tracking coverage.',
  };
}
