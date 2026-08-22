import { ModelSlotId, getActiveNumericGenerationSetting } from './model-config';

/** The OpenAI slots — the ones whose calls take these parameters. */
export type OpenAISlotId = Extract<ModelSlotId, 'fallback' | 'profile' | 'contextPlanner'>;

/**
 * OpenAI model families that renamed the output ceiling to
 * `max_completion_tokens` and accept only their own sampling temperature.
 *
 * Sending the older names to one of these is a 400, not a warning, so the slot
 * fails every call until someone reads the logs: pointing the context planner
 * at gpt-5 silently turned every plan into "include every context pack" until
 * the parameters were adapted here. GPT-5 and later are matched as a family
 * rather than listed, so the next model an admin selects does not repeat it.
 */
function usesCompletionTokenCeiling(model: string): boolean {
  return /^(?:o\d|gpt-(?:[5-9]|\d{2,}))/.test(model.trim().toLowerCase());
}

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
  const renamedCeiling = usesCompletionTokenCeiling(model);
  return {
    ...(temperature === null || renamedCeiling ? {} : { temperature }),
    ...(maxTokens === null
      ? {}
      : renamedCeiling
        ? { max_completion_tokens: maxTokens }
        : { max_tokens: maxTokens }),
  };
}
