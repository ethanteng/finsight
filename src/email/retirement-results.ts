/**
 * The "email me my retirement results" message.
 *
 * It renders what the page rendered — the same verdict sentence, the same
 * survival bar, the same four figures, the same what-moves-the-answer
 * comparison, the same assumptions and limitations — because the promise made
 * on the button is the results, not a teaser for them. The one thing it adds
 * is the next decision: a link back into signup carrying this plan.
 *
 * Built twice, as HTML and as plain text, and both are sent. A client that
 * cannot render the HTML part shows the text part rather than an empty
 * message.
 *
 * Colours are the email shell's deep green and lime, with the page's own
 * outcome bands for the verdict: a 45% survival rate rendered in the same
 * confident green as a 99% one is a lie of presentation, in an inbox as much
 * as on a page.
 */

import { createEmailHtml } from './templates';
import type {
  QuickPlanScenario,
  RetirementQuickPlanResult,
} from '../services/retirement-quickplan';

export interface RetirementEmail {
  subject: string;
  html: string;
  text: string;
}

const CTA_LABEL = 'Stress-test this with my actual finances';

/** What a six-number model cannot answer, as on the page's cross-sell. */
const DECISIONS = [
  'What do my actual holdings do to this?',
  'Can I retire a year or two earlier?',
  'What if one of us stops working first?',
  'When should I claim Social Security?',
  'How much could we spend without breaking it?',
];

type OutcomeBand = 'strong' | 'mixed' | 'weak';

/** The page's bands, so the inbox and the screen agree about tone. */
function outcomeBand(survivalRate: number): OutcomeBand {
  if (survivalRate >= 0.9) return 'strong';
  if (survivalRate >= 0.7) return 'mixed';
  return 'weak';
}

const BAND_COLORS: Record<OutcomeBand, { ink: string; fill: string; pill: string }> = {
  strong: { ink: '#176840', fill: '#2b8f5d', pill: '#cfff68' },
  mixed: { ink: '#97600f', fill: '#c07c15', pill: '#f7d6a0' },
  weak: { ink: '#a8322a', fill: '#b4352b', pill: '#f4c7c0' },
};

