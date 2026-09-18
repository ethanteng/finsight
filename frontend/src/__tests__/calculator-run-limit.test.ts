/**
 * The run limit, and what it does with whatever the environment hands it.
 *
 * Under Next.js the variable is inlined at build time; here Jest leaves it in
 * `process.env` and the module reads it on import. What that difference leaves
 * genuinely under test is the parsing — which is the part that can be wrong,
 * and the part a deploy would otherwise discover by silently giving every
 * visitor the default.
 */

const VARIABLE = 'NEXT_PUBLIC_CALCULATOR_RUN_LIMIT';
const DEFAULT_LIMIT = 3;

/** Re-import under a given value, since the module reads it once on load. */
function limitFor(value: string | undefined): number {
  jest.resetModules();
  const previous = process.env[VARIABLE];
  if (value === undefined) delete process.env[VARIABLE];
  else process.env[VARIABLE] = value;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/lib/calculator-run-limit').CALCULATOR_RUN_LIMIT as number;
  } finally {
    if (previous === undefined) delete process.env[VARIABLE];
    else process.env[VARIABLE] = previous;
  }
}

it('takes a positive integer from the environment', () => {
  expect(limitFor('5')).toBe(5);
  expect(limitFor('1')).toBe(1);
  expect(limitFor(' 10 ')).toBe(10);
});

it('falls back to the default when nothing usable is set', () => {
  expect(limitFor(undefined)).toBe(DEFAULT_LIMIT);
  expect(limitFor('')).toBe(DEFAULT_LIMIT);
});

/*
 * The same rule `positiveIntFromEnv` applies on the backend. Nothing here
 * means "no limit": a zero or a negative reads as a misconfiguration and gets
 * the default, rather than quietly switching the nudge off.
 */
it('refuses values that are not a positive whole number of runs', () => {
  for (const value of ['0', '-1', 'two', '2.5', 'NaN', 'Infinity']) {
    expect(limitFor(value)).toBe(DEFAULT_LIMIT);
  }
});

/*
 * `2.5` parsing to 2 rather than being refused would be the easy mistake here:
 * parseInt truncates silently, so a fractional value has to be caught by the
 * integer check rather than by the parse.
 */
it('does not silently truncate a fractional limit', () => {
  expect(limitFor('2.5')).not.toBe(2);
});

/*
 * The plural was safe while the number was always three. It is not any more,
 * and "That is 1 runs." is what a limit of one used to print on the page.
 */
it('says the limit the way the lock copy has to read it', () => {
  jest.resetModules();
  process.env[VARIABLE] = '1';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('@/lib/calculator-run-limit').runLimitPhrase()).toBe('1 run');
  } finally {
    delete process.env[VARIABLE];
  }

  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expect(require('@/lib/calculator-run-limit').runLimitPhrase()).toBe('3 runs');
});

it('clamps a stored count to whatever the limit currently is', () => {
  jest.resetModules();
  process.env[VARIABLE] = '2';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const runLimit = require("@/lib/calculator-run-limit");
    window.sessionStorage.setItem('asklinc.test.runs', '99');
    expect(runLimit.readRunCount("asklinc.test.runs")).toBe(2);
    expect(runLimit.isRunLimitReached(2)).toBe(true);
    expect(runLimit.isRunLimitReached(1)).toBe(false);
  } finally {
    delete process.env[VARIABLE];
    window.sessionStorage.removeItem('asklinc.test.runs');
  }
});
