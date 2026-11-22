import { defineConfig } from "vite-plus";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  base: "/BeElectrolyzed/",
  plugins: [tailwindcss()],
  test: { include: ["tests/**/*.test.ts"] },
});
