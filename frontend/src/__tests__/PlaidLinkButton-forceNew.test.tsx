/**
 * The shared "Add an account" picker and the ITEM_LOGIN_REQUIRED reconnect
 * button share one PlaidLinkButton instance. Adding a bank must not open Link
 * in update mode for the broken Item just because that instance also holds the
 * reconnect id.
 */

import React, { useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import PlaidLinkButton, {
  PlaidLinkButtonRef,
  clearAllFinancialServices,
  resetPlaidLinkInitialization,
} from '../components/PlaidLinkButton';

jest.mock('react-plaid-link', () => ({
  usePlaidLink: () => ({ ready: false, open: jest.fn(), exit: jest.fn() }),
}));

jest.mock('../components/Analytics', () => ({
  useAnalytics: () => ({ trackEvent: jest.fn(), trackConversion: jest.fn() }),
}));

function Harness({ updateModeTokenId }: { updateModeTokenId?: string }) {
  const ref = useRef<PlaidLinkButtonRef>(null);
  return (
    <div>
      <button type="button" onClick={() => ref.current?.createLinkToken({ forceNew: true })}>
        Add via picker
      </button>
      <PlaidLinkButton ref={ref} updateModeTokenId={updateModeTokenId} label="Reconnect account" />
    </div>
  );
}

describe('PlaidLinkButton forceNew vs update mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAllFinancialServices();
    resetPlaidLinkInitialization();
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
    Storage.prototype.getItem = jest.fn((key: string) =>
      key === 'auth_token' ? 'test-token' : null
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ link_token: 'link-sandbox-token' }),
      text: async () => '',
    });
  });

  it('omits accessTokenId when the picker forces a new connection despite a pending reconnect', async () => {
    const user = userEvent.setup();
    render(<Harness updateModeTokenId="token-needs-reauth" />);

    await user.click(screen.getByRole('button', { name: 'Add via picker' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, options] = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => typeof url === 'string' && url.endsWith('/plaid/create_link_token')
    );
    expect(JSON.parse(options.body)).toEqual({});
  });

  it('still sends accessTokenId when the reconnect button is used', async () => {
    const user = userEvent.setup();
    render(<Harness updateModeTokenId="token-needs-reauth" />);

    await user.click(screen.getByRole('button', { name: 'Reconnect account' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, options] = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => typeof url === 'string' && url.endsWith('/plaid/create_link_token')
    );
    expect(JSON.parse(options.body)).toEqual({ accessTokenId: 'token-needs-reauth' });
  });
});
