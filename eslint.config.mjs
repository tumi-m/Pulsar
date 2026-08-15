import nextConfig from "eslint-config-next";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "playwright/.cache/**",
    ],
  },
  ...nextConfig,
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
    },
    rules: {
      // The existing codebase has never been linted; keep the gate meaningful
      // without blocking on style issues that predate this phase.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "react/no-unescaped-entities": "off",
      // react-hooks v7 added strict rules that flag pre-existing patterns across
      // the codebase. Downgrade to warnings for a green baseline; the real
      // instances are tracked for Phase 1+ cleanup.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
    },
  },
];

export default eslintConfig;
