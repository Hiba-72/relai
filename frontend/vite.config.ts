/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    // Some techs at the hospital use Basilisk (UXP fork, ~Firefox 52 ESR
    // with backports). Default Vite target emits ES2020+ syntax that older
    // Basilisk builds can't parse. es2018 + firefox60 makes esbuild transpile
    // optional chaining / nullish coalescing down to legacy syntax.
    target: ["es2018", "firefox60"],
    // Disable the modulepreload polyfill: it injects a tiny inline <script>
    // which violates our strict CSP (script-src 'self'). Skipping preload
    // costs a hair of latency; the actual module scripts still load fine.
    modulePreload: { polyfill: false },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Only unit tests. The API is covered by the backend suite against a real
    // PostgreSQL; duplicating that here with mocks would test the mocks.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
