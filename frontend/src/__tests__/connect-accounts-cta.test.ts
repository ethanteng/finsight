import fs from 'fs';
import path from 'path';

/**
 * The "add your accounts" call to action pulses a halo so a user with nothing
 * connected can see what to do next. The halo is drawn with `box-shadow`, and
 * an animation on that property beats any `box-shadow` a utility class sets --
 * including the focus ring. So the rules that switch the animation off are as
 * much a part of the feature as the keyframes, and are guarded here: without
 * them the button is unfocusable to the eye, and it moves for a user who asked
 * motion not to.
 */

const CSS = fs.readFileSync(
  path.join(__dirname, '../app/globals.css'),
  'utf8',
);

const TSX_ROOT = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

/** The block a selector introduces, from its brace to the matching one. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated rule for ${selector}`);
}

describe('connect-accounts attention cue', () => {
  it('defines the halo animation', () => {
    expect(CSS).toContain('@keyframes connect-accounts-halo');
    expect(ruleBody(CSS, '.connect-accounts-cta {')).toMatch(
      /animation:\s*connect-accounts-halo/,
    );
  });

  it('drops the animation on hover and focus so the focus ring is not overridden', () => {
    expect(ruleBody(CSS, '.connect-accounts-cta:hover,')).toMatch(/animation:\s*none/);
  });

  it('drops the animation under prefers-reduced-motion', () => {
    const query = ruleBody(CSS, '@media (prefers-reduced-motion: reduce) {\n  .connect-accounts-cta');
    expect(query).toMatch(/animation:\s*none/);
  });

  // The cue means "this is the one thing to do". Putting it on a second control
  // would take that away, so the set of users is pinned.
  it('is used only by the two empty-state calls to action', () => {
    const users = sourceFiles(TSX_ROOT)
      .filter(file => fs.readFileSync(file, 'utf8').includes('connect-accounts-cta'))
      .map(file => path.relative(TSX_ROOT, file))
      .sort();

    expect(users).toEqual([
      'app/finances/FinancesPageClient.tsx',
      'components/FinancialOverview.tsx',
    ]);
  });
});
