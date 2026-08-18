import {
  questionMentionsSecurity,
  questionMentionsSecurityName,
  questionMentionsTicker,
} from '../../openai/security-question-match';

describe('questionMentionsSecurity', () => {
  it('matches a ticker only on a word boundary', () => {
    expect(questionMentionsTicker('How is SPY doing?', 'SPY')).toBe(true);
    expect(questionMentionsTicker('how is spy doing?', 'SPY')).toBe(true);
    expect(questionMentionsTicker('Tell me about SPYDER', 'SPY')).toBe(false);
    expect(questionMentionsTicker('anything', undefined)).toBe(false);
  });

  it('does not let a short or common security name match every question', () => {
    expect(questionMentionsSecurityName('What is my asset allocation?', 'ETF')).toBe(false);
    expect(questionMentionsSecurityName('Review my portfolio', 'Cash')).toBe(false);
    expect(questionMentionsSecurityName('How much cash do I hold?', 'Cash')).toBe(true);
  });

  it('matches a full fund name without matching a substring of another word', () => {
    const name = 'Vanguard Total International Stock ETF';
    expect(questionMentionsSecurityName(`What is in my ${name}?`, name)).toBe(true);
    expect(questionMentionsSecurityName('What is my international exposure?', name)).toBe(false);
  });

  it('treats a ticker match and a name match as equivalent', () => {
    expect(questionMentionsSecurity('What sectors are in VXUS?', 'VXUS', 'Vanguard Total International Stock ETF')).toBe(true);
    expect(questionMentionsSecurity('Review my portfolio', 'VXUS', 'Vanguard Total International Stock ETF')).toBe(false);
  });

  it('escapes regex metacharacters in tickers such as BRK.B', () => {
    expect(questionMentionsTicker('How is BRK.B doing?', 'BRK.B')).toBe(true);
    expect(questionMentionsTicker('How is BRKXB doing?', 'BRK.B')).toBe(false);
  });
});
