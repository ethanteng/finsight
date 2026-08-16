import {
  MODEL_SLOTS,
  getActiveModel,
  getActiveModelConfig,
  isModelSlotId,
  isPlausibleModelId,
  loadModelConfig,
  resetModelConfigCache,
  setActiveModelOverrides,
  slotDefault,
} from '../../openai/model-config';

const findUnique = jest.fn();

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ aiPromptConfig: { findUnique } }),
}));

describe('model config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    resetModelConfigCache();
    delete process.env.OPENAI_FALLBACK_MODEL;
    delete process.env.GEMINI_VALIDATION_MODEL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('resolution order', () => {
    it('falls back to the shipped default with no override and no env var', () => {
      expect(getActiveModel('analysis')).toBe('claude-sonnet-5');
      expect(getActiveModel('profile')).toBe('gpt-4o');
    });

    it('prefers the environment variable over the shipped default', () => {
      process.env.OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
      expect(getActiveModel('fallback')).toBe('gpt-4o-mini');
    });

    it('prefers an admin override over the environment variable', () => {
      process.env.GEMINI_VALIDATION_MODEL = 'gemini-from-env';
      setActiveModelOverrides({ validation: 'gemini-from-admin' });
      expect(getActiveModel('validation')).toBe('gemini-from-admin');
    });

    it('returns to the environment variable when an override is cleared', () => {
      process.env.OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
      setActiveModelOverrides({ fallback: 'gpt-4.1' });
      expect(getActiveModel('fallback')).toBe('gpt-4.1');

      setActiveModelOverrides({});
      expect(getActiveModel('fallback')).toBe('gpt-4o-mini');
    });
  });

  describe('normalization', () => {
    it('drops unknown slots, non-strings, and implausible ids', () => {
      setActiveModelOverrides({
        analysis: 'claude-opus-4-8',
        nonsense: 'gpt-4o',
        fallback: 42,
        validation: 'not a model id',
        profile: '   ',
      });

      expect(getActiveModel('analysis')).toBe('claude-opus-4-8');
      expect(getActiveModel('fallback')).toBe('gpt-4o');
      expect(getActiveModel('validation')).toBe('gemini-3-flash-preview');
      expect(getActiveModel('profile')).toBe('gpt-4o');
    });

    it('rejects values that are clearly not model ids', () => {
      expect(isPlausibleModelId('claude-opus-4-8')).toBe(true);
      expect(isPlausibleModelId('gemini-3-flash-preview')).toBe(true);
      expect(isPlausibleModelId('models/gemini-2.0')).toBe(false);
      expect(isPlausibleModelId('use the fast one please')).toBe(false);
      expect(isPlausibleModelId('https://example.com/model')).toBe(false);
      expect(isPlausibleModelId('')).toBe(false);
    });

    it('recognises exactly the shipped slot ids', () => {
      for (const slot of MODEL_SLOTS) expect(isModelSlotId(slot.id)).toBe(true);
      expect(isModelSlotId('embedding')).toBe(false);
    });

    it('offers retirement input extraction as a configurable slot', () => {
      // Every model the pipeline calls is admin-selectable. A model that reads
      // the numbers feeding a projection should not be the one exception,
      // pinned in source where changing it means a deploy.
      const slot = MODEL_SLOTS.find(entry => entry.id === 'retirementInputs');
      expect(slot).toMatchObject({ provider: 'openai', shippedDefault: 'gpt-4o' });
    });
  });

  describe('loadModelConfig', () => {
    it('reads overrides from the singleton config row', async () => {
      findUnique.mockResolvedValue({ models: { analysis: 'claude-opus-5' } });

      await loadModelConfig(true);

      expect(getActiveModel('analysis')).toBe('claude-opus-5');
    });

    it('keeps working when the database read fails', async () => {
      findUnique.mockRejectedValue(new Error('database down'));

      await expect(loadModelConfig(true)).resolves.toEqual({});
      expect(getActiveModel('analysis')).toBe('claude-sonnet-5');
    });

    it('treats a null models column as no overrides', async () => {
      findUnique.mockResolvedValue({ models: null });

      await loadModelConfig(true);

      expect(getActiveModel('profile')).toBe('gpt-4o');
    });
  });

  describe('getActiveModelConfig', () => {
    it('reports which slots an admin has actually overridden', async () => {
      process.env.OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
      setActiveModelOverrides({ analysis: 'claude-opus-4-8' });

      const byId = Object.fromEntries(getActiveModelConfig().map(slot => [slot.id, slot]));

      expect(byId.analysis).toMatchObject({ model: 'claude-opus-4-8', isOverridden: true });
      // Env-configured but not admin-overridden: the panel must not show this as
      // a local edit, or clearing it looks like a no-op.
      expect(byId.fallback).toMatchObject({
        model: 'gpt-4o-mini',
        defaultModel: 'gpt-4o-mini',
        isOverridden: false,
      });
    });
  });

  it('every slot has a usable shipped default', () => {
    for (const slot of MODEL_SLOTS) {
      expect(isPlausibleModelId(slotDefault(slot))).toBe(true);
    }
  });
});
