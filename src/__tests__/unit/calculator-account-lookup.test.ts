import { describe, expect, it, jest } from '@jest/globals';

const findUnique = jest.fn<(args: unknown) => Promise<{ id: string } | null>>();
jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({ user: { findUnique } }),
}));

import { accountExistsForEmail } from '../../services/calculator-account-lookup';

describe('accountExistsForEmail', () => {
  it('finds an account by its lowercased address', async () => {
    findUnique.mockResolvedValueOnce({ id: 'user-1' });

    await expect(accountExistsForEmail('Member@Example.com')).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'member@example.com' },
      select: { id: true },
    });
  });

  it('reports an address with no account', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(accountExistsForEmail('new@example.com')).resolves.toBe(false);
  });

  /*
   * Signup recovers from a wrong "new": its 409 links an existing account to
   * sign-in with the run. Sign-in cannot recover from a wrong "exists" — a new
   * visitor sent there has no account to open.
   */
  it('reads a failed lookup as a new address', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    findUnique.mockRejectedValueOnce(new Error('connection reset'));

    await expect(accountExistsForEmail('new@example.com')).resolves.toBe(false);
  });
});
