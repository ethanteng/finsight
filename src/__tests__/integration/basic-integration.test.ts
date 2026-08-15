import request from 'supertest';
import { testApp } from './test-app-setup';
import { testPrisma } from '../setup/test-database-ci';

describe('Basic Integration Tests', () => {
  afterAll(async () => {
    // testPrisma is managed by the test database setup
  });

  it('should have a working health endpoint', async () => {
    const response = await request(testApp).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
    expect(response.body).toHaveProperty('memory');
  });

  it('should have a working database connection', async () => {
    // A missing table means migrations did not run, which is exactly the failure
    // this test exists to catch. The previous version caught that error and
    // passed anyway, so the suite stayed green on an unmigrated database.
    const accounts = await testPrisma.account.findMany();
    expect(Array.isArray(accounts)).toBe(true);
  });

});
