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

  // The caller's goal is that the Item is not live. One Plaid no longer knows,
  // or that this token can no longer address, already satisfies that -- and
  // reporting it as a failure would block the local cleanup and strand the row.
  it.each(['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'])(
    'treats an unusable item as revoked (%s)',
    async errorCode => {
      const itemRemove = jest.fn().mockRejectedValue(plaidError(errorCode));

      const result = await removePlaidItem({ id: 'token-1', token: 'access-abc' }, client(itemRemove));

      expect(result.removed).toBe(true);
      expect(result.alreadyRemoved).toBe(true);
      expect(result.errorCode).toBe(errorCode);
    }
  );

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
