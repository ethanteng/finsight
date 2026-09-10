/**
 * What the calculator does with a submission it cannot run.
 *
 * Both halves used to end at the same dead end: the browser blocked the submit
 * and analytics recorded only that something was invalid, or the model rejected
 * one number and the page showed the reason in a banner six fields away with
 * the field name discarded. These cover the field attribution on both paths.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RetirementQuickPlan } from '@/components/marketing/RetirementQuickPlan';
import { pushRetirementInteraction } from '@/lib/dataLayer';

jest.mock('@/lib/dataLayer', () => ({
  pushRetirementInteraction: jest.fn(),
  pushRetirementModelRun: jest.fn(),
}));

const interaction = jest.mocked(pushRetirementInteraction);

function renderPage() {
  return render(<RetirementQuickPlan headline="Can I retire at 60?" initialRetirementAge={60} />);
}

function fill(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Every field the form requires, so a submit reaches the endpoint. */
function fillValidPlan() {
  fill(/current age/i, '52');
  fill(/retirement age/i, '60');
  fill(/investment assets today/i, '1200000');
  fill(/annual spending in retirement/i, '95000');
}

beforeEach(() => {
  interaction.mockClear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ allocations: [] }) });
});

it('reports which field blocked a submission, and how many were failing', async () => {
  renderPage();
  const spending = screen.getByLabelText(/annual spending in retirement/i);
  const assets = screen.getByLabelText(/investment assets today/i);

  // The browser fires one of these per failing control during a blocked submit.
  fireEvent.invalid(spending);
  fireEvent.invalid(assets);

  await waitFor(() => {
    expect(interaction).toHaveBeenCalledWith('retirement_validation_error', {
      errorField: 'annualSpending',
      invalidFieldCount: 2,
    });
  });
});

it('does not require the two numbers the model accepts as zero', () => {
  renderPage();
  expect(screen.getByLabelText(/annual contributions until then/i)).not.toBeRequired();
  expect(screen.getByLabelText(/social security estimate/i)).not.toBeRequired();
  expect(screen.getByLabelText(/current age/i)).toBeRequired();
});

it('shows a rejected number under the field it is about, and names the field to analytics', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) =>
    String(url).endsWith('/options')
      ? Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) })
      : Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({
            error: 'Annual spending must be between 1,000 and 10,000,000.',
            field: 'annualSpending',
          }),
        })
  );

  renderPage();
  fillValidPlan();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);

  const message = await screen.findByText(/annual spending must be between/i);
  expect(message).toHaveAttribute('id', 'annualSpending-error');
  const spending = screen.getByLabelText(/annual spending in retirement/i);
  expect(spending).toHaveAttribute('aria-invalid', 'true');
  expect(spending).toHaveAttribute('aria-describedby', 'annualSpending-error');

  expect(interaction).toHaveBeenCalledWith('retirement_api_error', {
    errorField: 'annualSpending',
    errorStatus: 400,
  });
});

it('clears a field rejection once that field is edited', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) =>
    String(url).endsWith('/options')
      ? Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) })
      : Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Current age must be between 18 and 90.', field: 'currentAge' }),
        })
  );

  renderPage();
  fillValidPlan();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);
  await screen.findByText(/current age must be between/i);

  fill(/current age/i, '55');
  await waitFor(() => {
    expect(screen.queryByText(/current age must be between/i)).not.toBeInTheDocument();
  });
});

it('keeps an error the model could not blame on a field in the banner', async () => {
  (global.fetch as jest.Mock).mockImplementation((url: string) =>
    String(url).endsWith('/options')
      ? Promise.resolve({ ok: true, json: async () => ({ allocations: [] }) })
      : Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: 'Too many requests. Please wait a moment and try again.' }),
        })
  );

  renderPage();
  fillValidPlan();
  fireEvent.submit(screen.getByRole('button', { name: /run the model/i }).closest('form')!);

  const banner = await screen.findByText(/too many requests/i);
  expect(banner).toHaveClass('qp-error');
  expect(interaction).toHaveBeenCalledWith('retirement_api_error', {
    errorField: undefined,
    errorStatus: 429,
  });
});
