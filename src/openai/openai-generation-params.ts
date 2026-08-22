import { ModelSlotId, getActiveNumericGenerationSetting, openAIWireParameters } from './model-config';

/** The OpenAI slots — the ones whose calls take these parameters. */
export type OpenAISlotId = Extract<ModelSlotId, 'fallback' | 'profile' | 'contextPlanner'>;

/**
 * The tuning parameters for one OpenAI call, ready to spread into the request.
 *
 * Each resolves to null when set to `off`, and the key is then left out of the
 * request entirely rather than sent with a default value. That distinction is
 * the point: several newer OpenAI models reject a non-default `temperature`
 * outright, so being able to send nothing is what makes the setting safe to
 * expose to an admin — and it is how the two slots that send no ceiling today
 * keep sending none until someone asks for one.
 *
 * The model decides the shape: the ceiling goes out under whichever name that
 * model accepts, and a temperature it cannot honor is dropped rather than
 * turned into a failed request. An admin choosing a model should not also have
 * to know which parameter spelling it wants.
 */
export function openAIGenerationParams(slotId: OpenAISlotId, model: string): {
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
} {
  const temperature = getActiveNumericGenerationSetting(slotId, 'temperature');
  const maxTokens = getActiveNumericGenerationSetting(slotId, 'maxOutputTokens');
  const wire = openAIWireParameters(model);
  return {
    ...(temperature === null || !wire.acceptsTemperature ? {} : { temperature }),
    ...(maxTokens === null ? {} : { [wire.maxOutputTokensParameter]: maxTokens }),
  };
}
