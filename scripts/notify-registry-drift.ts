/**
 * Email when a target-date registry source publishes something other than what
 * its entry records.
 *
 * #165 made divergence detectable, but only by opening the admin panel — and
 * nobody opens a panel to check on something that is usually fine. This pushes.
 *
 * Sends only when at least one source has drifted. A clean run is silent, so a
 * message in the inbox always means there is something to do. Re-transcribing
 * weights from the new publication stays a human judgment; this never edits the
 * registry.
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

function emailHtml(drifted: RegistrySourceResult[], all: RegistrySourceResult[]): string {
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
    ? `<p style="font-size:12px;color:#666">${unreadable.length} source(s) could not be read this run
       (${escapeHtml(unreadable.map(result => result.key).join(', '))}). That is an availability
       problem, not evidence that anything diverged.</p>`
    : '';

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:720px">
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
      <p style="font-size:12px;color:#666">
        Checked ${escapeHtml(new Date().toISOString())} · ${all.length} sources total ·
        this email is sent only when something has moved.
      </p>
    </div>`;
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

  if (drifted.length === 0) {
    // Silence is the signal that nothing needs doing. Sending "all clear" every
    // run would make the alert something to filter rather than read.
    console.log('Nothing has moved; no email sent.');
    return;
  }

  if (dryRun) {
    console.log('\n--dry-run: would have emailed the following\n');
    for (const result of drifted) console.log(`  ${result.key}\n    ${result.detail}\n`);
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: recipient as string,
    subject: `${drifted.length} target-date source${drifted.length === 1 ? '' : 's'} moved since transcription`,
    html: emailHtml(drifted, results),
  });
  if (error) throw new Error(`Resend rejected the email: ${error.message}`);

  console.log(`Emailed ${recipient}.`);
})().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
