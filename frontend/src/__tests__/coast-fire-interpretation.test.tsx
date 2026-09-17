/**
 * The model's reading of a Coast FIRE result, on the page.
 *
 * Three things are worth holding down here, and none of them is the prose.
 * The panel must not delay the browser's own answer, it must disappear rather
 * than apologise when no reading was produced, and it must not be requested at
 * all for the worked example the page opens with — that scenario is ours, not
 * the visitor's, and reading it would spend a model call and a slice of their
 * rate limit on figures nobody entered.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CoastFireCalculator } from '@/components/marketing/CoastFireCalculator';

jest.mock('@/lib/dataLayer', () => ({
  pushCoastFireCalculated: jest.fn(),
  pushCoastFireResultsEmailed: jest.fn(),
}));

const READING = {
  headline: 'You are just past your Coast FIRE number.',
  paragraphs: ['You need about $370,000 invested today; you have $400,000.'],
  watchOuts: ['The whole answer rests on 5% a year after inflation, every year.'],
  model: 'test-model',
};

const reading = () =>
  Promise.resolve({ ok: true, status: 200, json: async () => READING } as unknown as Response);
const dropped = () => Promise.resolve({ ok: true, status: 204 } as unknown as Response);

/** Route the interpretation separately from every other request the page makes. */
function mockApi(interpretation: () => Promise<Response>) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes('/interpretation')) return interpretation();
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ message: 'sent' }) });
  });
  return calls;
}

function submit() {
  fireEvent.submit(document.querySelector('form')!);
}

beforeEach(() => {
  // jsdom has no layout, and the page scrolls the result into view on submit.
  Element.prototype.scrollIntoView = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

it('renders the reading under the result', async () => {
  mockApi(reading);
  render(<CoastFireCalculator />);
  submit();

  expect(await screen.findByText(READING.headline)).toBeInTheDocument();
  expect(screen.getByText(READING.paragraphs[0])).toBeInTheDocument();
  expect(screen.getByText(READING.watchOuts[0])).toBeInTheDocument();
});

/*
 * The page's whole claim is that the number appears without waiting on
 * anything. A reading that never came is the ordinary case for a rate limit or
 * a provider blip, and it must not read as a broken calculator.
 */
it('shows the number without waiting, and shows nothing when no reading comes', async () => {
  mockApi(dropped);
  render(<CoastFireCalculator />);
  submit();

  // The browser's own answer is on the page regardless.
  expect(screen.getByText(/Your Coast FIRE number/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.queryByText(/reading your result/i)).not.toBeInTheDocument();
  });
  expect(screen.queryByText(/what this result means/i)).not.toBeInTheDocument();
});

it('leaves the page intact when the request fails outright', async () => {
  mockApi(() => Promise.reject(new Error('offline')));
  render(<CoastFireCalculator />);
  submit();

  expect(screen.getByText(/Your Coast FIRE number/i)).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText(/what this result means/i)).not.toBeInTheDocument();
  });
});

/*
 * The page answers a default scenario on load so the result card is never
 * empty. Those are our figures, and asking a model to read them would cost a
 * call on every page view.
 */
it('does not ask for a reading of the worked example the page opens with', async () => {
  const calls = mockApi(reading);
  render(<CoastFireCalculator />);

  await waitFor(() => {
    expect(calls.filter(([url]) => url.includes('/interpretation'))).toHaveLength(0);
  });
});

/* The seven numbers as the calculator accepted them, and nothing derived. */
it('asks about the scenario as submitted, not the figures computed from it', async () => {
  const calls = mockApi(reading);
  render(<CoastFireCalculator />);

  fireEvent.change(screen.getByLabelText('Retirement savings today'), { target: { value: '250000' } });
  submit();

  await screen.findByText(READING.headline);
  const call = calls.find(([url]) => url.includes('/interpretation'));
  const body = JSON.parse(String(call![1]!.body));

  expect(body).toEqual({
    currentAge: 40,
    retirementAge: 65,
    currentSavings: 250_000,
    annualRetirementSpending: 80_000,
    annualRetirementIncome: 30_000,
    realReturnRate: 5,
    withdrawalRate: 4,
  });
  expect(body).not.toHaveProperty('coastFireNumber');
});
