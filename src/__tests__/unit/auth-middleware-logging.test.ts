import { optionalAuth } from '../../auth/middleware';
import { generateToken } from '../../auth/utils';

/**
 * The credentials this middleware handles must never reach the platform logs.
 *
 * optionalAuth is mounted on every route, so it used to write the full request
 * header set — including a live `Authorization: Bearer <jwt>` and the session
 * cookies — on every authenticated request. Anyone with log access could replay
 * those tokens until they expired.
 *
 * These assert the invariant rather than the wording of any one log line, so a
 * new log statement that reintroduces the leak fails here even though the old
 * one is gone.
 */
describe('optionalAuth logging', () => {
  const ORIGINAL_SECRET = process.env.JWT_SECRET;
  let logged: string[];
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const record = (...args: unknown[]) => {
    logged.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-for-logging-assertions';
    logged = [];
    logSpy = jest.spyOn(console, 'log').mockImplementation(record);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(record);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (ORIGINAL_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

  const runWithToken = (token: string) => {
    const req: any = {
      headers: {
        authorization: `Bearer ${token}`,
        cookie: 'session=super-secret-cookie-value',
        'x-forwarded-for': '203.0.113.7',
      },
    };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    optionalAuth(req, res, next);
    return { req, next };
  };

  it('never logs the bearer token, in whole or in part', () => {
    const token = generateToken({ userId: 'user-abc', email: 'someone@example.com', tier: 'premium' });
    const { next } = runWithToken(token);

    expect(next).toHaveBeenCalled();
    const output = logged.join('\n');

    expect(output).not.toContain(token);
    // A prefix is still token material — the old code logged the first 20 chars.
    expect(output).not.toContain(token.slice(0, 20));
    // The signature alone is enough to be worth withholding.
    expect(output).not.toContain(token.split('.')[2]);
  });

  it('never logs the request headers it was handed', () => {
    const token = generateToken({ userId: 'user-abc', email: 'someone@example.com', tier: 'premium' });
    runWithToken(token);
    const output = logged.join('\n');

    expect(output).not.toContain('super-secret-cookie-value');
    expect(output).not.toMatch(/authorization/i);
  });

  it('never logs the email address carried in the token claims', () => {
    const token = generateToken({ userId: 'user-abc', email: 'someone@example.com', tier: 'premium' });
    runWithToken(token);

    expect(logged.join('\n')).not.toContain('someone@example.com');
  });

  it('still records enough to debug with — token presence and the user id', () => {
    const token = generateToken({ userId: 'user-abc', email: 'someone@example.com', tier: 'premium' });
    const { req } = runWithToken(token);

    expect(req.user).toEqual({ id: 'user-abc', email: 'someone@example.com', tier: 'premium' });
    const output = logged.join('\n');
    expect(output).toContain('user-abc');
    expect(output).toMatch(/bearer token present: yes/i);
  });

  it('records the absence of a token without inventing one', () => {
    const req: any = { headers: {} };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(logged.join('\n')).toMatch(/bearer token present: no/i);
  });
});
