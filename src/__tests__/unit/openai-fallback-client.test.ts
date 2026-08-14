import OpenAI from 'openai';
import { askOpenAIWithPreparedPrompt } from '../../openai/openai-fallback-client';

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

const originalApiKey = process.env.OPENAI_API_KEY;
const originalMaxTokens = process.env.ASK_LINC_MAX_OUTPUT_TOKENS;

describe('askOpenAIWithPreparedPrompt', () => {
  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalMaxTokens === undefined) delete process.env.ASK_LINC_MAX_OUTPUT_TOKENS;
    else process.env.ASK_LINC_MAX_OUTPUT_TOKENS = originalMaxTokens;
  });

  it('reuses the prepared prompt with the strict schema and an 8192-token default', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.ASK_LINC_MAX_OUTPUT_TOKENS;
    const constructor = OpenAI as unknown as jest.Mock;
    const client = new OpenAI({ apiKey: 'inspection-only' }) as any;
    constructor.mockImplementationOnce(() => client);
    client.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: '{"summary":"ok","key_numbers":{},"insights":[],"suggested_actions":[]}' } }],
    });

    await askOpenAIWithPreparedPrompt('system prompt', 'user message');

    expect(client.chat.completions.create).toHaveBeenCalledWith(expect.objectContaining({
      max_tokens: 8192,
      response_format: expect.objectContaining({ type: 'json_schema' }),
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user message' },
      ],
    }));
  });
});
