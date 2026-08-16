import { supportsAdaptiveThinking } from '../../openai/claude-client';

/**
 * The analysis slot is admin-selectable from the provider's live model list, so
 * these ids are not hypothetical: picking one that rejects adaptive thinking
 * would take the primary provider out of service and route every answer through
 * the OpenAI fallback while the panel still named the Claude model.
 */
describe('supportsAdaptiveThinking', () => {
  it('accepts the 5 series', () => {
    for (const model of ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5', 'claude-mythos-5']) {
      expect(supportsAdaptiveThinking(model)).toBe(true);
    }
  });

  it('accepts 4.6 and later, where adaptive thinking was introduced', () => {
    for (const model of ['claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8', 'claude-sonnet-4-6']) {
      expect(supportsAdaptiveThinking(model)).toBe(true);
    }
  });

  it('rejects the pre-4.6 models the provider still serves', () => {
    for (const model of ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5', 'claude-opus-4-1', 'claude-sonnet-4-0']) {
      expect(supportsAdaptiveThinking(model)).toBe(false);
    }
  });

  it('reads the version out of a dated snapshot id', () => {
    expect(supportsAdaptiveThinking('claude-haiku-4-5-20251001')).toBe(false);
    expect(supportsAdaptiveThinking('claude-sonnet-4-5-20250929')).toBe(false);
  });

  it('rejects the older family-last naming scheme', () => {
    // `claude-3-7-sonnet` puts the version first; nothing in that generation
    // takes these parameters, so failing to parse it must not read as support.
    expect(supportsAdaptiveThinking('claude-3-7-sonnet-20250219')).toBe(false);
    expect(supportsAdaptiveThinking('claude-3-opus-20240229')).toBe(false);
  });

  it('treats anything it cannot parse as unsupported', () => {
    for (const model of ['', 'gpt-4o', 'claude', 'claude-opus', 'some-future-thing']) {
      expect(supportsAdaptiveThinking(model)).toBe(false);
    }
  });

  it('assumes support for a later generation of a known family', () => {
    // A model newer than this code should get the modern parameters rather than
    // silently dropping to the legacy request shape.
    expect(supportsAdaptiveThinking('claude-opus-6')).toBe(true);
    expect(supportsAdaptiveThinking('claude-sonnet-6-2')).toBe(true);
  });
});
