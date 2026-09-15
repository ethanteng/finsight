/**
 * The "email me my Coast FIRE results" message.
 *
 * It renders what the page rendered — the same status, the same number, the
 * same funded ratio, the same one-point-either-way comparison, the same
 * assumptions and the same limitations — because the promise made on the
 * button is the results, not a teaser for them. The one thing it adds is the
 * next decision: a link back into signup carrying this scenario.
 *
 * Every message is built twice, as HTML and as plain text, and both are sent.
 * A client that cannot render the HTML part shows the text part rather than an
 * empty message, and text-first clients are common in exactly the
 * self-directed, older-than-average audience this page is aimed at.
 */

import { createEmailHtml } from './templates';
import { coastFireSensitivity, type CoastFireResult } from '../services/coast-fire';

export interface CoastFireEmail {
  subject: string;
  html: string;
  text: string;
}

const CTA_LABEL = 'Stress-test this with my actual finances';

/** The decisions the number raises but cannot answer, as on the page. */
const DECISIONS = [
  'Can I stop maxing my 401(k)?',
  'Could I take a $30K pay cut?',
  'Could one of us stop working?',
  'What if returns are worse than this?',
  'Can I spend $20K more a year?',
];

function dollars(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function percent(fundedRatio: number): string {
  if (!Number.isFinite(fundedRatio)) return 'Fully covered';
  return `${Math.round(fundedRatio * 100)}%`;
}

/**
 * Every value interpolated below is a number this process computed or a label
 * from a constant in this file, so none of it can carry markup. This escape is
 * here for the next person who adds a field that is not.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lead(result: CoastFireResult): string {
  if (result.portfolioSpendingNeed === 0) {
    return 'The retirement income you entered covers your planned spending, so this formula asks nothing of your portfolio.';
  }
  return result.hasReachedCoastFire
    ? `You are ${dollars(result.differenceToday)} above the amount this formula says you need invested today.`
    : `You are ${dollars(Math.abs(result.differenceToday))} short of your Coast FIRE number today.`;
}

function headline(result: CoastFireResult): string {
  return result.hasReachedCoastFire
    ? 'You’ve reached Coast FIRE.'
    : 'You’re still building your coast.';
}

function assumptionsNote(result: CoastFireResult): string {
  return `Assumes ${result.realReturnRate}% annual growth after inflation for ${result.yearsToRetirement} years and a ${result.withdrawalRate}% starting withdrawal rate.`;
}

const LIMITATIONS =
  'Not modeled: taxes, fees, account types, healthcare, one-off costs, changing spending, income that starts later, or sequence-of-returns risk. This is educational information, not financial advice.';

/**
 * The dark result card from the page, rebuilt in table markup email clients
 * render. Same order, same labels, same status pill, and the same lime
 * headline number, so the email reads as the screen it came from. Colours are
 * the email shell's (deep green #123c2f, lime #cfff68) rather than the
 * marketing site's near-identical pair, so the card sits inside the branded
 * header and footer without two greens fighting each other.
 */
function resultCardHtml(result: CoastFireResult): string {
  const progress = Number.isFinite(result.fundedRatio)
    ? Math.min(100, Math.max(0, Math.round(result.fundedRatio * 100)))
    : 100;
  const pill = result.hasReachedCoastFire
    ? { label: 'Reached', background: '#cfff68', color: '#123c2f' }
    : { label: 'Not yet', background: '#f7d6a0', color: '#533708' };

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 0 0 28px; border-radius: 18px; background-color: #123c2f;">
    <tr>
      <td style="padding: 30px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
          <tr>
            <td style="color: #a6b8ac; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">
              Your Coast FIRE status
            </td>
            <td align="right">
              <span style="display: inline-block; padding: 6px 12px; border-radius: 999px; background-color: ${pill.background}; color: ${pill.color}; font-size: 12px; font-weight: 800; letter-spacing: 0.04em;">
                ${pill.label}
              </span>
            </td>
          </tr>
        </table>

        <p style="margin: 22px 0 0; color: #ffffff; font-size: 30px; font-weight: 700; line-height: 1.08; letter-spacing: -0.035em;">
          ${escapeHtml(headline(result))}
        </p>
        <p style="margin: 14px 0 26px; color: #b9c6bd; font-size: 16px; line-height: 1.55;">
          ${escapeHtml(lead(result))}
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border: 1px solid rgba(255, 255, 255, 0.17); border-radius: 16px; background-color: #1c4638;">
          <tr>
            <td style="padding: 23px;">
              <p style="margin: 0; color: #b9c6bd; font-size: 13px; font-weight: 700;">Your Coast FIRE number</p>
              <p style="margin: 6px 0 0; color: #cfff68; font-size: 44px; font-weight: 700; line-height: 1.05; letter-spacing: -0.055em;">
                ${escapeHtml(dollars(result.coastFireNumber))}
              </p>
              <p style="margin: 4px 0 0; color: #93a599; font-size: 12px;">in today&rsquo;s dollars</p>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-top: 27px;">
          <tr>
            <td style="color: #b9c6bd; font-size: 13px;">Current retirement savings</td>
            <td align="right" style="color: #ffffff; font-size: 13px; font-weight: 700;">${escapeHtml(percent(result.fundedRatio))}</td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-top: 9px; border-radius: 999px; background-color: #2c483d;">
          <tr>
            <td style="font-size: 0; line-height: 0;">
              <table role="presentation" width="${progress}%" cellspacing="0" cellpadding="0" border="0" style="width: ${progress}%; border-radius: 999px; background-color: #cfff68;">
                <tr><td style="height: 12px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin: 9px 0 0; color: #ffffff; font-size: 19px; font-weight: 700; letter-spacing: -0.02em;">${escapeHtml(dollars(result.currentSavings))}</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-top: 27px; border-top: 1px solid rgba(255, 255, 255, 0.17);">
          <tr>
            <td width="50%" style="padding: 18px 12px 0 0; vertical-align: top;">
              <p style="margin: 0; color: #93a599; font-size: 12px;">Target at ${result.retirementAge}</p>
              <p style="margin: 6px 0 0; color: #ffffff; font-size: 21px; font-weight: 700; letter-spacing: -0.03em;">${escapeHtml(dollars(result.retirementTarget))}</p>
            </td>
            <td width="50%" style="padding: 18px 0 0 18px; vertical-align: top; border-left: 1px solid rgba(255, 255, 255, 0.17);">
              <p style="margin: 0; color: #93a599; font-size: 12px;">If you add $0</p>
              <p style="margin: 6px 0 0; color: #ffffff; font-size: 21px; font-weight: 700; letter-spacing: -0.03em;">${escapeHtml(dollars(result.projectedSavingsAtRetirement))}</p>
            </td>
          </tr>
        </table>

        <p style="margin: 20px 0 0; color: #93a599; font-size: 13px; line-height: 1.55;">${escapeHtml(assumptionsNote(result))}</p>
      </td>
    </tr>
  </table>`;
}

/** The page's section kicker: uppercase, letter-spaced, deep green. */
function kickerHtml(label: string): string {
  return `<p style="margin: 0 0 8px; color: #477064; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;">${escapeHtml(label)}</p>`;
}

function sensitivityHtml(result: CoastFireResult): string {
  const rows = coastFireSensitivity(result).map((scenario) => `
          <tr>
            <td style="padding: 11px 0; border-top: 1px solid #e2ddd2; color: #526d64; font-size: 14px;">
              ${scenario.rate.toFixed(1)}%${scenario.selected ? ' · yours' : ''}
            </td>
            <td align="right" style="padding: 11px 0; border-top: 1px solid #e2ddd2; color: #123c2f; font-size: 15px; font-weight: 700;">
              ${escapeHtml(dollars(scenario.coastFireNumber))}
            </td>
            <td align="right" style="padding: 11px 0; border-top: 1px solid #e2ddd2;">
              <span style="display: inline-block; padding: 5px 10px; border-radius: 999px; background-color: ${scenario.reached ? '#cfff68' : '#f7d6a0'}; color: ${scenario.reached ? '#123c2f' : '#533708'}; font-size: 12px; font-weight: 800;">
                ${scenario.reached ? 'Reached' : 'Not yet'}
              </span>
            </td>
          </tr>`).join('');

  return `
  ${kickerHtml('See what changes')}
  <p style="margin: 0 0 8px; color: #123c2f; font-size: 22px; font-weight: 700; line-height: 1.2; letter-spacing: -0.03em;">Your return assumption does most of the work.</p>
  <p style="margin: 0 0 16px; color: #526d64; font-size: 15px; line-height: 1.6;">
    One point either way compounds for ${result.yearsToRetirement} years. A single green badge should never be the end of the decision.
  </p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 0 0 26px;">
    <tr>
      <td style="padding-bottom: 6px; color: #7d8a82; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Real return</td>
      <td align="right" style="padding-bottom: 6px; color: #7d8a82; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Number today</td>
      <td align="right" style="padding-bottom: 6px; color: #7d8a82; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Status</td>
    </tr>${rows}
  </table>`;
}

function inputsHtml(result: CoastFireResult): string {
  const rows: Array<[string, string]> = [
    ['Your age today', `${result.currentAge}`],
    ['Retirement age', `${result.retirementAge}`],
    ['Retirement savings today', dollars(result.currentSavings)],
    ['Annual spending in retirement', dollars(result.annualRetirementSpending)],
    ['Annual income available at retirement', dollars(result.annualRetirementIncome)],
    ['Expected real return', `${result.realReturnRate}%`],
    ['Withdrawal rate', `${result.withdrawalRate}%`],
  ];

  return `
  <div class="feature-list" style="margin: 22px 0; padding: 20px; border: 1px solid #d8d2c5; border-radius: 14px; background-color: #f8f5ed;">
    ${kickerHtml('What you entered')}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
      ${rows.map(([label, value]) => `
      <tr>
        <td style="padding: 5px 0; color: #526d64; font-size: 14px;">${escapeHtml(label)}</td>
        <td align="right" style="padding: 5px 0; color: #123c2f; font-size: 14px; font-weight: 700;">${escapeHtml(value)}</td>
      </tr>`).join('')}
    </table>
  </div>`;
}

export function buildCoastFireResultsEmail(
  result: CoastFireResult,
  options: { email: string; ctaUrl: string; calculatorUrl: string },
): CoastFireEmail {
  const subject = result.hasReachedCoastFire
    ? `Your Coast FIRE number: ${dollars(result.coastFireNumber)} — and you’ve passed it`
    : `Your Coast FIRE number: ${dollars(result.coastFireNumber)}`;

  const ctaUrl = escapeHtml(options.ctaUrl);

  const content = `
      <div class="welcome-message">
        Your Coast FIRE results
      </div>

      <div class="description">
        Here is the answer the calculator gave you, kept in one place so you can come back to it.
        Every assumption behind it is below.
      </div>

      ${resultCardHtml(result)}
      ${sensitivityHtml(result)}

      ${kickerHtml('The number is the easy part')}
      <p style="margin: 0 0 8px; color: #123c2f; font-size: 22px; font-weight: 700; line-height: 1.2; letter-spacing: -0.03em;">
        Have you reached it&mdash;and can you really coast?
      </p>
      <p style="margin: 0 0 14px; color: #526d64; font-size: 15px; line-height: 1.7;">
        A Coast FIRE number tells you when you could stop saving so aggressively. It cannot tell you what that
        actually lets you change. Ask Linc replaces the flat return and withdrawal rate above with your real
        holdings, spending, income, and timing, then runs the change you are weighing against a century of
        market history.
      </p>
      <div class="feature-list" style="margin: 22px 0; padding: 20px; border: 1px solid #d8d2c5; border-radius: 14px; background-color: #f8f5ed;">
        ${DECISIONS.map((decision) => `
        <p class="feature-item" style="margin: 0 0 12px; color: #526d64; font-size: 14px; line-height: 1.5;">
          <span class="feature-check" style="margin-right: 9px; color: #397052; font-weight: 700;">→</span>${escapeHtml(decision)}
        </p>`).join('')}
      </div>

      <div class="button-wrap" style="margin: 28px 0; text-align: center;">
        <a href="${ctaUrl}" class="cta-button" style="display: inline-block; padding: 14px 26px; border: 1px solid #123c2f; border-radius: 999px; background-color: #123c2f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">
          ${escapeHtml(CTA_LABEL)}
        </a>
      </div>
      <p style="margin: 0 0 10px; color: #71857f; font-size: 13px; line-height: 1.6; text-align: center;">
        Free for 30 days. No credit card required. Your scenario above is carried over.
      </p>
      <div class="fallback-link" style="margin: 22px 0; padding: 16px; border: 1px solid #d8d2c5; border-radius: 12px; background-color: #f8f5ed; color: #526d64; font-size: 12px; line-height: 1.6; word-break: break-all;">
        <strong style="color: #29483f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">If the button does not work, use this link:</strong><br />
        ${ctaUrl}
      </div>

      ${inputsHtml(result)}

      <div class="security-note" style="margin: 24px 0 0; padding: 16px; border-left: 3px solid #537266; border-radius: 0 10px 10px 0; background-color: #edf2ef;">
        <p style="margin: 0; color: #476258; font-size: 13px; line-height: 1.6;">${escapeHtml(LIMITATIONS)}</p>
      </div>
  `;

  const html = createEmailHtml(content, {
    title: 'Your Coast FIRE results',
    footerNote: `These results were sent to ${escapeHtml(options.email)} at your request from the Ask Linc Coast FIRE calculator.`,
  });

  return { subject, html, text: buildCoastFireResultsText(result, options) };
}

/** The same message for a client that will not render HTML. Content, not a stub. */
export function buildCoastFireResultsText(
  result: CoastFireResult,
  options: { email: string; ctaUrl: string; calculatorUrl: string },
): string {
  const sensitivity = coastFireSensitivity(result)
    .map((scenario) => `  ${scenario.rate.toFixed(1)}% real return${scenario.selected ? ' (yours)' : ''}: ${dollars(scenario.coastFireNumber)} — ${scenario.reached ? 'Reached' : 'Not yet'}`)
    .join('\n');

  return `YOUR COAST FIRE RESULTS

${headline(result)}
${lead(result)}

Your Coast FIRE number: ${dollars(result.coastFireNumber)} (in today's dollars)
Current retirement savings: ${dollars(result.currentSavings)} (${percent(result.fundedRatio)} of that number)
Target at ${result.retirementAge}: ${dollars(result.retirementTarget)}
If you add $0 between now and then: ${dollars(result.projectedSavingsAtRetirement)}

${assumptionsNote(result)}

YOUR RETURN ASSUMPTION DOES MOST OF THE WORK
One point either way compounds for ${result.yearsToRetirement} years.

${sensitivity}

WHAT YOU ENTERED
  Your age today: ${result.currentAge}
  Retirement age: ${result.retirementAge}
  Retirement savings today: ${dollars(result.currentSavings)}
  Annual spending in retirement: ${dollars(result.annualRetirementSpending)}
  Annual income available at retirement: ${dollars(result.annualRetirementIncome)}
  Expected real return: ${result.realReturnRate}%
  Withdrawal rate: ${result.withdrawalRate}%

THE NUMBER IS THE EASY PART
A Coast FIRE number tells you when you could stop saving so aggressively. It cannot
tell you what that actually lets you change. Ask Linc replaces the flat return and
withdrawal rate above with your real holdings, spending, income, and timing, then runs
the change you are weighing against a century of market history.

${DECISIONS.map((decision) => `  - ${decision}`).join('\n')}

${CTA_LABEL}:
${options.ctaUrl}

Free for 30 days. No credit card required. Your scenario above is carried over.

Run the numbers again: ${options.calculatorUrl}

${LIMITATIONS}

These results were sent to ${options.email} at your request from the Ask Linc Coast FIRE calculator.
© ${new Date().getFullYear()} Ask Linc`;
}
