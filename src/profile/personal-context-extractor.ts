import OpenAI from 'openai';
import * as Sentry from '@sentry/node';
import { getActiveModel } from '../openai/model-config';
import { openAIGenerationParams } from '../openai/openai-generation-params';
import {
  EMPLOYMENT_STATUSES,
  HOUSEHOLD_STATUSES,
  PERSONAL_CONTEXT_FIELDS,
  RETIREMENT_STATUSES,
  applyPersonalContextOperations,
  personalContextValues,
  type PersonalContextFacts,
  type PersonalContextOperation,
} from './personal-context';

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface PersonalContextConversation {
  id: string;
  question: string;
  createdAt: Date;
}

const PERSONAL_CONTEXT_OPERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operations'],
  properties: {
    operations: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'action', 'stringValue', 'numberValue', 'numberListValue', 'evidence'],
        properties: {
          field: { type: 'string', enum: [...PERSONAL_CONTEXT_FIELDS] },
          action: { type: 'string', enum: ['set', 'clear'] },
          stringValue: { type: ['string', 'null'] },
          numberValue: { type: ['number', 'null'] },
          numberListValue: { type: 'array', items: { type: 'number' }, maxItems: 20 },
          evidence: { type: 'string', minLength: 2, maxLength: 300 },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You extract only explicit, durable biographical context that a user directly states about themself.

Allowed fields:
- preferredName: what the user asks to be called
- age: current age, never a planned or retirement age
- city, stateOrProvince, country: coarse location only; never a street address
- householdStatus: ${HOUSEHOLD_STATUSES.join(', ')}
- dependentCount and dependentAges
- occupation and industry
- employmentStatus: ${EMPLOYMENT_STATUSES.join(', ')}
- retirementStatus: ${RETIREMENT_STATUSES.join(', ')}

Strict boundaries:
- Read only the newest USER MESSAGE. Assistant answers are not evidence.
- Do not store income, balances, debt, spending, investments, institutions, property values, goals, deadlines, scenario assumptions, risk tolerance, health, disability, race, ethnicity, religion, politics, sexuality, immigration status, exact birth date, street address, email, phone number, or account identifiers.
- Do not infer a field from a question, financial behavior, name, location, or stereotype.
- Emit a set operation only for a direct statement. A correction replaces the existing value.
- Emit a clear operation only when the user explicitly asks Linc to forget a field or explicitly says it no longer applies without supplying a replacement.
- evidence must be an exact, contiguous quote from the user message that supports the operation.
- For set, populate only the value slot appropriate for the field: stringValue, numberValue, or numberListValue. Use null or [] for the others.
- If the message contains no allowed explicit fact, return an empty operations array.

Return the required JSON object only.`;

function parseOperations(content: string | null | undefined): PersonalContextOperation[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { operations?: unknown };
    return Array.isArray(parsed.operations) ? parsed.operations as PersonalContextOperation[] : [];
  } catch {
    return [];
  }
}

export class PersonalContextExtractor {
  async extractAndMerge(
    conversation: PersonalContextConversation,
    existing: PersonalContextFacts
  ): Promise<PersonalContextFacts> {
    if (!conversation.question.trim()) return existing;
    const model = getActiveModel('profile');
    try {
      const response = await openaiClient.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              existingMemory: personalContextValues(existing),
              userMessage: conversation.question,
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'personal_context_operations',
            strict: true,
            schema: PERSONAL_CONTEXT_OPERATION_SCHEMA,
          },
        },
        ...openAIGenerationParams('profile', model),
      });
      const operations = parseOperations(response.choices[0]?.message?.content);
      return applyPersonalContextOperations(existing, operations, {
        question: conversation.question,
        conversationId: conversation.id,
        observedAt: conversation.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('Error extracting personal context from conversation:', error);
      Sentry.captureException(error);
      return existing;
    }
  }
}

export { PERSONAL_CONTEXT_OPERATION_SCHEMA, SYSTEM_PROMPT as PERSONAL_CONTEXT_EXTRACTOR_PROMPT };
