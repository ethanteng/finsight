import { jest } from '@jest/globals';

const mockCreate = jest.fn() as jest.MockedFunction<any>;
jest.mock('openai', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: mockCreate } },
})));
jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

import { PersonalContextExtractor } from '../../profile/personal-context-extractor';
import { personalContextValues, replacePersonalContextManually } from '../../profile/personal-context';

describe('PersonalContextExtractor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses structured patches based only on the user message', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ operations: [{
        field: 'age', action: 'set', stringValue: null, numberValue: 42,
        numberListValue: [], evidence: "I'm 42",
      }] }) } }],
    });
    const extractor = new PersonalContextExtractor();
    const result = await extractor.extractAndMerge({
      id: 'conversation-1', question: "I'm 42 and earn $200,000.", createdAt: new Date('2026-08-18T00:00:00.000Z'),
    }, {});

    expect(personalContextValues(result)).toEqual({ age: 42 });
    const request = mockCreate.mock.calls[0][0];
    expect(request.response_format.type).toBe('json_schema');
    expect(request.messages[1].content).toContain("I'm 42 and earn $200,000.");
    expect(request.messages[1].content).not.toContain('assistantAnswer');
  });

  it('returns existing memory unchanged when the model proposes no operation', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '{"operations":[]}' } }] });
    const existing = replacePersonalContextManually({ occupation: 'Teacher' }, '2026-08-18T00:00:00.000Z');
    const result = await new PersonalContextExtractor().extractAndMerge({
      id: 'conversation-2', question: 'What is my net worth?', createdAt: new Date(),
    }, existing);
    expect(result).toEqual(existing);
  });

  it('fails closed when extraction errors', async () => {
    mockCreate.mockRejectedValue(new Error('unavailable'));
    const existing = replacePersonalContextManually({ age: 40 }, '2026-08-18T00:00:00.000Z');
    await expect(new PersonalContextExtractor().extractAndMerge({
      id: 'conversation-3', question: "I'm 41", createdAt: new Date(),
    }, existing)).resolves.toEqual(existing);
  });
});
