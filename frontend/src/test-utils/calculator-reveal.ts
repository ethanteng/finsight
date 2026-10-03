import { fireEvent, screen } from '@testing-library/react';

/**
 * Put a calculator result on the page, the only way the page now shows one.
 *
 * Both calculators hold their answer back and send the visitor into Ask Linc
 * to see it. The page shows it itself only when the email form gets no lead
 * token back, because then there is no run to seed an account from. Cases
 * about the result card, the reading or the charts go through that path, so
 * the caller's fetch mock must answer `email-results` without a `ref`.
 */
export async function revealCalculatorResult(address = 'reader@example.com'): Promise<void> {
  const field = await screen.findByLabelText('Email address');
  fireEvent.change(field, { target: { value: address } });
  fireEvent.submit(field.closest('form')!);
  await screen.findByText(/so here is your result/i);
}