function money(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

/** `1926-07` reads as a date, not a database column. */
function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * Every value interpolated below is a number this process computed or a label
 * from the model's own output, but the model's labels are strings and the next
 * field added here might not be, so everything goes through this.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verdictSentence(result: RetirementQuickPlanResult, primary: QuickPlanScenario): string {
  return `Based on the numbers you entered, retiring at ${result.inputs.retirementAge} worked in ${count(primary.sequencesSurvived)} of the ${count(primary.sequencesTested)} retirements in market history we could test it against.`;
}

function methodSentence(result: RetirementQuickPlanResult): string {
  return `Each test is a real, month-by-month stretch of US market returns and inflation running from ${monthLabel(result.history.firstStartMonth)} onward — ${result.history.horizonYears} years from today through age ${result.inputs.lifeExpectancy}, with your contributions before retirement and your spending after it.`;
}

/** The four figures under the survival bar, worded as the page words them. */
function statRows(result: RetirementQuickPlanResult, primary: QuickPlanScenario): Array<{
  label: string;
  value: string;
  note: string;
}> {
  const { inputs } = result;
  const hasSocialSecurity = inputs.socialSecurityAnnual > 0;
  const claimsAfterRetiring = hasSocialSecurity && inputs.socialSecurityStartAge > inputs.retirementAge;
  const ranOut = primary.sequencesTested - primary.sequencesSurvived;

  return [
    {
      label: `Portfolio at age ${inputs.retirementAge}`,
      value: money(primary.projectedPortfolioAtRetirement),
      note: "Median across tested histories, in today's dollars",
    },
    {
      label: 'First-year draw',
      value: money(primary.firstYearPortfolioWithdrawal),
      note: claimsAfterRetiring
        ? `All of it from the portfolio — Social Security starts at ${inputs.socialSecurityStartAge}`
        : hasSocialSecurity
          ? `Your spending less ${money(inputs.socialSecurityAnnual)} of Social Security`
          : 'No Social Security offset in the first year',
    },
    {
      label: 'Withdrawal rate',
      value: percent(primary.firstYearWithdrawalRate, 2),
      note: 'First-year draw as a share of the portfolio',
    },
    {
      label: 'Histories that ran short',
      value: count(ranOut),
      note: primary.depletionYears?.p50 != null
        ? `Money lasted about ${Math.round(primary.depletionYears.p50)} years in the median failure`
        : 'The portfolio lasted in every tested history',
    },
  ];
}

/** The page's section kicker: uppercase, letter-spaced, deep green. */
function kickerHtml(label: string): string {
  return `<p style="margin: 0 0 8px; color: #477064; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase;">${escapeHtml(label)}</p>`;
}

function verdictCardHtml(result: RetirementQuickPlanResult, primary: QuickPlanScenario): string {
  const band = outcomeBand(primary.survivalRate);
  const colors = BAND_COLORS[band];
  const filled = Math.min(100, Math.max(0, Math.round(primary.survivalRate * 100)));

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 0 0 28px; border-radius: 18px; background-color: #123c2f;">
    <tr>
      <td style="padding: 30px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
          <tr>
            <td style="color: #a6b8ac; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">
              The model&rsquo;s answer
            </td>
            <td align="right">
              <span style="display: inline-block; padding: 6px 12px; border-radius: 999px; background-color: ${colors.pill}; color: #123c2f; font-size: 12px; font-weight: 800; letter-spacing: 0.04em;">
                ${escapeHtml(percent(primary.survivalRate, 1))} lasted
              </span>
            </td>
          </tr>
        </table>

        <p style="margin: 22px 0 0; color: #ffffff; font-size: 25px; font-weight: 700; line-height: 1.22; letter-spacing: -0.03em;">
          ${escapeHtml(verdictSentence(result, primary))}
        </p>
        <p style="margin: 14px 0 26px; color: #b9c6bd; font-size: 15px; line-height: 1.6;">
          ${escapeHtml(methodSentence(result))}
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-radius: 999px; background-color: #2c483d;">
          <tr>
            <td style="font-size: 0; line-height: 0;">
              <table role="presentation" width="${filled}%" cellspacing="0" cellpadding="0" border="0" style="width: ${filled}%; border-radius: 999px; background-color: ${colors.fill};">
                <tr><td style="height: 14px; font-size: 0; line-height: 0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin: 9px 0 0; color: #93a599; font-size: 12px;">
          ${escapeHtml(count(primary.sequencesSurvived))} of ${escapeHtml(count(primary.sequencesTested))} tested retirements
        </p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.17);">
          ${statRows(result, primary).map((stat, index) => `
          <tr>
            <td style="padding: ${index === 0 ? '18px' : '14px'} 0 0;">
              <p style="margin: 0; color: #93a599; font-size: 12px;">${escapeHtml(stat.label)}</p>
              <p style="margin: 4px 0 0; color: #ffffff; font-size: 21px; font-weight: 700; letter-spacing: -0.03em;">${escapeHtml(stat.value)}</p>
              <p style="margin: 2px 0 0; color: #93a599; font-size: 12px; line-height: 1.5;">${escapeHtml(stat.note)}</p>
            </td>
          </tr>`).join('')}
        </table>
      </td>
    </tr>
  </table>`;
}

function scenariosHtml(result: RetirementQuickPlanResult, primary: QuickPlanScenario): string {
  const rows = [primary, ...result.alternatives].map((scenario) => {
    const colors = BAND_COLORS[outcomeBand(scenario.survivalRate)];
    const isPrimary = scenario.id === primary.id;
    return `
          <tr>
            <td style="padding: 12px 0; border-top: 1px solid #e2ddd2;">
              <p style="margin: 0; color: #123c2f; font-size: 14px; font-weight: 700;">
                ${escapeHtml(scenario.label)}${isPrimary ? ' · yours' : ''}
              </p>
              <p style="margin: 2px 0 0; color: #7d8a82; font-size: 12px;">
                ${escapeHtml(scenario.change ?? 'as you entered it')}
              </p>
            </td>
            <td align="right" style="padding: 12px 0; border-top: 1px solid #e2ddd2; color: ${colors.ink}; font-size: 17px; font-weight: 700; white-space: nowrap;">
              ${escapeHtml(percent(scenario.survivalRate, 1))}
            </td>
          </tr>`;
  }).join('');

  return `
  ${kickerHtml('What moves the answer')}
  <p style="margin: 0 0 8px; color: #123c2f; font-size: 22px; font-weight: 700; line-height: 1.2; letter-spacing: -0.03em;">
    The two levers these numbers can pull.
  </p>
  <p style="margin: 0 0 16px; color: #526d64; font-size: 15px; line-height: 1.6;">
    Working longer and spending less are the only changes six numbers can express. Each row is a
    full re-run of the model against the same century of history, not an adjustment of the first answer.
  </p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; margin: 0 0 26px;">
    <tr>
      <td style="padding-bottom: 4px; color: #7d8a82; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Scenario</td>
      <td align="right" style="padding-bottom: 4px; color: #7d8a82; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">Histories that lasted</td>
    </tr>${rows}
  </table>`;
}

function inputsHtml(result: RetirementQuickPlanResult): string {
  return `
  <div class="feature-list" style="margin: 22px 0; padding: 20px; border: 1px solid #d8d2c5; border-radius: 14px; background-color: #f8f5ed;">
    ${kickerHtml('What you entered')}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%;">
      ${inputRows(result).map(([label, value]) => `
      <tr>
        <td style="padding: 5px 0; color: #526d64; font-size: 14px;">${escapeHtml(label)}</td>
        <td align="right" style="padding: 5px 0; color: #123c2f; font-size: 14px; font-weight: 700;">${escapeHtml(value)}</td>
      </tr>`).join('')}
    </table>
  </div>`;
}

function inputRows(result: RetirementQuickPlanResult): Array<[string, string]> {
  const { inputs, allocation } = result;
  return [
    ['Your age today', `${inputs.currentAge}`],
    ['Retirement age', `${inputs.retirementAge}`],
    ['Investment assets today', money(inputs.investableAssets)],
    ['Annual spending in retirement', money(inputs.annualSpending)],
    ['Annual saving until retirement', money(inputs.annualContributions)],
    ['Social Security', inputs.socialSecurityAnnual > 0
      ? `${money(inputs.socialSecurityAnnual)} from age ${inputs.socialSecurityStartAge}`
      : 'None entered'],
    ['Asset mix', `${allocation.label} · ${allocation.equityPercent}% equities`],
    ['Planning through age', `${inputs.lifeExpectancy}`],
  ];
}

function limitationsHtml(result: RetirementQuickPlanResult): string {
  const items = result.limitations.slice(0, 5);
  if (items.length === 0) return '';

  return `
  <div class="security-note" style="margin: 24px 0 0; padding: 16px; border-left: 3px solid #537266; border-radius: 0 10px 10px 0; background-color: #edf2ef;">
    <p style="margin: 0 0 8px; color: #29483f; font-size: 13px; font-weight: 700;">What this run could not know</p>
    ${items.map((limitation) => `
    <p style="margin: 0 0 6px; color: #476258; font-size: 13px; line-height: 1.6;">• ${escapeHtml(limitation)}</p>`).join('')}
    <p style="margin: 10px 0 0; color: #476258; font-size: 13px; line-height: 1.6;">
      This is educational information, not financial advice.
    </p>
  </div>`;
}

export function buildRetirementResultsEmail(
  result: RetirementQuickPlanResult,
  primary: QuickPlanScenario,
  options: { email: string; ctaUrl: string; calculatorUrl: string },
): RetirementEmail {
  // One decimal, matching the card. Rounding to whole percent turned 99.6%
  // into "100%" in the subject line while the message itself said 99.6% —
  // an overstated survival figure, and the first thing an inbox shows.
  const subject = `Your retirement plan: ${percent(primary.survivalRate, 1)} of tested histories lasted`;
  const ctaUrl = escapeHtml(options.ctaUrl);

  const content = `
      <div class="welcome-message">
        Your retirement results
      </div>

      <div class="description">
        Here is what the model said, kept in one place so you can come back to it. Every assumption
        behind it is below.
      </div>

      ${verdictCardHtml(result, primary)}
      ${scenariosHtml(result, primary)}

      ${kickerHtml('Six numbers only go so far')}
      <p style="margin: 0 0 8px; color: #123c2f; font-size: 22px; font-weight: 700; line-height: 1.2; letter-spacing: -0.03em;">
        Keep testing this retirement decision.
      </p>
      <p style="margin: 0 0 14px; color: #526d64; font-size: 15px; line-height: 1.7;">
        This run used an asset-mix preset and the figures you typed. Ask Linc replaces both with your
        actual holdings, spending, income, and Social Security timing, then keeps the model available
        for the next question you have about it.
      </p>
      <div class="feature-list" style="margin: 22px 0; padding: 20px; border: 1px solid #d8d2c5; border-radius: 14px; background-color: #f8f5ed;">
        ${DECISIONS.map((decision) => `
        <p class="feature-item" style="margin: 0 0 12px; color: #526d64; font-size: 14px; line-height: 1.5;">
          <span class="feature-check" style="margin-right: 9px; color: #397052; font-weight: 700;">&rarr;</span>${escapeHtml(decision)}
        </p>`).join('')}
      </div>

      <div class="button-wrap" style="margin: 28px 0; text-align: center;">
        <a href="${ctaUrl}" class="cta-button" style="display: inline-block; padding: 14px 26px; border: 1px solid #123c2f; border-radius: 999px; background-color: #123c2f; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;">
          ${escapeHtml(CTA_LABEL)}
        </a>
      </div>
      <p style="margin: 0 0 10px; color: #71857f; font-size: 13px; line-height: 1.6; text-align: center;">
        Free for 30 days. No credit card required. Your plan above is carried over.
      </p>
      <div class="fallback-link" style="margin: 22px 0; padding: 16px; border: 1px solid #d8d2c5; border-radius: 12px; background-color: #f8f5ed; color: #526d64; font-size: 12px; line-height: 1.6; word-break: break-all;">
        <strong style="color: #29483f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">If the button does not work, use this link:</strong><br />
        ${ctaUrl}
      </div>

      ${inputsHtml(result)}
      ${limitationsHtml(result)}
  `;

  const html = createEmailHtml(content, {
    title: 'Your retirement results',
    footerNote: `These results were sent to ${escapeHtml(options.email)} at your request from the Ask Linc retirement calculator.`,
  });

  return { subject, html, text: buildRetirementResultsText(result, primary, options) };
}

/** The same message for a client that will not render HTML. Content, not a stub. */
export function buildRetirementResultsText(
  result: RetirementQuickPlanResult,
  primary: QuickPlanScenario,
  options: { email: string; ctaUrl: string; calculatorUrl: string },
): string {
  const stats = statRows(result, primary)
    .map((stat) => `  ${stat.label}: ${stat.value}\n    ${stat.note}`)
    .join('\n');

  const scenarios = [primary, ...result.alternatives]
    .map((scenario) => `  ${scenario.label}${scenario.id === primary.id ? ' (yours)' : ''}: ${percent(scenario.survivalRate, 1)} lasted — ${scenario.change ?? 'as you entered it'}`)
    .join('\n');

  const limitations = result.limitations.slice(0, 5)
    .map((limitation) => `  - ${limitation}`)
    .join('\n');

  return `YOUR RETIREMENT RESULTS

${verdictSentence(result, primary)}

${methodSentence(result)}

${percent(primary.survivalRate, 1)} of tested histories lasted.

${stats}

WHAT MOVES THE ANSWER
Working longer and spending less are the only changes six numbers can express.
Each row is a full re-run of the model against the same century of history.

${scenarios}

WHAT YOU ENTERED
${inputRows(result).map(([label, value]) => `  ${label}: ${value}`).join('\n')}

SIX NUMBERS ONLY GO SO FAR
This run used an asset-mix preset and the figures you typed. Ask Linc replaces both
with your actual holdings, spending, income, and Social Security timing, then keeps
the model available for the next question you have about it.

${DECISIONS.map((decision) => `  - ${decision}`).join('\n')}

${CTA_LABEL}:
${options.ctaUrl}

Free for 30 days. No credit card required. Your plan above is carried over.

Run the numbers again: ${options.calculatorUrl}

WHAT THIS RUN COULD NOT KNOW
${limitations}
  This is educational information, not financial advice.

These results were sent to ${options.email} at your request from the Ask Linc retirement calculator.
© ${new Date().getFullYear()} Ethan Teng Consulting LLC`;
}
