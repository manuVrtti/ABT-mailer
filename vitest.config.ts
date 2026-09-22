import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    server: {
      deps: {
        inline: ["isomorphic-dompurify", "@asamuzakjp/css-color", "@csstools/css-calc"],
      },
    },
  },
});
