import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Builds to web/dist, which Go embeds (web/embed.go). Dev server proxies the
// API + SSE to the running Go binary so `npm run dev` works against real data.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://localhost:9100",
      "/events": "http://localhost:9100",
    },
  },
});
