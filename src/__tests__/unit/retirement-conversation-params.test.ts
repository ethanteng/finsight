/**
 * The four-turn failure this covers: the user said "$125K annual spending",
 * then "re-run my retirement analysis", then confirmed the number outright, and
 * every turn came back asking for the spending figure they had just given.
 * Two defects stacked — the amount wording never parsed, and each turn was
 * parsed in isolation from the thread it belonged to.
 */

import {
  parseRetirementConversation,
  parseRetirementQuestion,
} from '../../retirement-analytics/retirement-question-parser';

describe('annual spending wording', () => {
  const cases: Array<[string, number]> = [
    ['Re-run my retirement analysis based on $125K annual spending.', 125_000],
    ['Let me retire on $125,000 a year', 125_000],
    ['I want to retire spending $125k/yr', 125_000],
    ['Plan my retirement around annual spending of $125,000', 125_000],
    ['For retirement, our yearly budget is going to be $125k', 125_000],
    ['Can I retire with a $9,500 monthly budget — $114,000 each year?', 114_000],
  ];

  it.each(cases)('reads the annual amount from %j', (question, expected) => {
    expect(parseRetirementQuestion(question).annualWithdrawalAmount).toBe(expected);
  });

  it('still reads the older withdrawal wording', () => {
    expect(
      parseRetirementQuestion('Can I withdraw $100k annually in retirement?').annualWithdrawalAmount
    ).toBe(100_000);
    expect(
      parseRetirementQuestion('Retirement plan with $1.5 million per year in withdrawals')
        .annualWithdrawalAmount
    ).toBe(1_500_000);
  });

  it('reads an unformatted six-figure amount as itself, not as its last digit', () => {
    // "spend 150000 per year" used to match the trailing "0" — the only digit
    // run followed by " per year" — and the projection ran on a $0 withdrawal.
    expect(
      parseRetirementQuestion('In retirement I plan to spend 150000 per year').annualWithdrawalAmount
    ).toBe(150_000);
  });

  it('reads a bare comma-formatted reply as the annual spend', () => {
    expect(parseRetirementConversation('125,000', ['Re-run my retirement analysis.']).annualWithdrawalAmount).toBe(
      125_000
    );
    expect(parseRetirementConversation('125000', ['Re-run my retirement analysis.']).annualWithdrawalAmount).toBe(
      125_000
    );
    expect(parseRetirementConversation('125k', ['Re-run my retirement analysis.']).annualWithdrawalAmount).toBe(
      125_000
    );
  });

  it('does not read a bare age reply as an annual spend', () => {
    // "62" answers "what age do you plan to retire?" at least as often as it
    // answers "how much per year?". Read as spending it would project a $62
    // annual withdrawal — silently, since a parsed 62 clears the missing-input
    // check. Below the floor the assistant asks instead.
    for (const reply of ['62', '48', '95', 'about 62']) {
      expect(
        parseRetirementConversation(reply, ['Re-run my retirement analysis.']).annualWithdrawalAmount
      ).toBeUndefined();
    }
  });

  it('does not read a bare monthly-sized figure as the annual spend', () => {
    // "$2,100" is a mortgage payment or a month of expenses, not a year of
    // retirement. Parsed, it clears the missing-input check and the projection
    // runs on $2,100/year without ever asking.
    for (const reply of ['$2,100', '2100', '5,000']) {
      expect(
        parseRetirementConversation(reply, ['Re-run my retirement analysis.']).annualWithdrawalAmount
      ).toBeUndefined();
    }
    // A sentence that says what the number is stays readable at any size.
    expect(
      parseRetirementQuestion('I plan to spend $8,000 per year in retirement').annualWithdrawalAmount
    ).toBe(8_000);
  });

  it('does not read a monthly figure as the annual spend', () => {
    const result = parseRetirementQuestion(
      'What if we pay off our mortgage before retirement? That would drop our monthly expenses by around $2,100.'
    );
    expect(result.annualWithdrawalAmount).toBeUndefined();
  });

  it('does not read an incidental annual charge as the retirement spend', () => {
    const result = parseRetirementQuestion(
      'Does the $500 annual fee on that card matter for my retirement plan?'
    );
    expect(result.annualWithdrawalAmount).toBeUndefined();
  });

  it('does not treat earnings in a retirement question as the spending target', () => {
    for (const question of [
      'I earn $200k a year, can I retire at 65?',
      'My salary is $200k annually — am I on track to retire?',
      'I make $150k per year. When can I retire?',
    ]) {
      expect(parseRetirementQuestion(question).annualWithdrawalAmount).toBeUndefined();
    }
  });
});

