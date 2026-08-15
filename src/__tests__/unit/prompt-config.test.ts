import {
  DEFAULT_RESPONSE_TONE,
  getActiveResponseTone,
  setActiveResponseTone,
  resetResponseToneCache,
} from '../../openai/prompt-config';
import { buildFinancialReasoningPrompt, FinancialReasoningPromptInput } from '../../openai/financial-reasoning-prompt';

const baseInput: FinancialReasoningPromptInput = {
  question: 'How much do I spend each month?',
  financialContext: '# Financial Overview\nNet Worth: $250,000.00',
  userProfile: 'Age 40, married.',
  marketSummary: 'Markets were flat.',
  ragKnowledge: 'Some retrieved knowledge.',
};

const CUSTOM_TONE = '- Speak like a formal financial advisor.\n- Avoid contractions and slang.';

describe('prompt-config response tone', () => {
  afterEach(() => {
    resetResponseToneCache();
  });

  it('exposes a non-empty default tone and returns it by default', () => {
    expect(DEFAULT_RESPONSE_TONE.length).toBeGreaterThan(0);
    expect(getActiveResponseTone()).toBe(DEFAULT_RESPONSE_TONE);
  });

  it('updates the active tone via setActiveResponseTone', () => {
    setActiveResponseTone(CUSTOM_TONE);
    expect(getActiveResponseTone()).toBe(CUSTOM_TONE);
  });

  it('falls back to the default when set to an empty value', () => {
    setActiveResponseTone('   ');
    expect(getActiveResponseTone()).toBe(DEFAULT_RESPONSE_TONE);
  });

  it('injects the active tone into the Claude reasoning system prompt', () => {
    setActiveResponseTone(CUSTOM_TONE);
    const { systemPrompt } = buildFinancialReasoningPrompt(baseInput);
    expect(systemPrompt).toContain('Speak like a formal financial advisor.');
    expect(systemPrompt).toContain('Tone for all user-facing fields');
  });
});
