import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://localhost",
  server: { port: 4321 },
  vite: {
    server: {
      // permite leer el CSV del scraper (un nivel arriba)
      fs: { allow: [".."] },
    },
  },
});
