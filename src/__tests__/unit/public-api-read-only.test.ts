import fs from 'fs';
import path from 'path';

/**
 * Public's personal API is not read-only and the secret is not scope-limited: the
 * same credential that reads balances can place, replace and cancel orders. Ask
 * Linc stores that secret, so the guarantee that we never trade has to be
 * enforced by something other than intent.
 */

const CLIENT = fs.readFileSync(
  path.join(__dirname, '../../services/public-api/client.ts'),
  'utf8',
);

const MODULE_DIR = path.join(__dirname, '../../services/public-api');

/** Every Public path that mutates an account. */
const ORDER_PATHS = [
  '/order',
  '/orders',
  'place-order',
  'placeOrder',
  'cancel-order',
  'cancelOrder',
  'preflight',
  'multileg',
];

describe('Public API client is read-only', () => {
  it('names no order-placement path anywhere in the client', () => {
    const lowered = CLIENT.toLowerCase();
    for (const orderPath of ORDER_PATHS) {
      expect(lowered).not.toContain(orderPath.toLowerCase());
    }
  });

  // The token call is a POST by necessity. Any other POST, or any PUT/PATCH/DELETE,
  // would be a mutation of the user's account.
  //
  // Asserted as an invariant rather than a count. An earlier version pinned the
  // exact number of GETs, which turned every legitimate new read into a failing
  // test and invited raising the number without checking why -- the one habit
  // this file exists to prevent.
  it('issues exactly one POST, and no mutating method at all', () => {
    const callSites = CLIENT.replace(/method:\s*'GET'\s*\|\s*'POST';/g, '');
    const methods = [...callSites.matchAll(/method:\s*'([A-Z]+)'/g)].map(match => match[1]);

    expect(methods.filter(method => method === 'POST')).toHaveLength(1);
    expect(methods.every(method => method === 'GET' || method === 'POST')).toBe(true);
    expect(CLIENT).not.toMatch(/method:\s*'(PUT|PATCH|DELETE)'/);
  });

  // The single POST must be the token mint and nothing else.
  it('uses its one POST for the access token and nothing else', () => {
    const callSites = CLIENT.replace(/method:\s*'GET'\s*\|\s*'POST';/g, '');
    const postIndex = callSites.indexOf("method: 'POST'");
    // The path is the first argument to requestJson, so it sits just above the
    // method in the same call.
    const enclosing = callSites.slice(Math.max(0, postIndex - 600), postIndex);

    expect(enclosing).toContain('ACCESS_TOKEN_PATH');
  });

  // Every path the client can reach, named explicitly. A new one has to be added
  // here deliberately, which is the point: it forces a decision rather than
  // letting a request path appear by accident.
  it('reaches only the four known read paths', () => {
    const paths = [...CLIENT.matchAll(/['`](\/userapi[a-zA-Z0-9/_${}().-]*)['`]/g)].map(match => match[1]);

    expect(new Set(paths)).toEqual(new Set([
      '/userapiauthservice/personal/access-tokens',
      '/userapigateway/trading/account',
      '/userapigateway/trading/${encodeURIComponent(accountId)}/portfolio/v2',
      '/userapigateway/trading/${encodeURIComponent(accountId)}/taxlots/unrealized',
    ]));
  });

  it('keeps every Public request inside the client module', () => {
    const others = fs
      .readdirSync(MODULE_DIR)
      .filter(file => file.endsWith('.ts') && file !== 'client.ts');
    for (const file of others) {
      const source = fs.readFileSync(path.join(MODULE_DIR, file), 'utf8');
      expect(source).not.toContain('fetch(');
      expect(source).not.toContain('api.public.com');
    }
  });
});
