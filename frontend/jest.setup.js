import '@testing-library/jest-dom'

// Set up environment variables for tests
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Browser-only shims. Guarded so a server-side test (a route handler, which
// needs the node environment for the web Request/Response it is built on) can
// share this setup instead of needing its own.
if (typeof window !== 'undefined') {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // deprecated
      removeListener: jest.fn(), // deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })

  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    disconnect() {}
    observe() {}
    unobserve() {}
  }
} 
/*
 * The suite runs against the default run limit, whatever a developer happens
 * to have exported. Cases that run a calculator more than once are about
 * something else entirely, and a low `NEXT_PUBLIC_CALCULATOR_RUN_LIMIT` in the
 * environment would fail them for a reason that has nothing to do with what
 * they test. The limit's own suite sets the variable explicitly.
 *
 * Deleted here rather than in a beforeEach: the module reads it once on import.
 */
delete process.env.NEXT_PUBLIC_CALCULATOR_RUN_LIMIT

/*
 * One jsdom serves every test in a file, and session storage outlives a
 * render. Anything a component persists — the calculators count their runs
 * there, so the fourth submit in a file is refused — otherwise leaks into the
 * next test as state no visitor would have had.
 */
beforeEach(() => {
  try {
    window.sessionStorage.clear()
  } catch {
    // Not every environment provides one; nothing here depends on it existing.
  }
})
