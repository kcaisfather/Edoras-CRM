import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // next-intl, `next/navigation`'ı uzantısız import eder; Node ESM bunu çözemez. Vite'ın
    // çözümlemesinden geçsin diye satır içi alınır (barrel'lar üzerinden testlere de ulaşıyor).
    server: { deps: { inline: ["next-intl"] } },
  },
});
