import { ModelSlotId, getActiveNumericGenerationSetting } from './model-config';

/** The OpenAI slots — the ones whose calls take these parameters. */
export type OpenAISlotId = Extract<ModelSlotId, 'fallback' | 'profile' | 'retirementInputs'>;

/**
 * The tuning parameters for one OpenAI call, ready to spread into the request.
 *
 * Each resolves to null when set to `off`, and the key is then left out of the
 * request entirely rather than sent with a default value. That distinction is
 * the point: several newer OpenAI models reject a non-default `temperature`
 * outright, so being able to send nothing is what makes the setting safe to
 * expose to an admin — and it is how the two slots that send no `max_tokens`
 * today keep sending none until someone asks for one.
 */
export function openAIGenerationParams(slotId: OpenAISlotId): {
  temperature?: number;
  max_tokens?: number;
} {
  const temperature = getActiveNumericGenerationSetting(slotId, 'temperature');
  const maxTokens = getActiveNumericGenerationSetting(slotId, 'maxOutputTokens');
  return {
    ...(temperature === null ? {} : { temperature }),
    ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
  };
}
