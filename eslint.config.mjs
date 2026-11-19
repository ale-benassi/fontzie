import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import vue from "eslint-plugin-vue";
import globals from "globals";
import ts from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "node_modules/",
    ".wxt/",
    ".output/",
    "output/",
    "test-results/",
    "playwright-report/",
    "tests/results/",
    "tests/screenshots/",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,vue}"],
    extends: [js.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
      // Navigation and teardown use best-effort cleanup; edit errors still need reporting.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.{ts,vue}"],
    extends: [ts.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-implied-eval": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          // Chrome/Vue callbacks accept async handlers. Rejection handling is reviewed.
          checksVoidReturn: { arguments: false, attributes: false },
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ["**/*.vue"],
    extends: [vue.configs["flat/essential"]],
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: {
      // Source-owned primitives use names such as Button, Input and Switch.
      "vue/multi-word-component-names": "off",
    },
  },
  {
    files: [
      "{background,components,composables,content,core,entrypoints,providers,storage}/**/*.{ts,vue}",
      "playground/**/*.js",
    ],
    languageOptions: { globals: { ...globals.browser, chrome: "readonly" } },
  },
  {
    files: ["entrypoints/background.ts"],
    languageOptions: { globals: { defineBackground: "readonly" } },
  },
  {
    files: ["entrypoints/{floating,inspector}.ts"],
    languageOptions: { globals: { defineUnlistedScript: "readonly" } },
  },
  {
    files: ["*.{ts,mjs}", "scripts/**/*.mjs", "tests/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  // Only JS/TS/Vue are linted; CSS (including embedded font bytes) stays outside ESLint.
  // Keep formatting rules in Prettier.
  prettier,
]);
