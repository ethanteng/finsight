/**
 * How a past turn's age is written in the decision sidebar.
 *
 * The turns of one decision are usually minutes apart, so a bucket an hour wide
 * labels every one of them identically and the list stops saying anything about
 * when things happened. Minutes are the granularity that actually separates the
 * turns of a sitting.
 */
export function relativeTurnTime(timestamp: number, now: number = Date.now()): string {
  const elapsedMs = now - timestamp;
  // Also catches a timestamp slightly ahead of the clock — a turn answered
  // seconds ago against a server whose clock leads the browser's.
  if (elapsedMs < 60_000) return 'Just now';

  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 24) return `${hours}h ago`;

  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
