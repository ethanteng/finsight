/**
 * The "your plan is waiting in Ask Linc" message, for both public calculators.
 *
 * The calculators show their answer on the page. Beside it they show, locked,
 * the details Ask Linc plans with that the calculator never asked for, and an
 * email address and a password unlock them: the run becomes the first decision
 * in the visitor's account, with those details as a form under the answer.
 * This message is what someone who leaves the signup page comes back to, so it
 * carries the link back in and reminds them what they entered, but states no
 * verdict and no figure the calculator produced. The page already showed the
 * answer; the inbox is not where the plan continues, the account is.
 *
 * Sent only when the lead stored, because only then does the link resolve to a
 * run an account can open. A new address is linked to signup, where the run
 * becomes the account's first decision; an address that already has an
 * account is linked to sign-in, where the run is attached as a new decision.
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
  /** The address already has an account, so the link signs in rather than up. */
  existingAccount?: boolean;
}

const CTA_LABEL = 'Open my plan in Ask Linc';

const COPY: Record<ReadyCalculator, { subject: string; heading: string; calculatorName: string; details: string }> = {
  coast_fire: {
    subject: 'Your Coast FIRE plan is waiting in Ask Linc',
    heading: 'Your Coast FIRE plan is waiting',
    calculatorName: 'Coast FIRE calculator',
    details: 'what you still save, Social Security and a pension, a partner, taxes and health coverage',
  },
  retirement: {
    subject: 'Your retirement plan is waiting in Ask Linc',
    heading: 'Your retirement plan is waiting',
    calculatorName: 'retirement calculator',
    details: 'a pension, a partner, taxes and health coverage',
  },
};

const NEXT_STEP =
  'Choose a password and your run opens as the first decision in your account. There is no code to enter. Free for 30 days, no credit card required.';

const EXISTING_ACCOUNT_NEXT_STEP =
  'Sign in to your Ask Linc account and your run opens there as a new decision.';

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
  const nextStep = options.existingAccount ? EXISTING_ACCOUNT_NEXT_STEP : NEXT_STEP;
  const ctaUrl = escapeHtml(options.ctaUrl);
  const footerNote = `This message was sent to ${options.email} at your request from the Ask Linc ${copy.calculatorName}.`;
  const description = `Your run is saved in Ask Linc, ready for the details the calculator leaves out: ${copy.details}.`;

  const content = `
      <div class="welcome-message">
        ${escapeHtml(copy.heading)}
      </div>

      <div class="description">
        ${escapeHtml(description)}
      </div>

      <div class="button-wrap" style="margin: 28px 0; text-align: center;">
        <a href="${ctaUrl}" class="cta-button" style="display: inline-block; padding: 14px 26px; border: 1px solid #123c2f; border-radius: 999px; background-color: #123c2f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">
          ${escapeHtml(CTA_LABEL)}
        </a>
      </div>
      <p style="margin: 0 0 10px; color: #71857f; font-size: 13px; line-height: 1.6; text-align: center;">
        ${escapeHtml(nextStep)}
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

${description}

${CTA_LABEL}:
${options.ctaUrl}

${nextStep}

WHAT YOU ENTERED
${options.inputs.map(([label, value]) => `  ${label}: ${value}`).join('\n')}

${footerNote}
© ${new Date().getFullYear()} Ethan Teng Consulting LLC`;

  return { subject: copy.subject, html, text };
}
