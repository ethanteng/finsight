/** Routes where HeyCatch should not initialize or capture events. */
export const HEYCATCH_EXCLUDED_PATH_PREFIXES = [
  '/login',
  '/app',
  '/finances',
  '/admin',
  '/profile',
] as const;

export function isHeyCatchExcludedPath(pathname: string): boolean {
  return HEYCATCH_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isHeyCatchEnabledPath(pathname: string): boolean {
  return !isHeyCatchExcludedPath(pathname);
}
