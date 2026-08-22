/**
 * Email when a target-date registry source publishes something other than what
 * its entry records.
 *
 * #165 made divergence detectable, but only by opening the admin panel — and
 * nobody opens a panel to check on something that is usually fine. This pushes.
 *
 * Sends when a source has drifted, and separately when the check could not read
 * any source at all. A clean run is silent, so a message in the inbox always
 * means there is something to do. Re-transcribing weights from the new
 * publication stays a human judgment; this never edits the registry.
 *
 *   RESEND_API_KEY=... REGISTRY_ALERT_EMAIL_TO=... npm run notify:registry-drift
 *   npm run notify:registry-drift -- --dry-run    # print, never send
 *
 * Environment:
 *   RESEND_API_KEY            Required unless --dry-run
 *   REGISTRY_ALERT_EMAIL_TO   Recipient, required unless --dry-run
 *   REGISTRY_ALERT_EMAIL_FROM Optional, defaults to Ask Linc <noreply@asklinc.com>
 *
 * Exits 0 even when sources are unreadable. A provider behind a WAF is an
 * availability problem, not a data problem, and failing the schedule for it
 * would train the reader to ignore this.
 */

import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { checkRegistrySources, hasDiverged, type RegistrySourceResult } from '../src/services/registry-source-check';

const EMAIL_FROM = process.env.REGISTRY_ALERT_EMAIL_FROM || 'Ask Linc <noreply@asklinc.com>';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const FOOTER_STYLE = 'font-size:12px;color:#666';
const WRAPPER_STYLE = 'font-family:system-ui,-apple-system,sans-serif;max-width:720px';

function driftHtml(drifted: RegistrySourceResult[], all: RegistrySourceResult[]): string {
  const rows = drifted.map(result => `
    <tr>
      <td style="padding:8px 12px;border-top:1px solid #eee;vertical-align:top">
        <strong>${escapeHtml(result.key)}</strong><br>
        <a href="${escapeHtml(result.sourceUrl)}" style="font-size:12px;color:#555">${escapeHtml(result.sourceUrl)}</a>
      </td>
      <td style="padding:8px 12px;border-top:1px solid #eee;vertical-align:top;font-size:12px;white-space:pre-wrap">${escapeHtml(result.detail)}</td>
    </tr>`).join('');

  const unreadable = all.filter(result => result.status === 'error');
  const unreadableNote = unreadable.length
    ? `<p style="${FOOTER_STYLE}">${unreadable.length} source(s) could not be read this run
       (${escapeHtml(unreadable.map(result => result.key).join(', '))}). That is an availability
       problem, not evidence that anything diverged.</p>`
    : '';

  return `
    <div style="${WRAPPER_STYLE}">
      <h2 style="margin-bottom:4px">${drifted.length} target-date source${drifted.length === 1 ? '' : 's'} moved</h2>
      <p style="color:#444;margin-top:0">
        The registry's stored weights are not wrong — they still describe the publication they were
        transcribed from. But the provider has published something else since, so the citation no
        longer reproduces the figures the engine uses.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr><th style="text-align:left;padding:8px 12px">Entry</th><th style="text-align:left;padding:8px 12px">Recorded vs now</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#444">
        To resolve: re-transcribe the weights from the current publication, then re-baseline with
        <code>npx ts-node scripts/verify-registry-sources.ts --emit</code>. Nothing is automated —
        deciding that new published weights should replace transcribed ones is a human call.
      </p>
      ${unreadableNote}
      <p style="${FOOTER_STYLE}">
        Checked ${escapeHtml(new Date().toISOString())} · ${all.length} sources total ·
        this email is sent only when something has moved.
      </p>
    </div>`;
}

/**
 * The check read nothing at all.
 *
 * One unreadable provider is availability noise and stays silent. Every source
 * unreadable is a different claim: not "the providers are flaky" but "this
 * check is blind", and it will stay blind every week while producing exactly
 * the inbox silence that means all-clear. That failure mode is the reason
 * monitoring is worth having in the first place, so it gets said out loud.
 */
