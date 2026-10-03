/**
 * The "your result is ready in Ask Linc" message, for both public calculators.
 *
 * The calculators no longer show their answer on the page or in the inbox. The
 * visitor gives an address, chooses a password, and sees the result as the
 * first decision in their Ask Linc account. This message is what someone who
 * leaves the signup page comes back to, so it carries the link back in and
 * reminds them what they asked, but states no verdict and no figure the
 * calculator produced. Mailing the answer would let the inbox stand in for
 * the account, and the account is the point.
 *
 * Sent only when the lead stored, because only then does the link resolve to a
 * run the new account can be seeded from. When the store fails the route sends
 * the full results email instead: there is no account-side copy to point at.
 *
 * Every value shown is something the visitor typed, echoed back. The inputs
 * are not results, and they are what makes the message recognisably theirs.
 */

import { createEmailHtml } from './templates';

export type ReadyCalculator = 'coast_fire' | 'retirement';

export interface CalculatorReadyEmail {
  subject: string;
  html: string;
  text: string;
}

export interface CalculatorReadyEmailOptions {
  calculator: ReadyCalculator;
  /** What the visitor entered, as label/value rows. */
  inputs: Array<[string, string]>;
  email: string;
  ctaUrl: string;
}

const CTA_LABEL = 'See my result in Ask Linc';

const COPY: Record<ReadyCalculator, { subject: string; heading: string; calculatorName: string }> = {
  coast_fire: {
    subject: 'Your Coast FIRE result is ready in Ask Linc',
    heading: 'Your Coast FIRE result is ready',
    calculatorName: 'Coast FIRE calculator',
  },
  retirement: {
    subject: 'Your retirement result is ready in Ask Linc',
    heading: 'Your retirement result is ready',
    calculatorName: 'retirement calculator',
  },
};

const NEXT_STEP =
  'Choose a password and your result opens as the first decision in your account. There is no code to enter. Free for 30 days, no credit card required.';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildCalculatorReadyEmail(options: CalculatorReadyEmailOptions): CalculatorReadyEmail {
  const copy = COPY[options.calculator];
  const ctaUrl = escapeHtml(options.ctaUrl);
  const footerNote = `This message was sent to ${options.email} at your request from the Ask Linc ${copy.calculatorName}.`;

  const content = `
      <div class="welcome-message">
        ${escapeHtml(copy.heading)}
      </div>

      <div class="description">
        We ran the numbers you entered. Your answer, and what it means for your plan, is waiting in Ask Linc.
      </div>

      <div class="button-wrap" style="margin: 28px 0; text-align: center;">
        <a href="${ctaUrl}" class="cta-button" style="display: inline-block; padding: 14px 26px; border: 1px solid #123c2f; border-radius: 999px; background-color: #123c2f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">
          ${escapeHtml(CTA_LABEL)}
        </a>
      </div>
      <p style="margin: 0 0 10px; color: #71857f; font-size: 13px; line-height: 1.6; text-align: center;">
        ${escapeHtml(NEXT_STEP)}
      </p>
      <div class="fallback-link" style="margin: 22px 0; padding: 16px; border: 1px solid #d8d2c5; border-radius: 12px; background-color: #f8f5ed; color: #526d64; font-size: 12px; line-height: 1.6; word-break: break-all;">
        <strong style="color: #29483f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">If the button does not work, use this link:</strong><br />
        ${ctaUrl}
      </div>

      <div class="feature-list" style="margin: 22px 0; padding: 20px; border: 1px solid #d8d2c5; border-radius: 14px; background-color: #f8f5ed;">
        <p style="margin: 0 0 8px; color: #477064; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;">What you entered</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
          ${options.inputs.map(([label, value]) => `
          <tr>
            <td style="padding: 5px 0; color: #526d64; font-size: 14px;">${escapeHtml(label)}</td>
            <td align="right" style="padding: 5px 0; color: #123c2f; font-size: 14px; font-weight: 700;">${escapeHtml(value)}</td>
          </tr>`).join('')}
        </table>
      </div>
  `;

  const html = createEmailHtml(content, {
    title: copy.subject,
    footerNote: escapeHtml(footerNote),
  });

  const text = `${copy.heading.toUpperCase()}

We ran the numbers you entered. Your answer, and what it means for your plan, is waiting in Ask Linc.

${CTA_LABEL}:
${options.ctaUrl}

${NEXT_STEP}

WHAT YOU ENTERED
${options.inputs.map(([label, value]) => `  ${label}: ${value}`).join('\n')}

${footerNote}
© ${new Date().getFullYear()} Ethan Teng Consulting LLC`;

  return { subject: copy.subject, html, text };
}
