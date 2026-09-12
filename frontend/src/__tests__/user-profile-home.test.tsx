import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserProfile from '../components/UserProfile';

global.fetch = jest.fn();

const localStorageMock = {
  getItem: jest.fn(() => 'test-token'),
  removeItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
global.localStorage = localStorageMock as Storage;

const HOME = {
  address: '1 Main St, Springfield, IL 62704',
  value: 400000,
  valueLow: 380000,
  valueHigh: 420000,
  lastUpdated: '2026-09-01T00:00:00.000Z',
  isManualOverride: false,
};

interface FetchCall {
  url: string;
  method: string;
}

let calls: FetchCall[] = [];

/** Serve the two loads UserProfile makes on mount, plus whatever the test exercises. */
function mockFetch(overrides: (url: string, method: string) => unknown = () => undefined) {
  calls = [];
  (global.fetch as jest.Mock).mockImplementation((url: string, options?: { method?: string }) => {
    const method = options?.method || 'GET';
    calls.push({ url, method });

    const override = overrides(url, method);
    if (override) return Promise.resolve(override);

    if (url.endsWith('/profile') && method === 'GET') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ memory: {} }) });
    }
    if (url.endsWith('/profile/home') && method === 'GET') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ hasHome: true, homeData: HOME }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
}

async function renderWithHome() {
  render(<UserProfile userId="user-1" />);
  expect(await screen.findByText('Remove Home')).toBeInTheDocument();
}

describe('UserProfile home removal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('test-token');
  });

  it('deletes the home once the confirmation is accepted', async () => {
    mockFetch((url, method) =>
      url.endsWith('/profile/home') && method === 'DELETE'
        ? { ok: true, status: 200, json: async () => ({ success: true }) }
        : undefined
    );
    await renderWithHome();

    fireEvent.click(screen.getByText('Remove Home'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove home' }));

    await waitFor(() => {
      expect(calls).toContainEqual(
        expect.objectContaining({ method: 'DELETE', url: expect.stringContaining('/profile/home') })
      );
    });
    expect(await screen.findByText('Home removed.')).toBeInTheDocument();
    // The home is gone from the page, not just from the server.
    expect(screen.queryByText('Remove Home')).not.toBeInTheDocument();
  });

  it('deletes nothing when the confirmation is dismissed', async () => {
    mockFetch();
    await renderWithHome();

    fireEvent.click(screen.getByText('Remove Home'));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remove home' })).not.toBeInTheDocument();
    });
    expect(calls.some(call => call.method === 'DELETE')).toBe(false);
    expect(screen.getByText('Remove Home')).toBeInTheDocument();
  });

  it('reports a failed removal and keeps the home on the page', async () => {
    mockFetch((url, method) =>
      url.endsWith('/profile/home') && method === 'DELETE'
        ? { ok: false, status: 500, json: async () => ({ error: 'Failed to remove home data' }) }
        : undefined
    );
    await renderWithHome();

    fireEvent.click(screen.getByText('Remove Home'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove home' }));

    expect(await screen.findByText('Failed to remove home data')).toBeInTheDocument();
    expect(screen.getByText('Remove Home')).toBeInTheDocument();
  });

  it('explains why an emptied address cannot be saved', async () => {
    // The dead end this replaces: clearing the field left Save disabled and silent.
    mockFetch();
    await renderWithHome();

    fireEvent.click(screen.getByText('Edit Address'));
    fireEvent.change(screen.getByPlaceholderText('123 Main St, City, State, Zip'), {
      target: { value: '' },
    });

    expect(screen.getByText(/To delete your home entirely/)).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeDisabled();
  });
});
