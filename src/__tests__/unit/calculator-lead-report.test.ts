import { buildCalculatorLeadSummary } from '../../services/calculator-lead-report';

const start = new Date('2026-09-01T00:00:00.000Z');
const end = new Date('2026-10-01T00:00:00.000Z');

describe('calculator lead report', () => {
  it('separates requests, delivery, continuation, and later account matches', () => {
    const report = buildCalculatorLeadSummary({
      periodStart: start,
      periodEndExclusive: end,
      leads: [
        { email: 'A@example.com', emailSent: true, mailerliteSynced: true, continuedAt: new Date('2026-09-03'), createdAt: new Date('2026-09-02') },
        { email: 'a@example.com', emailSent: true, mailerliteSynced: false, continuedAt: null, createdAt: new Date('2026-09-04') },
        { email: 'b@example.com', emailSent: false, mailerliteSynced: false, continuedAt: null, createdAt: new Date('2026-09-05') },
      ],
      accounts: [
        { email: 'a@example.com', createdAt: new Date('2026-09-06') },
        { email: 'b@example.com', createdAt: new Date('2026-09-01') },
      ],
    });

    expect(report).toMatchObject({
      requests: 3,
      emailsSent: 2,
      uniqueEmails: 2,
      mailerliteSynced: 1,
      continuedToSignup: 1,
      matchedAccounts: 1,
      deliveryRate: 2 / 3,
      continuationRate: 1 / 2,
      accountMatchRate: 1 / 2,
    });
  });

  it('uses null rather than zero for rates with no denominator', () => {
    const report = buildCalculatorLeadSummary({
      periodStart: start,
      periodEndExclusive: end,
      leads: [],
      accounts: [],
    });
    expect(report.deliveryRate).toBeNull();
    expect(report.continuationRate).toBeNull();
    expect(report.accountMatchRate).toBeNull();
  });
});
