import {
  POST_LOGIN_REDIRECT_PARAM,
  loginUrlFor,
  sanitizePostLoginRedirect,
} from '@/lib/post-login-redirect';

describe('sanitizePostLoginRedirect', () => {
  it('keeps a relative path with its query and hash', () => {
    expect(sanitizePostLoginRedirect('/profile?connect=plaid')).toBe('/profile?connect=plaid');
    expect(sanitizePostLoginRedirect('/finances#holdings')).toBe('/finances#holdings');
    expect(sanitizePostLoginRedirect('/app')).toBe('/app');
  });

  it('rejects absolute URLs so the sign-in page cannot be an open redirect', () => {
    expect(sanitizePostLoginRedirect('https://evil.example/steal')).toBeNull();
    expect(sanitizePostLoginRedirect('http://evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('javascript:alert(1)')).toBeNull();
    expect(sanitizePostLoginRedirect('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects protocol-relative paths that resolve to another host', () => {
    expect(sanitizePostLoginRedirect('//evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('//evil.example/profile')).toBeNull();
    expect(sanitizePostLoginRedirect('/\\evil.example')).toBeNull();
  });

  it('rejects paths that normalize into a protocol-relative URL', () => {
    // `new URL` collapses these to pathname `//evil.example` / `///evil.example`.
    // Returning that string would open-redirect on the subsequent navigation.
    expect(sanitizePostLoginRedirect('/.//evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('/..//evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('/profile/..//evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('/%2e%2e//evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('/.///evil.example')).toBeNull();
  });

  it('rejects control characters a browser would strip into a protocol-relative path', () => {
    expect(sanitizePostLoginRedirect('/\t/evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('/\n/evil.example')).toBeNull();
    expect(sanitizePostLoginRedirect('/\r/evil.example')).toBeNull();
  });

  it('rejects anything that is not a path on this origin', () => {
    expect(sanitizePostLoginRedirect('profile')).toBeNull();
    expect(sanitizePostLoginRedirect('')).toBeNull();
    expect(sanitizePostLoginRedirect(null)).toBeNull();
    expect(sanitizePostLoginRedirect(undefined)).toBeNull();
    expect(sanitizePostLoginRedirect(`/${'a'.repeat(512)}`)).toBeNull();
  });

  it('rejects the authentication pages themselves so signing in cannot loop', () => {
    expect(sanitizePostLoginRedirect('/login')).toBeNull();
    expect(sanitizePostLoginRedirect('/LOGIN?returnTo=/login')).toBeNull();
    expect(sanitizePostLoginRedirect('/register')).toBeNull();
    expect(sanitizePostLoginRedirect('/reset-password?token=abc')).toBeNull();
  });
});

describe('loginUrlFor', () => {
  it('encodes a safe destination into the sign-in URL', () => {
    expect(loginUrlFor('/profile?connect=plaid')).toBe(
      `/login?${POST_LOGIN_REDIRECT_PARAM}=${encodeURIComponent('/profile?connect=plaid')}`
    );
  });

  it('falls back to a plain sign-in URL when the destination is rejected', () => {
    expect(loginUrlFor('https://evil.example')).toBe('/login');
    expect(loginUrlFor('/login')).toBe('/login');
  });
});
