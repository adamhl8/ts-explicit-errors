import { ESLintConfigBuilder } from "eslint-config-builder"
import tseslint from "typescript-eslint"

const eslintConfig = new ESLintConfigBuilder().jsonYamlToml().testing().build()

export default tseslint.config(
  { ignores: ["dist/"] },
  eslintConfig,
  {
    files: ["src/index.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "promise/prefer-await-to-then": "off",
      "promise/prefer-await-to-callbacks": "off",
    },
  },
  {
    files: ["src/tests/**/*.test.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/only-throw-error": "off",
    },
  },
)
