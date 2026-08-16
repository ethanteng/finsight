import {
  OMIT_SETTING,
  generationSettingsForSlot,
  getActiveGenerationSetting,
  getActiveGenerationSettings,
  getActiveNumericGenerationSetting,
  isGenerationSettingId,
  isValidGenerationSettingValue,
  loadModelConfig,
  resetModelConfigCache,
  setActiveGenerationSettings,
  setActiveModelOverrides,
} from '../../openai/model-config';
import { openAIGenerationParams } from '../../openai/openai-generation-params';

const findUnique = jest.fn();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ aiPromptConfig: { findUnique } }),
}));

describe('generation settings', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue(null);
    resetModelConfigCache();
    delete process.env.ASK_LINC_MAX_OUTPUT_TOKENS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('shipped defaults preserve the behaviour they replaced', () => {
    it('keeps the primary path on adaptive thinking at medium effort', () => {
      expect(getActiveGenerationSetting('analysis', 'thinking')).toBe('adaptive');
      expect(getActiveGenerationSetting('analysis', 'effort')).toBe('medium');
      expect(getActiveNumericGenerationSetting('analysis', 'maxOutputTokens')).toBe(16_000);
    });

    it('keeps each OpenAI call on the temperature it was hardcoded with', () => {
      expect(openAIGenerationParams('fallback')).toEqual({ temperature: 0.2, max_tokens: 16_000 });
      expect(openAIGenerationParams('profile')).toEqual({ temperature: 0.1 });
      expect(openAIGenerationParams('retirementInputs')).toEqual({ temperature: 0 });
    });

    it('sends Gemini nothing, as the validator did before these settings existed', () => {
      expect(getActiveNumericGenerationSetting('validation', 'temperature')).toBeNull();
      expect(getActiveNumericGenerationSetting('validation', 'maxOutputTokens')).toBeNull();
    });
  });

  describe('resolution order', () => {
    it('prefers the environment variable over the shipped default', () => {
      process.env.ASK_LINC_MAX_OUTPUT_TOKENS = '32000';
      expect(getActiveNumericGenerationSetting('analysis', 'maxOutputTokens')).toBe(32_000);
    });

    it('ignores an environment value outside the setting range', () => {
      // A misconfigured env var is not an instruction to break the pipeline.
      process.env.ASK_LINC_MAX_OUTPUT_TOKENS = '999999';
      expect(getActiveNumericGenerationSetting('analysis', 'maxOutputTokens')).toBe(16_000);
    });

    it('prefers an admin override over the environment variable', () => {
      process.env.ASK_LINC_MAX_OUTPUT_TOKENS = '32000';
      setActiveGenerationSettings({ analysis: { maxOutputTokens: '8192' } });
      expect(getActiveNumericGenerationSetting('analysis', 'maxOutputTokens')).toBe(8_192);
    });

    it('returns to the environment variable when an override is cleared', () => {
      process.env.ASK_LINC_MAX_OUTPUT_TOKENS = '32000';
      setActiveGenerationSettings({ analysis: { maxOutputTokens: '8192' } });
      setActiveGenerationSettings({});
      expect(getActiveNumericGenerationSetting('analysis', 'maxOutputTokens')).toBe(32_000);
    });
  });

  describe('omission', () => {
    it('drops a parameter set to off rather than sending a default', () => {
      setActiveGenerationSettings({ retirementInputs: { temperature: OMIT_SETTING } });
      expect(openAIGenerationParams('retirementInputs')).toEqual({});
    });

    it('adds a parameter that ships omitted once a value is set', () => {
      setActiveGenerationSettings({ profile: { maxOutputTokens: '2048' } });
      expect(openAIGenerationParams('profile')).toEqual({ temperature: 0.1, max_tokens: 2048 });
    });

    it('refuses to omit a parameter the provider requires', () => {
      // Anthropic rejects a request with no max_tokens, so there is no provider
      // default to fall back to and `off` must not be storable.
      const setting = generationSettingsForSlot('analysis').find(s => s.id === 'maxOutputTokens')!;
      expect(setting.omittable).toBe(false);
      expect(isValidGenerationSettingValue(setting, OMIT_SETTING)).toBe(false);

      setActiveGenerationSettings({ analysis: { maxOutputTokens: OMIT_SETTING } });
      expect(getActiveNumericGenerationSetting('analysis', 'maxOutputTokens')).toBe(16_000);
    });
  });

  describe('normalization', () => {
    it('drops unknown slots, unknown settings, non-strings and out-of-range values', () => {
      setActiveGenerationSettings({
        analysis: { effort: 'high', thinking: 'sideways', maxOutputTokens: 4096 },
        nonsense: { effort: 'low' },
        profile: { effort: 'high' },
        fallback: { temperature: '9' },
      });

      expect(getActiveGenerationSetting('analysis', 'effort')).toBe('high');
      // Invalid enum value, wrong type, and a setting the slot does not expose.
      expect(getActiveGenerationSetting('analysis', 'thinking')).toBe('adaptive');
      expect(getActiveNumericGenerationSetting('analysis', 'maxOutputTokens')).toBe(16_000);
      expect(getActiveNumericGenerationSetting('fallback', 'temperature')).toBe(0.2);
    });

    it('rejects a setting a slot does not expose', () => {
      // Effort has no meaning for an OpenAI call, so it has no call site to reach.
      expect(generationSettingsForSlot('profile').map(s => s.id)).toEqual([
        'temperature',
        'maxOutputTokens',
      ]);
      expect(() => getActiveGenerationSetting('profile', 'effort')).toThrow();
    });

    it('recognises exactly the shipped setting ids', () => {
      for (const id of ['thinking', 'effort', 'maxOutputTokens', 'temperature']) {
        expect(isGenerationSettingId(id)).toBe(true);
      }
      expect(isGenerationSettingId('top_p')).toBe(false);
    });

    it('accepts a decimal temperature but not a decimal token count', () => {
      const temperature = generationSettingsForSlot('fallback').find(s => s.id === 'temperature')!;
      const tokens = generationSettingsForSlot('fallback').find(s => s.id === 'maxOutputTokens')!;

      expect(isValidGenerationSettingValue(temperature, '0.35')).toBe(true);
      expect(isValidGenerationSettingValue(temperature, '2.1')).toBe(false);
      expect(isValidGenerationSettingValue(tokens, '4096.5')).toBe(false);
      expect(isValidGenerationSettingValue(tokens, '4096')).toBe(true);
    });
  });

  describe('cache freshness', () => {
    it('still loads settings after a save that carried only models', async () => {
      // A client from before generation settings existed, or one mid-rolling
      // deploy, PUTs models alone. That save must not mark the settings cache
      // current: on a cold instance it is empty, and suppressing the reload
      // would run every request on defaults while overrides sat in the row.
      findUnique.mockResolvedValue({
        models: {},
        generationSettings: { analysis: { effort: 'xhigh' } },
      });

      setActiveModelOverrides({ analysis: 'claude-opus-5' });
      await loadModelConfig();

      expect(findUnique).toHaveBeenCalled();
      expect(getActiveGenerationSetting('analysis', 'effort')).toBe('xhigh');
    });

    it('does not re-read the row when both halves are fresh', async () => {
      findUnique.mockResolvedValue({ models: {}, generationSettings: {} });
      await loadModelConfig(true);
      findUnique.mockClear();

      await loadModelConfig();

      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('getActiveGenerationSettings', () => {
    it('reports which settings an admin has actually overridden', () => {
      process.env.ASK_LINC_MAX_OUTPUT_TOKENS = '32000';
      setActiveGenerationSettings({ analysis: { effort: 'xhigh' } });

      const analysis = getActiveGenerationSettings().find(entry => entry.slotId === 'analysis')!;
      const byId = Object.fromEntries(analysis.settings.map(setting => [setting.id, setting]));

      expect(byId.effort).toMatchObject({ value: 'xhigh', isOverridden: true });
      // Env-configured but not admin-overridden: the panel must not show this as
      // a local edit, or clearing it looks like a no-op.
      expect(byId.maxOutputTokens).toMatchObject({
        value: '32000',
        defaultValue: '32000',
        isOverridden: false,
      });
    });
  });
});
