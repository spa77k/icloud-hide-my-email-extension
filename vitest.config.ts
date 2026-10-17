import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __E2E__: "false",
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
});
