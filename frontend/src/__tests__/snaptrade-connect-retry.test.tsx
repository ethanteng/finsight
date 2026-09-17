/**
 * A connect request that arrives before SnapTrade registration has landed.
 *
 * SnapTradeButton is headless on the accounts page, so there is no button left
 * for the user to press to retry. Dropping the request meant one failed
 * `/snaptrade/status/user` call left every brokerage in the picker unreachable
 * for the rest of the session.
 */

import React, { useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SnapTradeButton, { SnapTradeButtonRef } from '../components/SnapTradeButton';

jest.mock('snaptrade-react', () => ({ SnapTradeReact: () => null }));
jest.mock('snaptrade-react/hooks/useWindowMessage', () => ({ useWindowMessage: jest.fn() }));

function Harness({ onConnectStatus }: { onConnectStatus?: (m: string) => void }) {
  const ref = useRef<SnapTradeButtonRef>(null);
  return (
    <div>
      <button type="button" onClick={() => ref.current?.connect('FIDELITY')}>
        Pick Fidelity
      </button>
      <SnapTradeButton ref={ref} headless onConnectStatus={onConnectStatus} />
    </div>
  );
}

const loginCalls = () =>
  (global.fetch as jest.Mock).mock.calls.filter(
    ([url]) => typeof url === 'string' && url.endsWith('/snaptrade/login'),
  );

describe('SnapTrade connect before registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
    Storage.prototype.getItem = jest.fn(() => 'test-token');
  });

  it('retries registration and then opens the portal on the picked brokerage', async () => {
    const user = userEvent.setup();
    let statusCallCount = 0;

    global.fetch = jest.fn().mockImplementation((url: string) => {
      const json = (body: unknown, ok = true, status = 200) =>
        Promise.resolve({ ok, status, json: async () => body });

      if (url.endsWith('/snaptrade/status/user')) {
        statusCallCount += 1;
        // The first read fails, which is all it took to strand the user.
        return statusCallCount === 1
          ? json({}, false, 500)
          : json({ status: 'registered' });
      }
      if (url.endsWith('/snaptrade/init')) return json({ success: true });
      if (url.endsWith('/snaptrade/login')) {
        return json({ data: { redirectURI: 'https://app.snaptrade.com/connect' } });
      }
      if (url.endsWith('/snaptrade/accounts')) return json({ data: { accounts: [] } });
      return json({});
    });

    render(<Harness />);

    // Wait for the failed status read to settle into the error state.
    await waitFor(() => expect(statusCallCount).toBeGreaterThan(0));

    await user.click(screen.getByRole('button', { name: 'Pick Fidelity' }));

    // The click re-runs registration and the held request then opens the portal
    // on the brokerage that was picked, rather than being silently dropped.
    await waitFor(() => expect(loginCalls()).toHaveLength(1), { timeout: 4000 });
    expect(JSON.parse(loginCalls()[0][1].body)).toEqual({ broker: 'FIDELITY' });
  });

  it('says so when setup genuinely cannot be completed', async () => {
    const user = userEvent.setup();
    const onConnectStatus = jest.fn();

    global.fetch = jest.fn().mockImplementation((url: string) => {
      const json = (body: unknown, ok = true, status = 200) =>
        Promise.resolve({ ok, status, json: async () => body });
      if (url.endsWith('/snaptrade/status/user')) return json({}, false, 500);
      if (url.endsWith('/snaptrade/init')) return json({ error: 'nope' }, false, 500);
      return json({});
    });

    render(<Harness onConnectStatus={onConnectStatus} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Pick Fidelity' }));

    // A click that cannot go anywhere has to say that, not vanish.
    await waitFor(
      () =>
        expect(onConnectStatus).toHaveBeenCalledWith(
          expect.stringMatching(/could not set up investment connections/i),
        ),
      { timeout: 4000 },
    );
    expect(loginCalls()).toHaveLength(0);
  });
});
