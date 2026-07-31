import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Outillage AI hors périmètre du dépôt : déjà ignoré par git et par
    // vitest, il ne doit pas non plus être lint. Son style (require(), etc.)
    // n'a pas à être aligné sur celui de l'application.
    "_bmad/**",
    "_bmad-output/**",
    ".claude/**",
    ".agents/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
