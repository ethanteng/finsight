import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Disable apostrophe/quote escaping requirement - allow natural text
      "react/no-unescaped-entities": "off",
      // Allow unused variables that start with underscore - set to warn to not fail CI
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      // Also override the base no-unused-vars rule
      "no-unused-vars": "off", // Turn off base rule as it conflicts with @typescript-eslint version
      // Relax React hooks dependencies for common patterns
      "react-hooks/exhaustive-deps": "warn"
    }
  }
];

export default eslintConfig;
