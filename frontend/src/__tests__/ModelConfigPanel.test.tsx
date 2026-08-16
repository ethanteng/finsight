import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModelConfigPanel, { buildOptions } from '@/components/admin/ModelConfigPanel';

const CONFIG = {
  slots: [
    {
      id: 'analysis',
      label: 'Primary analysis',
      provider: 'anthropic',
      description: 'Writes every Ask Linc answer.',
      shippedDefault: 'claude-sonnet-4-5',
      defaultModel: 'claude-sonnet-4-5',
      model: 'claude-sonnet-4-5',
      isOverridden: false,
      verification: { status: 'served' as const },
    },
    {
      id: 'validation',
      label: 'Second review',
      provider: 'google',
      description: 'Independently checks an answer.',
      envVar: 'GEMINI_VALIDATION_MODEL',
      shippedDefault: 'gemini-3-flash-preview',
      defaultModel: 'gemini-3-flash-preview',
      model: 'gemini-3-flash-preview',
      isOverridden: false,
      verification: { status: 'unverified' as const, reason: 'Could not reach Google (Gemini): 500' },
    },
  ],
  providers: [
    {
      id: 'anthropic',
      label: 'Anthropic (Claude)',
      docsUrl: 'https://platform.claude.com/docs/en/about-claude/models/overview',
      apiKeyEnvVars: ['ANTHROPIC_API_KEY'],
      models: [
        { id: 'claude-sonnet-4-5', recommended: true },
        { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', recommended: true },
      ],
      fetchedAt: '2026-08-16T00:00:00.000Z',
    },
    {
      id: 'google',
      label: 'Google (Gemini)',
      docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
      apiKeyEnvVars: ['GOOGLE_AI_API_KEY', 'GEMINI_API_KEY'],
      models: null,
      unavailableReason: 'Could not reach Google (Gemini): 500',
      fetchedAt: '2026-08-16T00:00:00.000Z',
    },
  ],
};

function mockFetch(overrides: { put?: () => Promise<unknown> } = {}) {
  return jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = overrides.put ? await overrides.put() : { models: {}, updatedAt: '' };
      return { ok: true, json: async () => body } as Response;
    }
    return { ok: true, json: async () => CONFIG } as Response;
  });
}

describe('buildOptions', () => {
  it('groups chat models ahead of the rest', () => {
    const options = buildOptions(
      [
        { id: 'whisper-1', recommended: false },
        { id: 'gpt-4o', recommended: true },
      ],
      'gpt-4o'
    );

    expect(options.recommended.map(entry => entry.id)).toEqual(['gpt-4o']);
    expect(options.other.map(entry => entry.id)).toEqual(['whisper-1']);
  });

  it('keeps the configured model selectable when the catalog does not list it', () => {
    const options = buildOptions([{ id: 'gpt-4o', recommended: true }], 'gpt-4o-retired');

    expect(options.recommended.map(entry => entry.id)).toContain('gpt-4o-retired');
  });

  it('does not duplicate the configured model when the catalog already lists it', () => {
    const options = buildOptions([{ id: 'gpt-4o', recommended: true }], 'gpt-4o');

    expect(options.recommended.filter(entry => entry.id === 'gpt-4o')).toHaveLength(1);
  });

  it('handles an unavailable catalog', () => {
    const options = buildOptions(null, 'gpt-4o');

    expect(options.recommended.map(entry => entry.id)).toEqual(['gpt-4o']);
    expect(options.other).toEqual([]);
  });
});

describe('ModelConfigPanel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('offers the provider list as a dropdown instead of a text field', async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;

    render(<ModelConfigPanel apiUrl="http://api.test" getAuthHeaders={() => ({})} />);

    const select = await screen.findByLabelText(/Primary analysis/);
    expect(select.tagName).toBe('SELECT');
    expect(within(select).getByRole('option', { name: /claude-opus-4-8/ })).toBeInTheDocument();
    // The clear-the-override option names what it would fall back to.
    expect(
      within(select).getByRole('option', { name: /Use default \(claude-sonnet-4-5\)/ })
    ).toBeInTheDocument();
  });

  it('falls back to a text field when the provider list is unavailable', async () => {
    global.fetch = mockFetch() as unknown as typeof fetch;

    render(<ModelConfigPanel apiUrl="http://api.test" getAuthHeaders={() => ({})} />);

    const input = await screen.findByLabelText(/Second review/);
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByText(/Could not reach Google/)).toBeInTheDocument();
  });

  it('submits the chosen model and reports success', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ModelConfigPanel apiUrl="http://api.test" getAuthHeaders={() => ({})} />);

    const select = await screen.findByLabelText(/Primary analysis/);
    await user.selectOptions(select, 'claude-opus-4-8');
    await user.click(screen.getByRole('button', { name: /Save models/ }));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(JSON.parse((put?.[1] as RequestInit).body as string).models.analysis).toBe(
        'claude-opus-4-8'
      );
    });
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
  });

  it('offers "use anyway" only when the server rejected the model as unlisted', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return {
          ok: false,
          json: async () => ({
            error: 'Primary analysis: "claude-x" is not a model your API key can call. Check the provider\'s model list, or save again with "use anyway" if you know it is valid.',
            unlisted: true,
          }),
        } as Response;
      }
      return { ok: true, json: async () => CONFIG } as Response;
    }) as unknown as typeof fetch;

    render(<ModelConfigPanel apiUrl="http://api.test" getAuthHeaders={() => ({})} />);

    await screen.findByLabelText(/Primary analysis/);
    expect(screen.queryByRole('button', { name: /Use anyway/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save models/ }));

    expect(await screen.findByRole('button', { name: /Use anyway/ })).toBeInTheDocument();
  });
});
