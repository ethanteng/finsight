/**
 * The endpoint behind the accounts page's single "Add an account" search.
 *
 * It spends both providers' quota and is only useful to someone about to
 * connect something, so authentication and the rate limit are part of the
 * contract, not incidental.
 */

import express from 'express';
import request from 'supertest';

const institutionsSearch = jest.fn();
const listBrokerages = jest.fn();
const requireAuthImpl = jest.fn((req: any, _res: any, next: any) => {
  req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
  next();
});

jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => requireAuthImpl(req, res, next),
}));

jest.mock('../../plaid', () => ({
  plaidClient: { institutionsSearch: (...args: any[]) => institutionsSearch(...args) },
}));

jest.mock('../../snaptrade', () => ({
  snapTradeService: { listBrokerages: (...args: any[]) => listBrokerages(...args) },
}));

import institutionRoutes from '../../routes/institutions';
import { resetBrokerageCache } from '../../services/institution-directory';

const app = express();
app.use(express.json());
app.use('/api/institutions', institutionRoutes);

describe('GET /api/institutions/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetBrokerageCache();
    requireAuthImpl.mockImplementation((req: any, _res: any, next: any) => {
      req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
      next();
    });
    institutionsSearch.mockResolvedValue({
      data: {
        institutions: [
          { institution_id: 'ins_3', name: 'Chase', logo: 'iVBORw0KGgo=' },
        ],
      },
    });
    listBrokerages.mockResolvedValue([
      { slug: 'FIDELITY', display_name: 'Fidelity', enabled: true },
    ]);
  });

  afterAll(() => resetBrokerageCache());

  it('returns one row per institution and provider, each saying what it connects', async () => {
    // A brand both directories carry: the bank side and the brokerage side are
    // different connections, so collapsing them would put the provider choice
    // back on the user.
    institutionsSearch.mockResolvedValue({
      data: { institutions: [{ institution_id: 'ins_fid', name: 'Fidelity' }] },
    });

    const response = await request(app).get('/api/institutions/search').query({ query: 'fidelity' });

    expect(response.status).toBe(200);
    expect(response.body.institutions).toEqual([
      expect.objectContaining({
        provider: 'plaid',
        providerInstitutionId: 'ins_fid',
        covers: 'Checking, savings, credit cards & loans',
      }),
      expect.objectContaining({
        provider: 'snaptrade',
        providerInstitutionId: 'FIDELITY',
        covers: 'Brokerage, retirement & investment holdings',
      }),
    ]);
  });

  it('asks Plaid for the same products the connect flow will request', async () => {
    await request(app).get('/api/institutions/search').query({ query: 'chase' });

    // An institution offered here that Link then refuses is a dead end we put
    // in our own results.
    expect(institutionsSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'chase',
        products: ['transactions'],
        country_codes: ['US'],
      }),
    );
  });

  it('turns a Plaid base64 logo into something an img tag can render', async () => {
    const response = await request(app).get('/api/institutions/search').query({ query: 'chase' });

    expect(response.body.institutions[0].logoUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('spends no provider quota on a query too short to search', async () => {
    const response = await request(app).get('/api/institutions/search').query({ query: 'f' });

    expect(response.status).toBe(200);
    expect(response.body.institutions).toEqual([]);
    expect(institutionsSearch).not.toHaveBeenCalled();
    expect(listBrokerages).not.toHaveBeenCalled();
  });

  it('truncates an absurd query instead of forwarding it to a provider', async () => {
    await request(app).get('/api/institutions/search').query({ query: 'a'.repeat(5000) });

    expect(institutionsSearch.mock.calls[0][0].query).toHaveLength(100);
  });

  it('requires authentication', async () => {
    requireAuthImpl.mockImplementation((_req: any, res: any) => {
      res.status(401).json({ error: 'Authentication required' });
    });

    const response = await request(app).get('/api/institutions/search').query({ query: 'chase' });

    expect(response.status).toBe(401);
    expect(institutionsSearch).not.toHaveBeenCalled();
  });

  it('still serves banks when SnapTrade is unreachable, and names the gap', async () => {
    listBrokerages.mockRejectedValue(new Error('SnapTrade down'));

    const response = await request(app).get('/api/institutions/search').query({ query: 'fidelity' });

    expect(response.status).toBe(200);
    expect(response.body.institutions).toHaveLength(1);
    expect(response.body.degradedProviders).toEqual(['snaptrade']);
  });

  it('reads the brokerage reference table once across searches', async () => {
    await request(app).get('/api/institutions/search').query({ query: 'fidelity' });
    await request(app).get('/api/institutions/search').query({ query: 'schwab' });

    expect(listBrokerages).toHaveBeenCalledTimes(1);
    expect(institutionsSearch).toHaveBeenCalledTimes(2);
  });
});
