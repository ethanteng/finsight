import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomeValueCard from '@/components/finances/HomeValueCard';

describe('HomeValueCard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('acknowledges a persisted edit without displaying it as canonical when snapshot refresh fails', async () => {
    const user = userEvent.setup();
    const onValueUpdate = jest.fn();
    localStorage.setItem('auth_token', 'token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        snapshotRefreshed: false,
        warning: 'Your home setting was saved, but totals could not be refreshed. Use Refresh totals to try again.',
        homeData: {
          address: '1 Main St',
          value: 450000,
          valueLow: null,
          valueHigh: null,
          lastUpdated: '2026-08-14T12:00:00.000Z',
          isManualOverride: true,
        },
      }),
    }) as jest.Mock;

    render(
      <HomeValueCard
        homeData={{
          address: '1 Main St',
          value: 400000,
          valueLow: null,
          valueHigh: null,
          lastUpdated: '2026-08-13T12:00:00.000Z',
          isManualOverride: true,
        }}
        isExpanded
        onValueUpdate={onValueUpdate}
      />
    );

    await user.click(screen.getByRole('button', { name: /edit value/i }));
    const input = screen.getByPlaceholderText('Enter value');
    await user.clear(input);
    await user.type(input, '450000');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('status')).toHaveTextContent('saved, but totals could not be refreshed');
    expect(screen.getAllByText('$400,000').length).toBeGreaterThan(0);
    expect(screen.queryByText('$450,000')).not.toBeInTheDocument();
    expect(onValueUpdate).not.toHaveBeenCalled();
  });
});
