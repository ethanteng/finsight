import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HomeValueCard from '@/components/finances/HomeValueCard';

describe('HomeValueCard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('hands the saved value to its owner instead of displaying it as canonical itself', async () => {
    const user = userEvent.setup();
    const onValueUpdate = jest.fn();
    localStorage.setItem('auth_token', 'token');
    const savedHome = {
      address: '1 Main St',
      value: 450000,
      valueLow: null,
      valueHigh: null,
      lastUpdated: '2026-08-14T12:00:00.000Z',
      isManualOverride: true,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, homeData: savedHome }),
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

    // The save endpoint returns as soon as the setting is durable; the snapshot that feeds
    // the totals is rebuilt in the background. The card reports the saved value upward and
    // keeps rendering whatever its owner passes down.
    expect(onValueUpdate).toHaveBeenCalledWith(savedHome);
    expect(screen.getAllByText('$400,000').length).toBeGreaterThan(0);
    expect(screen.queryByText('$450,000')).not.toBeInTheDocument();
  });

  it('surfaces a failed save without reporting it upward', async () => {
    const user = userEvent.setup();
    const onValueUpdate = jest.fn();
    localStorage.setItem('auth_token', 'token');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Failed to update home value' }),
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update home value');
    expect(onValueUpdate).not.toHaveBeenCalled();
  });
});
