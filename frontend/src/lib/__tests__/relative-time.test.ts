import { relativeTurnTime } from '../relative-time';

/**
 * The turns of one decision are minutes apart. If the label can't tell those
 * apart, a whole sitting reads as having happened at the same moment.
 */
describe('relativeTurnTime', () => {
  const now = new Date('2026-08-16T12:00:00Z').getTime();
  const minutes = (count: number) => count * 60_000;

  it('separates turns made minutes apart within the same sitting', () => {
    expect(relativeTurnTime(now - minutes(2), now)).toBe('2m ago');
    expect(relativeTurnTime(now - minutes(17), now)).toBe('17m ago');
    expect(relativeTurnTime(now - minutes(59), now)).toBe('59m ago');
  });

  it('reserves "Just now" for the last minute', () => {
    expect(relativeTurnTime(now, now)).toBe('Just now');
    expect(relativeTurnTime(now - 59_000, now)).toBe('Just now');
    expect(relativeTurnTime(now - minutes(1), now)).toBe('1m ago');
  });

  it('reads a turn timestamped ahead of the clock as just now', () => {
    // A server clock leading the browser's must not produce "-1m ago".
    expect(relativeTurnTime(now + minutes(3), now)).toBe('Just now');
  });

  it('switches to hours and then to a date', () => {
    expect(relativeTurnTime(now - minutes(60), now)).toBe('1h ago');
    expect(relativeTurnTime(now - minutes(23 * 60 + 59), now)).toBe('23h ago');
    expect(relativeTurnTime(now - minutes(25 * 60), now)).toBe(
      new Date(now - minutes(25 * 60)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    );
  });
});
