import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SaveOfferCard from '@/components/SaveOfferCard';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const offer = {
  calculatorId: 'coast_fire',
  items: [
    { key: 'retirementAge' as const, label: 'Retirement age', value: 55, display: '55' },
    { key: 'annualRetirementSpending' as const, label: 'Spending in retirement', value: 80000, display: '$80,000 a year' },
    { key: 'investedBalance' as const, label: 'Invested today', value: 500000, display: '$500,000' },
  ],
};

const ok = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) });

describe('Use these next time?', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockImplementation(ok);
  });

  it('lists each figure, ticked, and saves nothing until asked', () => {
    render(<SaveOfferCard offer={offer} />);

    expect(screen.getByRole('heading', { name: 'Use these next time?' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    screen.getAllByRole('checkbox').forEach((box) => expect(box).toBeChecked());
    expect(screen.getByText('$80,000 a year')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('saves the plan to Your numbers and the balance as an entered account', async () => {
    const onSaved = jest.fn();
    render(<SaveOfferCard offer={offer} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Your numbers' }));

    expect(await screen.findByText('Saved to Your numbers')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/stated-figures'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ figures: { retirementAge: 55, annualRetirementSpending: 80000 }, source: 'answer' }),
      })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/manual-accounts'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Invested for retirement', amount: 500000, type: 'investment' }),
      })
    );
    expect(onSaved).toHaveBeenCalledWith(3);
    expect(screen.getByRole('link', { name: 'Change them any time' })).toHaveAttribute('href', '/your-numbers');
  });

  it('leaves out what the user unticks', async () => {
    render(<SaveOfferCard offer={offer} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Invested today/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Retirement age/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save to Your numbers' }));

    await screen.findByText('Saved to Your numbers');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/stated-figures'),
      expect.objectContaining({ body: JSON.stringify({ figures: { annualRetirementSpending: 80000 }, source: 'answer' }) })
    );
  });

  it('says why a save failed and keeps the offer open', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => Promise.resolve({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Some figures could not be saved', rejected: { retirementAge: 'Age you plan to retire must be a whole number from 30 to 95.' } }),
    }));
    render(<SaveOfferCard offer={offer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to Your numbers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Age you plan to retire must be a whole number from 30 to 95.');
    expect(screen.getByRole('button', { name: 'Save to Your numbers' })).toBeEnabled();
  });

  it('goes away on "Not now"', async () => {
    render(<SaveOfferCard offer={offer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Use these next time?' })).not.toBeInTheDocument());
  });
});
