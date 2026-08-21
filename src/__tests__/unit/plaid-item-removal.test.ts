import { removePlaidItem, removePlaidItems } from '../../services/plaid-item-removal';

function plaidError(errorCode: string) {
  return Object.assign(new Error(`plaid rejected: ${errorCode}`), {
    response: { data: { error_code: errorCode } },
  });
}

function client(itemRemove: jest.Mock) {
  return { itemRemove } as any;
}

describe('Plaid item revocation', () => {
  it('revokes the item with the connection access token', async () => {
    const itemRemove = jest.fn().mockResolvedValue({ data: {} });

    await expect(removePlaidItem({ id: 'token-1', token: 'access-abc' }, client(itemRemove)))
      .resolves.toEqual({ tokenId: 'token-1', removed: true, alreadyRemoved: false });
    expect(itemRemove).toHaveBeenCalledWith({ access_token: 'access-abc' });
  });

  // An Item Plaid no longer knows about is genuinely gone, and reporting that as
  // a failure would block the local cleanup and strand the row.
  it('treats an item Plaid no longer knows as revoked', async () => {
    const itemRemove = jest.fn().mockRejectedValue(plaidError('ITEM_NOT_FOUND'));

    const result = await removePlaidItem({ id: 'token-1', token: 'access-abc' }, client(itemRemove));

    expect(result.removed).toBe(true);
    expect(result.alreadyRemoved).toBe(true);
    expect(result.errorCode).toBe('ITEM_NOT_FOUND');
  });

  // INVALID_ACCESS_TOKEN says Plaid rejected the credential we sent -- malformed,
  // corrupted, or from another environment -- and says nothing about whether the
  // Item behind it survives. Counting it as revoked would delete the only
  // credential that could ever revoke that Item. The codebase pairs this code
  // with ITEM_LOGIN_REQUIRED elsewhere, but that answers "must the user
  // re-link", which is a different question.
  it('does not treat a rejected credential as proof the item is gone', async () => {
    const itemRemove = jest.fn().mockRejectedValue(plaidError('INVALID_ACCESS_TOKEN'));

    const result = await removePlaidItem({ id: 'token-1', token: 'access-abc' }, client(itemRemove));

    expect(result.removed).toBe(false);
    expect(result.alreadyRemoved).toBe(false);
    expect(result.unconfirmed).toBe(true);
  });

  // This is a destructive mutation, so it must reach Plaid exactly once even
  // when Plaid is briefly unwell.
  it('reports a genuine failure without retrying', async () => {
    const itemRemove = jest.fn().mockRejectedValue(plaidError('INTERNAL_SERVER_ERROR'));

    const result = await removePlaidItem({ id: 'token-1', token: 'access-abc' }, client(itemRemove));

    expect(result.removed).toBe(false);
    expect(itemRemove).toHaveBeenCalledTimes(1);
  });

  it('does not relay the provider message to the caller', async () => {
    const itemRemove = jest.fn().mockRejectedValue(
      Object.assign(new Error('POST https://production.plaid.com/item/remove failed for access-abc'), {})
    );

    const result = await removePlaidItem({ id: 'token-1', token: 'access-abc' }, client(itemRemove));

    expect(result.error).not.toContain('plaid.com');
    expect(result.error).toContain('Plaid could not revoke this connection');
  });

  describe('sweeping every connection', () => {
    // Only Items confirmed gone may have their local rows deleted; anything else
    // keeps its token so the revocation can be retried.
    it('separates confirmed-gone items from unconfirmed and failed ones', async () => {
      const itemRemove = jest.fn()
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(plaidError('ITEM_NOT_FOUND'))
        .mockRejectedValueOnce(plaidError('INVALID_ACCESS_TOKEN'))
        .mockRejectedValueOnce(plaidError('INTERNAL_SERVER_ERROR'));

      const summary = await removePlaidItems(
        [
          { id: 'token-ok', token: 'a' },
          { id: 'token-gone', token: 'b' },
          { id: 'token-rejected', token: 'c' },
          { id: 'token-error', token: 'd' },
        ],
        client(itemRemove)
      );

      expect(summary.results.filter(result => result.removed).map(result => result.tokenId))
        .toEqual(['token-ok', 'token-gone']);
      expect(summary.unconfirmed).toBe(1);
      expect(summary.failed).toBe(2);
      expect(summary.allRevoked).toBe(false);
    });

    // Abandoning the sweep on the first failure would leave the remaining banks
    // live at Plaid with no local record that they still need revoking.
    it('continues past a failure and reports what survived', async () => {
      const itemRemove = jest.fn()
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(plaidError('INTERNAL_SERVER_ERROR'))
        .mockResolvedValueOnce({ data: {} });

      const summary = await removePlaidItems(
        [
          { id: 'token-1', token: 'a' },
          { id: 'token-2', token: 'b' },
          { id: 'token-3', token: 'c' },
        ],
        client(itemRemove)
      );

      expect(itemRemove).toHaveBeenCalledTimes(3);
      expect(summary.removed).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.allRevoked).toBe(false);
      expect(summary.results.filter(result => result.removed).map(result => result.tokenId))
        .toEqual(['token-1', 'token-3']);
    });

    it('counts an already-removed item separately from a fresh revoke', async () => {
      const itemRemove = jest.fn()
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(plaidError('ITEM_NOT_FOUND'));

      const summary = await removePlaidItems(
        [{ id: 'token-1', token: 'a' }, { id: 'token-2', token: 'b' }],
        client(itemRemove)
      );

      expect(summary.removed).toBe(1);
      expect(summary.alreadyRemoved).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.allRevoked).toBe(true);
    });

    it('reports a clean sweep for a user with no connections', async () => {
      const itemRemove = jest.fn();

      const summary = await removePlaidItems([], client(itemRemove));

      expect(itemRemove).not.toHaveBeenCalled();
      expect(summary.allRevoked).toBe(true);
    });
  });
});
