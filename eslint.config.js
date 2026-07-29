import js from "@eslint/js"
import vitestPlugin from "@vitest/eslint-plugin"
import prettierConfig from "eslint-config-prettier/flat"
import reactPlugin from "eslint-plugin-react"
import reactHooksPlugin from "eslint-plugin-react-hooks"
import globals from "globals"
import { config, configs } from "typescript-eslint"

const eslintConfig = config(
  {
    name: "global-ignores",
    ignores: [
      "**/*.snap",
      "**/dist/",
      "**/dev-dist/",
      "**/.yalc/",
      "**/build/",
      "**/temp/",
      "**/.temp/",
      "**/.tmp/",
      "**/.yarn/",
      "**/coverage/",
      "**/playwright-report/",
      "**/test-results/",
      "apps/import-worker/src/index.js",
    ],
  },
  {
    name: `${js.meta.name}/recommended`,
    ...js.configs.recommended,
  },
  configs.strictTypeChecked,
  configs.stylisticTypeChecked,
  vitestPlugin.configs.recommended,
  {
    name: "eslint-plugin-react/jsx-runtime",
    ...reactPlugin.configs.flat["jsx-runtime"],
  },
  reactHooksPlugin.configs["recommended-latest"],
  {
    name: "main",
    linterOptions: {
      reportUnusedDisableDirectives: 2,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      vitest: {
        typecheck: true,
      },
    },
    rules: {
      "no-undef": [0],
      "@typescript-eslint/consistent-type-definitions": [2, "type"],
      "@typescript-eslint/consistent-type-imports": [
        2,
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: true,
        },
      ],
      "no-restricted-imports": [
        2,
        {
          paths: [
            {
              name: "react-redux",
              importNames: ["useSelector", "useStore", "useDispatch"],
              message:
                "Please use pre-typed versions from `apps/web/src/app/hooks.ts` instead.",
            },
          ],
        },
      ],
      "@typescript-eslint/no-unnecessary-condition": [0],
      "@typescript-eslint/restrict-template-expressions": [
        2,
        {
          allowNumber: true,
        },
      ],
    },
  },
  {
    files: ["eslint.config.js"],
    rules: {
      "@typescript-eslint/no-deprecated": [0],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": [0],
      "@typescript-eslint/no-unnecessary-type-assertion": [0],
    },
  },
  {
    files: ["apps/web/src/features/offline/offlineService.ts"],
    rules: {
      "@typescript-eslint/no-invalid-void-type": [0],
    },
  },
  {
    files: ["apps/game-worker/src/types.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-type-parameters": [0],
    },
  },

  prettierConfig,
)

export default eslintConfig
