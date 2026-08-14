import React from 'react';
import { render, screen } from '@testing-library/react';
import FinancesPageClient from '@/app/finances/FinancesPageClient';

describe('FinancesPageClient', () => {
  beforeEach(() => {
    localStorage.setItem('auth_token', 'new-user-token');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('shows account setup guidance when a new user has no financial summary', async () => {
    const parseEmptySummary = jest.fn();

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/summaries')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: parseEmptySummary,
        });
      }

      if (url.includes('/plaid/all-accounts')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ accounts: [] }) });
      }

      if (url.includes('/snaptrade/accounts')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: { accounts: [] } }) });
      }

      if (url.includes('/api/manual-accounts')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
      }

      if (url.includes('/api/financial-history')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [] });
      }

      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }) as jest.Mock;

    render(<FinancesPageClient />);

    expect(await screen.findByRole('heading', { name: 'See your whole financial picture in one place.' })).toBeInTheDocument();
    expect(screen.queryByText('Failed to load financial data')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add your accounts/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByText('What you’ll see after setup')).toBeInTheDocument();
    expect(screen.getByText('Secure, read-only connections')).toBeInTheDocument();
    expect(parseEmptySummary).not.toHaveBeenCalled();
  });
});
