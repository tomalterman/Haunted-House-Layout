import { defineConfig } from "vite";

// The Worker serves dist/ as static assets (wrangler.toml). publicDir is off so
// Vite's default static-copy folder cannot collide with the build output.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      // Local sync: `npm run dev:worker` runs the Durable Object on :8787.
      "/parties": {
        target: "http://localhost:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
