/**
 * @jest-environment-options {"url": "https://asklinc.com/getstarted"}
 *
 * The handover cookie is set with `Secure` on HTTPS, so these run on an HTTPS
 * document: over http the browser would refuse the cookie outright and the
 * attribute under test would never appear.
 */
import {
  clearCoastFireSignupRef,
  COAST_FIRE_REF_COOKIE,
  readCoastFireSignupRef,
} from '@/lib/coast-fire-signup-context';

const TOKEN = 'a'.repeat(48);

/**
 * jsdom's cookie jar applies the same delete semantics as a browser, but it
 * does not report the attributes of a write. Reading the string back is what
 * proves the attributes were sent.
 */
function capturedWrites(run: () => void): string[] {
  const writes: string[] = [];
  const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => descriptor.get!.call(document),
    set: (value: string) => {
      writes.push(value);
      descriptor.set!.call(document, value);
    },
  });
  try {
    run();
  } finally {
    delete (document as unknown as Record<string, unknown>).cookie;
  }
  return writes;
}

describe('the Coast FIRE handover cookie', () => {
  afterEach(() => {
    clearCoastFireSignupRef();
  });

  it('is read back only when it holds one of our tokens', () => {
    document.cookie = `${COAST_FIRE_REF_COOKIE}=${TOKEN}; Path=/getstarted; Secure`;
    expect(readCoastFireSignupRef()).toBe(TOKEN);

    document.cookie = `${COAST_FIRE_REF_COOKIE}=nonsense; Path=/getstarted; Secure`;
    expect(readCoastFireSignupRef()).toBeNull();
  });

  /*
   * `/coast-fire/continue` sets Secure on HTTPS. A clearing write that omits
   * it does not reliably replace the stored cookie, which would leave a
   * 90-day bearer token readable on /getstarted for the rest of its ten
   * minutes after the page believed it had spent it.
   */
  it('mirrors Secure when clearing, so the spend is not a no-op', () => {
    document.cookie = `${COAST_FIRE_REF_COOKIE}=${TOKEN}; Path=/getstarted; Secure`;

    const [write] = capturedWrites(() => clearCoastFireSignupRef());

    expect(write).toContain('Secure');
    expect(write).toContain('Path=/getstarted');
    expect(write).toContain('Max-Age=0');
    expect(readCoastFireSignupRef()).toBeNull();
  });
});
