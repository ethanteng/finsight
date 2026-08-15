import {
  DEFAULT_ROUTING_TERMS,
  compileTerm,
  getActiveRoutingTerms,
  matchesCategory,
  matchingTerms,
  resetRoutingVocabularyCache,
  setActiveRoutingTerms,
} from '../../openai/routing-vocabulary';
import { analyzeQuestionNeeds } from '../../openai/question-analysis';

describe('routing vocabulary', () => {
  afterEach(resetRoutingVocabularyCache);

  it('compiles plain words without letting regex syntax through', () => {
    // An admin typing a bracket should get a literal, not a syntax error or a
    // pattern that can backtrack.
    expect(() => setActiveRoutingTerms({ home: ['a(b', 'c[d', '.*', 'x{2,}'] })).not.toThrow();
    expect(matchesCategory('home', 'what about a(b here')).toBe(true);
    expect(matchesCategory('home', 'anything at all')).toBe(false);
  });

  it('treats a trailing star as the word family', () => {
    expect(compileTerm('retir*')).toBe('\\bretir\\w*');
    setActiveRoutingTerms({ retirement: ['retir*'] });

    for (const word of ['retire', 'retires', 'retired', 'retiring', 'retirement', 'retiree']) {
      expect(matchesCategory('retirement', `thinking about ${word} soon`)).toBe(true);
    }
  });

  it('matches whole words, not fragments', () => {
    setActiveRoutingTerms({ home: ['home'] });
    expect(matchesCategory('home', 'my home is worth a lot')).toBe(true);
    expect(matchesCategory('home', 'homeopathy is not finance')).toBe(false);
  });

  it('allows multi-word phrases with flexible spacing', () => {
    setActiveRoutingTerms({ retirement: ['nest egg'] });
    expect(matchesCategory('retirement', 'is my nest egg enough')).toBe(true);
    expect(matchesCategory('retirement', 'is my nest  egg enough')).toBe(true);
    expect(matchesCategory('retirement', 'a nest of birds and an egg')).toBe(false);
  });

  it('keeps terms that start or end with a non-word character usable', () => {
    setActiveRoutingTerms({ investments: ['401k', 's&p 500'] });
    expect(matchesCategory('investments', 'my 401k balance')).toBe(true);
    expect(matchesCategory('investments', 'the s&p 500 index')).toBe(true);
  });

  it('rejects terms that would compile to nothing', () => {
    expect(compileTerm('   ')).toBeNull();
    expect(compileTerm('*')).toBeNull();
    expect(compileTerm('retir*')).not.toBeNull();
  });

  it('falls back to shipped defaults for categories the config omits', () => {
    setActiveRoutingTerms({ home: ['cottage'] });

    expect(getActiveRoutingTerms().home).toEqual(['cottage']);
    expect(getActiveRoutingTerms().retirement).toEqual(DEFAULT_ROUTING_TERMS.retirement);
    expect(matchesCategory('retirement', 'when can I retire?')).toBe(true);
  });

  it('treats an explicitly empty list as matching nothing', () => {
    setActiveRoutingTerms({ marketContext: [] });
    expect(matchesCategory('marketContext', 'what is the market doing?')).toBe(false);
  });

  it('survives a malformed config rather than routing nothing', () => {
    setActiveRoutingTerms('not an object');
    expect(matchesCategory('retirement', 'when can I retire?')).toBe(true);

    setActiveRoutingTerms({ retirement: [42, null, 'retir*'] });
    expect(getActiveRoutingTerms().retirement).toEqual(['retir*']);
  });

  it('reports which terms matched, for the admin tester', () => {
    expect(matchingTerms('retirement', 'my goal of retiring by age 62')).toEqual(['retir*']);
    expect(matchingTerms('home', 'my goal of retiring by age 62')).toEqual([]);
  });

  it('changes how a question routes when an admin adds a term', () => {
    const question = 'when am I done working for good?';
    expect(analyzeQuestionNeeds(question).needsRetirement).toBe(false);

    setActiveRoutingTerms({
      retirement: [...DEFAULT_ROUTING_TERMS.retirement, 'done working'],
    });
    expect(analyzeQuestionNeeds(question).needsRetirement).toBe(true);
  });

  it('leaves structural patterns alone when a category is emptied', () => {
    // "recent spending" is matched by shape, not by the term list, so clearing
    // the vocabulary must not silently disable it.
    setActiveRoutingTerms({ transactions: [] });
    expect(analyzeQuestionNeeds('show my recent spending').needsTransactionDetails).toBe(true);
  });
});
