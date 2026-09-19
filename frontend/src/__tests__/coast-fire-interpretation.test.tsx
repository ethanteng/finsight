/**
 * The model's reading of a Coast FIRE result, on the page.
 *
 * Three things are worth holding down here, and none of them is the prose.
 * The panel must not delay the browser's own answer, it must disappear rather
 * than apologise when no reading was produced, and it must not be requested at
 * all before a scenario is submitted — the page opens empty, and reading on
 * load would spend a model call and a slice of their rate limit on every view.
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

/**
 * Fill the five figures that belong to the visitor, then ask for an answer.
 *
 * Nothing is prefilled: the page opens with empty boxes and no result, so a
 * bare submit is refused and produces neither a run nor a reading.
 */
function submit(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'Your age today': '40',
    'Retirement age': '65',
    'Retirement savings today': '400000',
    'Annual spending in retirement': '80000',
    'Annual income available at retirement': '30000',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
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
  for (const paragraph of READING.paragraphs) expect(screen.getByText(paragraph)).toBeVisible();
  expect(screen.queryByText(/Read Linc’s full answer/)).not.toBeInTheDocument();
  expect(screen.getByText(READING.watchOuts[0])).toBeVisible();
});

/*
 * The chevrons under the capture band point here. The panel is the one section
 * on the page that may not render at all — a reading that could not be
 * grounded is dropped — so the link and the target have to be decided by the
 * same condition. A gesture inviting a scroll to a section that was dropped is
 * worse than no gesture.
 */
it('shows the reading together with the result without a jump link', async () => {
  mockApi(reading);
  const { container } = render(<CoastFireCalculator />);
  submit();

  await screen.findByText(READING.headline);

  const view = container.querySelector('.calculator-result-grid');
  expect(view).toContainElement(screen.getByText(READING.headline));
  expect(view).toContainElement(container.querySelector('.cf-result-card'));
  expect(container.querySelector('.cf-jump')).toBeNull();
  expect(container.querySelector('#coast-calculator')).not.toBeVisible();
});

/* No reading, no gesture: there is nothing below to scroll to. */
it('shows no chevrons when no reading comes', async () => {
  mockApi(dropped);
  const { container } = render(<CoastFireCalculator />);
  submit();

  await waitFor(() => {
    expect(screen.queryByText(/reading your result/i)).not.toBeInTheDocument();
  });
  expect(container.querySelector('.cf-jump')).toBeNull();
});

/* And none before a scenario is submitted, when no reading has been asked for. */
it('shows no chevrons before a scenario is submitted', () => {
  mockApi(reading);
  const { container } = render(<CoastFireCalculator />);

  expect(container.querySelector('.cf-jump')).toBeNull();
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

  // The browser's own answer is on the page the moment it is asked for, with
  // no network round trip behind it.
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
 * The page opens with empty boxes and no result, so there is nothing to read —
 * and a reading asked for on load would cost a model call on every page view.
 */
it('does not ask for a reading before a scenario is submitted', async () => {
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

  submit({ 'Retirement savings today': '250000' });

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
