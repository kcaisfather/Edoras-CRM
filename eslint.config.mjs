import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { readdirSync } from "node:fs";

const featureNames = readdirSync(new URL("./features", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_` önekli parametreler bilinçli olarak kullanılmıyor (ör. henüz uygulanmamış arayüzler).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Bileşen boyutu (docs/prompt_v5.md → Component Size): uyarı düzeyinde; mevcut büyük dosyalar
  // docs/teknik-borc.md'de listeli, yeni kod bu sınırların altında kalmalı.
  {
    files: ["app/**/*.tsx", "features/**/*.tsx", "components/**/*.tsx"],
    ignores: ["components/ui/**"],
    rules: {
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 250, skipBlankLines: true, skipComments: true, IIFEs: true }],
    },
  },
  // Katman sınırı (docs/prompt_v5.md): Infrastructure (lib/) ve atomik UI (components/ui/)
  // üst katmanlara bağımlı olamaz. lib/domain/ yalnız saf alan tipleri ve fonksiyonları içerir.
  {
    files: ["lib/**/*.{ts,tsx}", "components/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/features/*", "@/features/**"], message: "lib/ ve components/ui/ features/ katmanını import edemez." },
            { group: ["@/app/*", "@/app/**"], message: "lib/ ve components/ui/ app/ katmanını import edemez." },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/features/*", "@/features/**", "@/app/*", "@/app/**", "@/components/*", "@/components/**"], message: "lib/domain saf kalmalı." },
            { group: ["react", "next", "next/*", "next-intl", "@tanstack/*", "zustand"], message: "lib/domain framework'e bağımlı olamaz." },
          ],
        },
      ],
    },
  },
  // Feature'lar birbirine yalnız public API (features/<ad>/index.ts) üzerinden erişir; kendi içinde serbesttir.
  ...featureNames.map((name) => ({
    files: [`features/${name}/**/*.{ts,tsx}`],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/app/*", "@/app/**"], message: "features/ app/ katmanını import edemez." },
            {
              regex: `^@/features/(?!${name}/)[^/]+/`,
              message: "Başka bir feature'a yalnız public API ile erişilir: @/features/<ad> (index.ts).",
            },
          ],
        },
      ],
    },
  })),
  {
    files: ["components/**/*.{ts,tsx}"],
    ignores: ["components/ui/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^@/features/[^/]+/", message: "Paylaşılan bileşenler feature'lara yalnız public API ile erişir: @/features/<ad>." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