describe('parseRetirementConversation', () => {
  it('carries an amount from an earlier turn into a bare re-run request', () => {
    const result = parseRetirementConversation('Re-run my retirement analysis.', [
      "Let's say it drops our yearly spending down to about $125K.",
      'What if we pay off our mortgage in 10 years?',
    ]);

    expect(result.annualWithdrawalAmount).toBe(125_000);
  });

  it('lets the current message override an amount from an earlier turn', () => {
    const result = parseRetirementConversation(
      'Actually re-run my retirement analysis at $110k a year.',
      ["Let's say our yearly spending drops to about $125K."]
    );

    expect(result.annualWithdrawalAmount).toBe(110_000);
  });

  it('carries a retirement age forward and derives the withdrawal start from it', () => {
    const result = parseRetirementConversation('Re-run my retirement analysis at $125k a year.', [
      'What about retiring at 58?',
    ]);

    expect(result.retirementAge).toBe(58);
    expect(result.withdrawalStartAge).toBe(58);
  });

  it('takes the most recent statement when turns disagree', () => {
    const result = parseRetirementConversation('Re-run my retirement analysis.', [
      'Make it $125k annual spending.',
      'I am planning on spending about $150K per year in retirement.',
    ]);

    expect(result.annualWithdrawalAmount).toBe(125_000);
  });

  it('does not turn an earlier earnings figure into a spending target', () => {
    // The carry-forward reads the user's last ten questions. Without a topical
    // gate, an unrelated salary sentence silently becomes the retirement
    // spending target and the projection runs on it.
    const result = parseRetirementConversation('Can I retire at 65?', [
      'I earn $200k a year',
      'How are my investments doing?',
    ]);

    expect(result.annualWithdrawalAmount).toBeUndefined();
  });

  it('does not carry an unrelated annual figure forward on period wording alone', () => {
    const result = parseRetirementConversation('Can I retire at 65?', [
      'My rental brings in $48,000 a year',
    ]);

    expect(result.annualWithdrawalAmount).toBeUndefined();
  });

  it('still carries a spending figure forward from a turn that never says "retirement"', () => {
    const result = parseRetirementConversation('Can I retire at 65?', [
      "Let's say it drops our yearly spending down to about $125K.",
    ]);

    expect(result.annualWithdrawalAmount).toBe(125_000);
  });

  it('carries a short amount reply from an earlier turn into a re-run request', () => {
    for (const prior of ['$125K a year', '125,000', '125k']) {
      expect(
        parseRetirementConversation('Re-run my retirement analysis.', [prior]).annualWithdrawalAmount
      ).toBe(125_000);
    }
  });

  it('does not carry a salary sentence forward even when it is short', () => {
    expect(
      parseRetirementConversation('Can I retire at 65?', ['I earn $200k a year']).annualWithdrawalAmount
    ).toBeUndefined();
  });

  it('trusts any wording from an earlier turn that is explicitly about retiring', () => {
    const result = parseRetirementConversation('Re-run that analysis.', [
      'I am planning on spending about $150K per year in retirement.',
    ]);

    expect(result.annualWithdrawalAmount).toBe(150_000);
  });

  it('keeps the number from a confirmation that never says "retirement"', () => {
    // The turn that broke the loop in production. parseRetirementQuestion drops
    // it — no retirement word, so it returns nothing at all — and the projection
    // went on asking for a figure the user had just confirmed.
    const confirmation = 'Yes, I can confirm $125K as my target annual spending';
    expect(parseRetirementQuestion(confirmation).annualWithdrawalAmount).toBeUndefined();

    const result = parseRetirementConversation(confirmation, [
      'Re-run my retirement analysis.',
      'What about retiring at 58?',
    ]);

    expect(result.hasRetirementIntent).toBe(false);
    expect(result.annualWithdrawalAmount).toBe(125_000);
    expect(result.retirementAge).toBe(58);
  });
});
