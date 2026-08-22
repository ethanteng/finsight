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
  // The request-init type declares the union of permitted methods, so it is
  // stripped first -- matching it as if it were a call site would let a real POST
  // hide behind the type's own literal.
  it('issues no request method other than the token POST and account GETs', () => {
    const callSites = CLIENT.replace(/method:\s*'GET'\s*\|\s*'POST';/g, '');
    const methods = [...callSites.matchAll(/method:\s*'([A-Z]+)'/g)].map(match => match[1]);

    expect(methods.sort()).toEqual(['GET', 'GET', 'POST']);
  });

  it('declares only the documented read paths as literals', () => {
    const paths = [...CLIENT.matchAll(/'(\/[a-zA-Z0-9/_-]+)'/g)].map(match => match[1]);
    expect(paths).toEqual([
      '/userapiauthservice/personal/access-tokens',
      '/userapigateway/trading/account',
    ]);
    // The portfolio path is a template literal because it interpolates an account
    // id, so it cannot appear above; pin its shape separately.
    expect(CLIENT).toContain('/userapigateway/trading/${encodeURIComponent(accountId)}/portfolio/v2');
  });

  // A future module importing the SDK or calling fetch directly would sidestep
  // the guarantees above, so the whole directory is held to one HTTP entry point.
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
