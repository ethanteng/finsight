/**
 * The disclosure stamp must be durable before the token is handed to a page.
 * `updateMany` succeeding with zero rows is not durable — that is the case
 * this covers.
 */

const coastFire = {
  updateMany: jest.fn(),
  findUnique: jest.fn(),
};
const retirement = {
  updateMany: jest.fn(),
  findUnique: jest.fn(),
};

jest.mock('../../prisma-client', () => ({
  getPrismaClient: () => ({
    coastFireLead: coastFire,
    retirementLead: retirement,
  }),
}));

import {
  markCoastFireLeadTokenDisclosed,
} from '../../services/coast-fire-leads';
import {
  markRetirementLeadTokenDisclosed,
} from '../../services/retirement-leads';

const TOKEN = 'a'.repeat(48);

describe('mark*LeadTokenDisclosed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      name: 'Coast FIRE',
      mark: markCoastFireLeadTokenDisclosed,
      table: coastFire,
    },
    {
      name: 'retirement',
      mark: markRetirementLeadTokenDisclosed,
      table: retirement,
    },
  ])('returns true when $name disclosure writes a row', async ({ mark, table }) => {
    table.updateMany.mockResolvedValue({ count: 1 });

    await expect(mark(TOKEN)).resolves.toBe(true);
    expect(table.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'Coast FIRE',
      mark: markCoastFireLeadTokenDisclosed,
      table: coastFire,
    },
    {
      name: 'retirement',
      mark: markRetirementLeadTokenDisclosed,
      table: retirement,
    },
  ])('returns true when $name was already stamped', async ({ mark, table }) => {
    table.updateMany.mockResolvedValue({ count: 0 });
    table.findUnique.mockResolvedValue({ tokenDisclosedAt: new Date() });

    await expect(mark(TOKEN)).resolves.toBe(true);
  });

  it.each([
    {
      name: 'Coast FIRE',
      mark: markCoastFireLeadTokenDisclosed,
      table: coastFire,
    },
    {
      name: 'retirement',
      mark: markRetirementLeadTokenDisclosed,
      table: retirement,
    },
  ])('returns false when $name row is missing', async ({ mark, table }) => {
    table.updateMany.mockResolvedValue({ count: 0 });
    table.findUnique.mockResolvedValue(null);

    await expect(mark(TOKEN)).resolves.toBe(false);
  });

  it.each([
    {
      name: 'Coast FIRE',
      mark: markCoastFireLeadTokenDisclosed,
      table: coastFire,
    },
    {
      name: 'retirement',
      mark: markRetirementLeadTokenDisclosed,
      table: retirement,
    },
  ])('returns false when the $name write throws', async ({ mark, table }) => {
    table.updateMany.mockRejectedValue(new Error('column missing'));

    await expect(mark(TOKEN)).resolves.toBe(false);
  });
});
