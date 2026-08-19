const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

// react-markdown and its unified/remark/micromark dependency tree ship ESM
// only, so Jest has to transform them instead of skipping node_modules
// wholesale. Without this, any test that renders MarkdownRenderer for real
// dies on `Unexpected token 'export'` and has to mock the component away —
// which is no way to test what the component does with untrusted content.
const ESM_ONLY_PACKAGES = [
  '@ungap/structured-clone',
  'bail',
  'ccount',
  'character-entities.*',
  'comma-separated-tokens',
  'decode-named-character-reference',
  'devlop',
  'escape-string-regexp',
  'estree-util-is-identifier-name',
  'hast-util-.*',
  'html-url-attributes',
  'is-(alphabetical|alphanumerical|decimal|hexadecimal|plain-obj)',
  'longest-streak',
  'markdown-table',
  'mdast-util-.*',
  'micromark.*',
  'parse-entities',
  'property-information',
  'react-markdown',
  'remark-.*',
  'space-separated-tokens',
  'stringify-entities',
  'trim-lines',
  'trough',
  'unified',
  'unist-util-.*',
  'vfile.*',
  'zwitch',
];

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
  ],
}

// next/jest prepends its own transformIgnorePatterns, and the list is an OR:
// its `/node_modules/(?!.pnpm)(?!(geist)/)` entry matches react-markdown, so
// appending a looser pattern of our own cannot un-ignore it. Resolve next's
// config first, then replace that entry with one that also lets the ESM
// packages through. `geist` is next/jest's own allowance and is kept.
module.exports = async () => {
  const config = await createJestConfig(customJestConfig)()
  const transformable = ['geist', ...ESM_ONLY_PACKAGES].join('|')

  config.transformIgnorePatterns = [
    `/node_modules/(?!.pnpm)(?!(${transformable})/)`,
    `/node_modules/.pnpm/(?!(${transformable})@)`,
    '^.+\\.module\\.(css|sass|scss)$',
  ]

  return config
}