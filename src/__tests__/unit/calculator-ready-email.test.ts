/**
 * The "your result is ready in Ask Linc" email.
 *
 * Its one job is to bring someone back into signup without handing them the
 * answer, so what matters is what it leaves out: no verdict and no figure the
 * calculator produced, in any of the three places a reader sees text.
 */

import { buildCalculatorReadyEmail } from '../../email/calculator-ready';
import { coastFireInputRows } from '../../email/coast-fire-results';
import { calculateCoastFire } from '../../services/coast-fire';

const RESULT = calculateCoastFire({
  currentAge: 40,
  retirementAge: 65,
  currentSavings: 400_000,
  annualRetirementSpending: 80_000,
  annualRetirementIncome: 30_000,
  realReturnRate: 5,
  withdrawalRate: 4,
});

const CTA = 'https://asklinc.com/coast-fire/continue?ref=' + 'a'.repeat(48);

function build() {
  return buildCalculatorReadyEmail({
    calculator: 'coast_fire',
    inputs: coastFireInputRows(RESULT),
    email: 'reader@example.com',
    ctaUrl: CTA,
  });
}

describe('calculator ready email', () => {
  it('states no result anywhere a reader would see it', () => {
    const message = build();

    for (const part of [message.subject, message.html, message.text]) {
      // The Coast FIRE number and the target the formula produced.
      expect(part).not.toContain('369,128');
      expect(part).not.toContain('1,250,000');
      expect(part).not.toMatch(/reached|not yet/i);
    }
  });

  it('carries the link back in, in both parts', () => {
    const message = build();

    expect(message.html).toContain(CTA);
    expect(message.text).toContain(CTA);
  });

  it('echoes what the visitor entered so it is recognisably theirs', () => {
    const message = build();

    expect(message.text).toContain('Retirement savings today: $400,000');
    expect(message.html).toContain('$400,000');
  });

  it('names the calculator it came from', () => {
    expect(build().subject).toBe('Your Coast FIRE result is ready in Ask Linc');
    expect(buildCalculatorReadyEmail({
      calculator: 'retirement',
      inputs: [],
      email: 'reader@example.com',
      ctaUrl: CTA,
    }).subject).toBe('Your retirement result is ready in Ask Linc');
  });

  it('asks an existing account to sign in rather than choose a password', () => {
    const message = buildCalculatorReadyEmail({
      calculator: 'coast_fire',
      inputs: [],
      email: 'reader@example.com',
      ctaUrl: CTA,
      existingAccount: true,
    });

    for (const part of [message.html, message.text]) {
      expect(part).toContain('Sign in to your Ask Linc account');
      expect(part).not.toMatch(/choose a password|no credit card/i);
    }
    expect(build().text).toMatch(/Choose a password/);
  });
});
