/**
 * The address a visitor already gave a calculator in this tab, so the next
 * email form can be prefilled with it rather than asking again.
 *
 * Only the address is stored, never any figures. Session storage, so it goes
 * with the tab. Blocked storage, a private window and a cleared tab all read
 * as nothing remembered: the cost is one empty box.
 */

export const CALCULATOR_EMAIL_STORAGE_KEY = 'asklinc.calculator-email.v1';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readRememberedEmail(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CALCULATOR_EMAIL_STORAGE_KEY);
    return raw && EMAIL_PATTERN.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function rememberEmail(email: string): void {
  if (typeof window === 'undefined') return;
  const address = email.trim();
  if (!EMAIL_PATTERN.test(address)) return;
  try {
    window.sessionStorage.setItem(CALCULATOR_EMAIL_STORAGE_KEY, address);
  } catch {
    // Storage refused. The next form just starts empty.
  }
}
