import fs from 'fs';
import path from 'path';

/**
 * The authenticated site renders dark-theme Tailwind classes on a light surface
 * by remapping them in `globals.css`. Text colours are remapped wholesale, so any
 * dark background left unremapped puts dark ink on a near-black fill.
 *
 * State-prefixed utilities are separate selectors: remapping `.bg-gray-800` does
 * nothing for `.hover\:bg-gray-800:hover`. That gap is invisible on a static page
 * and only appears under the cursor, which is how the admin "Show details" toggle
 * shipped unreadable on hover.
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

/** Dark greys whose hover state would be unreadable under the text remap. */
const DARK_HOVER_GREYS = /hover:bg-gray-(500|600|700|750|800|900|950)/g;

describe('authenticated-site dark-class remapping', () => {
  it('remaps the hover background the admin details toggle uses', () => {
    expect(CSS).toMatch(/\.authenticated-site \.hover\\:bg-gray-800:hover/);
  });

  // The real guard: every dark hover grey the app actually uses must have a rule,
  // so adding one in a component cannot silently reintroduce dark-on-dark.
  it('remaps every dark hover grey the components use', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(TSX_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(DARK_HOVER_GREYS)) used.add(match[1]);
    }

    const unremapped = [...used].filter(
      shade => !CSS.includes(`.authenticated-site .hover\\:bg-gray-${shade}:hover`),
    );

    expect(unremapped).toEqual([]);
  });
});
