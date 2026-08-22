import express from 'express';
import request from 'supertest';

const getPublicEligibility = jest.fn();
const storeSecret = jest.fn();
const deleteSecret = jest.fn();
const getStatus = jest.fn();
const mintAccessToken = jest.fn();
const schedule = jest.fn();

jest.mock('../../services/public-api/eligibility', () => ({
  getPublicEligibility: (...args: any[]) => getPublicEligibility(...args),
}));
jest.mock('../../services/public-api/credential-store', () => ({
  storeSecret: (...args: any[]) => storeSecret(...args),
  deleteSecret: (...args: any[]) => deleteSecret(...args),
  getStatus: (...args: any[]) => getStatus(...args),
}));
jest.mock('../../services/public-api/client', () => {
  class PublicApiError extends Error {
    constructor(message: string, public status?: number, public credentialRejected = false) {
      super(message);
    }
  }
  return { PublicApiError, mintAccessToken: (...args: any[]) => mintAccessToken(...args) };
});
jest.mock('../../services/financial-revision-service', () => ({
  FinancialRevisionService: { schedule: (...args: any[]) => schedule(...args) },
}));
jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'user@example.com', tier: 'premium' };
    next();
  },
}));

const { PublicApiError } = jest.requireMock('../../services/public-api/client');
import publicApiRouter from '../../auth/public-api-routes';

const app = express();
app.use(express.json());
app.use('/public-api', publicApiRouter);

describe('Public API routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPublicEligibility.mockResolvedValue({ eligible: true, snapTradeAccountIds: ['snaptrade-a'], configured: false });
    getStatus.mockResolvedValue({ configured: false, lastVerifiedAt: null, lastError: null });
    mintAccessToken.mockResolvedValue('tok-1');
    storeSecret.mockResolvedValue(undefined);
    deleteSecret.mockResolvedValue(true);
  });

  it('reports eligibility and configuration without exposing a secret', async () => {
    getStatus.mockResolvedValue({ configured: true, lastVerifiedAt: new Date('2026-08-22'), lastError: null });

    const response = await request(app).get('/public-api/status').expect(200);

    expect(response.body.data).toMatchObject({ eligible: true, configured: true });
    expect(JSON.stringify(response.body)).not.toMatch(/secret/i);
  });

  // The gate is the whole reason this is not a general "bring your own brokerage
  // key" feature, so it has to hold against a crafted request, not just a hidden
  // UI control.
  it('refuses to store a secret for a user with no Public connection', async () => {
    getPublicEligibility.mockResolvedValue({ eligible: false, snapTradeAccountIds: [], configured: false });

    await request(app).put('/public-api/secret').send({ secret: 'abc' }).expect(403);

    expect(storeSecret).not.toHaveBeenCalled();
    expect(mintAccessToken).not.toHaveBeenCalled();
  });

  it('verifies the secret against Public before storing it', async () => {
    await request(app).put('/public-api/secret').send({ secret: 'SECRET' }).expect(200);

    expect(mintAccessToken).toHaveBeenCalledWith('SECRET');
    expect(storeSecret).toHaveBeenCalledWith('user-1', 'SECRET');
  });

  // Storing a secret Public has already rejected would produce an ingestion pass
  // that silently finds nothing.
  it('does not store a secret Public rejected', async () => {
    mintAccessToken.mockRejectedValue(new PublicApiError('rejected', 401, true));

    const response = await request(app).put('/public-api/secret').send({ secret: 'bad' }).expect(400);

    expect(storeSecret).not.toHaveBeenCalled();
    expect(response.body.error).toMatch(/did not accept/i);
  });

  it('distinguishes Public being unreachable from a bad secret', async () => {
    mintAccessToken.mockRejectedValue(new PublicApiError('unwell', 500, false));

    await request(app).put('/public-api/secret').send({ secret: 'good' }).expect(502);

    expect(storeSecret).not.toHaveBeenCalled();
  });

  it('rejects an empty or oversized secret without calling Public', async () => {
    await request(app).put('/public-api/secret').send({ secret: '  ' }).expect(400);
    await request(app).put('/public-api/secret').send({ secret: 'x'.repeat(5000) }).expect(400);

    expect(mintAccessToken).not.toHaveBeenCalled();
  });

  // The snapshot is what the finances page and Ask Linc read, so without a
  // rebuild the recovered balances do not appear until the next scheduled run.
  it('queues a snapshot rebuild after connecting', async () => {
    await request(app).put('/public-api/secret').send({ secret: 'SECRET' }).expect(200);

    expect(schedule).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ history: { kind: 'material', reason: 'public-direct-connected' } }),
      expect.any(String),
    );
  });

  // Removing the secret un-suppresses SnapTrade's Public accounts, so the totals
  // move either way.
  it('queues a rebuild after disconnecting', async () => {
    await request(app).delete('/public-api/secret').expect(200);

    expect(schedule).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ history: { kind: 'material', reason: 'public-direct-disconnected' } }),
      expect.any(String),
    );
  });

  it('reports a delete with nothing to remove', async () => {
    deleteSecret.mockResolvedValue(false);

    await request(app).delete('/public-api/secret').expect(404);

    expect(schedule).not.toHaveBeenCalled();
  });
});
