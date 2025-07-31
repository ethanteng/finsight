// Mock external dependencies before importing the app
jest.mock('../../openai', () => ({
  askOpenAI: jest.fn().mockResolvedValue('Mocked response'),
}));

jest.mock('../../plaid', () => ({
  setupPlaidRoutes: jest.fn(),
  plaidClient: {
    accountsGet: jest.fn(),
    transactionsGet: jest.fn(),
  },
}));

jest.mock('../../data/orchestrator', () => ({
  dataOrchestrator: {
    getMarketContext: jest.fn().mockResolvedValue({}),
  },
}));

import request from 'supertest';
import { app } from '../../index';

describe('Health Endpoint', () => {
  it('should return 200 OK for health check', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'OK' });
  });
}); 