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
    const parseEmptyOverview = jest.fn();
    const requestedUrls: string[] = [];

    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/api/finances/overview')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: parseEmptyOverview,
        });
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
    expect(parseEmptyOverview).not.toHaveBeenCalled();
    expect(requestedUrls.some(url => url.includes('/plaid/all-accounts'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/snaptrade/accounts'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/api/manual-accounts'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/api/summaries'))).toBe(false);
    expect(requestedUrls.some(url => url.includes('/auth/verify'))).toBe(false);
  });
});
