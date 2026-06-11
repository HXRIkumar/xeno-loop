import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the tsconfig "@/*" -> "src/*" path alias for vitest's runtime module resolution, so unit
// tests can import real modules (e.g. "@/lib/utils") the same way app code does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