function blindHtml(all: RegistrySourceResult[]): string {
  const rows = all.map(result => `
    <tr>
      <td style="padding:8px 12px;border-top:1px solid #eee;vertical-align:top"><strong>${escapeHtml(result.key)}</strong></td>
      <td style="padding:8px 12px;border-top:1px solid #eee;vertical-align:top;font-size:12px;white-space:pre-wrap">${escapeHtml(result.detail)}</td>
    </tr>`).join('');

  return `
    <div style="${WRAPPER_STYLE}">
      <h2 style="margin-bottom:4px">Registry source check could not read any source</h2>
      <p style="color:#444;margin-top:0">
        All ${all.length} sources failed to read this run, so this check currently cannot tell you
        whether anything has drifted. Nothing here says the registry is wrong — it says the check
        is blind, and a blind check is silent in exactly the way an all-clear is.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr><th style="text-align:left;padding:8px 12px">Entry</th><th style="text-align:left;padding:8px 12px">Why it could not be read</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#444">
        Likely causes, cheapest first: the providers are blocking the Action runner's IP range, a
        source URL has moved, or the fetch path itself is broken. Reproduce locally with
        <code>npx ts-node scripts/verify-registry-sources.ts</code> — if it passes from your machine
        but not from CI, it is the runner's egress, not the registry.
      </p>
      <p style="${FOOTER_STYLE}">
        Checked ${escapeHtml(new Date().toISOString())} · sent only when every source fails at once.
      </p>
    </div>`;
}

/**
 * Stable per distinct alert, so the weekly cron and a same-day manual dispatch
 * do not both land in the inbox. Derived from what was observed rather than
 * from the date: the same drift seen twice is one alert, and Resend's key
 * window lapses after 24 hours so an unresolved drift still repeats next week.
 */
function idempotencyKey(prefix: string, results: RegistrySourceResult[]): string {
  const material = results
    .map(result => `${result.key}=${result.observed ?? result.detail}`)
    .sort()
    .join('|');
  return `registry-${prefix}-${createHash('sha256').update(material).digest('hex').slice(0, 32)}`;
}

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const recipient = process.env.REGISTRY_ALERT_EMAIL_TO;
  if (!dryRun && (!process.env.RESEND_API_KEY || !recipient)) {
    throw new Error('RESEND_API_KEY and REGISTRY_ALERT_EMAIL_TO must be set (or pass --dry-run)');
  }

  const results = await checkRegistrySources();
  const drifted = results.filter(hasDiverged);
  const unreadable = results.filter(result => result.status === 'error');

  for (const result of results) {
    console.log(`${result.status.padEnd(9)} ${result.key}`);
  }
  console.log(
    `\n${results.length} sources — ${drifted.length} drifted, ${unreadable.length} unreadable`
  );

  // Drift is the alert this exists for. A wholly blind run is reported too, but
  // never as drift: the two need different responses and conflating them is how
  // an alert becomes something to filter.
  const alert = drifted.length > 0
    ? {
        summary: drifted.map(result => `${result.key}\n    ${result.detail}`),
        subject: `${drifted.length} target-date source${drifted.length === 1 ? '' : 's'} moved since transcription`,
        html: driftHtml(drifted, results),
        key: idempotencyKey('drift', drifted),
      }
    : results.length > 0 && unreadable.length === results.length
      ? {
          summary: [`all ${results.length} sources unreadable; the check cannot see drift`],
          subject: 'Registry source check could not read any source',
          html: blindHtml(results),
          key: idempotencyKey('blind', results),
        }
      : null;

  if (!alert) {
    // Silence is the signal that nothing needs doing. Sending "all clear" every
    // run would make the alert something to filter rather than read.
    console.log('Nothing has moved; no email sent.');
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: would have emailed the following\n');
    for (const line of alert.summary) console.log(`  ${line}\n`);
    // Printed so the dedupe key is checkable without sending: the same alert
    // twice must produce the same key, a different one must not.
    console.log(`  idempotency key: ${alert.key}`);
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: recipient as string,
    subject: alert.subject,
    html: alert.html,
  }, {
    idempotencyKey: alert.key,
  });
  if (error) {
    // The body carries a checked-at timestamp, so a same-day repeat of the same
    // alert reuses the key with a changed body. Resend answers that with
    // `invalid_idempotent_request`, which still means the first email was
    // accepted — the inbox has it, and re-sending is the thing being avoided.
    if (error.name !== 'invalid_idempotent_request') {
      throw new Error(`Resend rejected the email: ${error.message}`);
    }
    console.log('Resend already accepted this alert today; not sending a second copy.');
    return;
  }

  console.log(`Emailed ${recipient}.`);
})().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
