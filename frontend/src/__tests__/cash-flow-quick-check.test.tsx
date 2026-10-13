import { fireEvent, render, screen } from '@testing-library/react';
import CashFlowQuickCheck from '@/components/marketing/CashFlowQuickCheck';

describe('cash-flow quick check', () => {
  it('opens TryCoast’s cash flow check in a new tab and says so', () => {
    render(<CashFlowQuickCheck />);

    const link = screen.getByRole('link', { name: /Open the cash flow check/ });
    expect(link).toHaveAttribute('href', 'https://trycoast.me/#cash');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Opens TryCoast in a new tab.')).toBeInTheDocument();
  });

  /*
   * TryCoast records the referring site; without it these visits would read
   * as direct traffic beside its ad experiment.
   */
  it('keeps the referrer', () => {
    render(<CashFlowQuickCheck />);

    const rel = screen.getByRole('link', { name: /Open the cash flow check/ }).getAttribute('rel') ?? '';
    expect(rel.split(/\s+/)).toContain('noopener');
    expect(rel.split(/\s+/)).not.toContain('noreferrer');
  });

  it('reports the click for the admin Visitors tab', () => {
    const analyticsWindow = window as Window & typeof globalThis & { dataLayer?: unknown[] };
    analyticsWindow.dataLayer = [];
    render(<CashFlowQuickCheck />);

    fireEvent.click(screen.getByRole('link', { name: /Open the cash flow check/ }));

    expect(analyticsWindow.dataLayer).toEqual([expect.objectContaining({ event: 'cash_flow_check_click' })]);
  });
});
