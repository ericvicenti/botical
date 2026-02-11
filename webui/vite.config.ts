import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import { resolve } from "path";

// Allow dynamic backend port via environment variable (set by scripts/dev.ts)
// Default to 6001 (first port in XX01/XX02 scheme starting at 60)
const apiPort = process.env.VITE_API_PORT || "6001";

export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 6002, // Default to XX02 scheme (can be overridden with --port)
    allowedHosts: ["tiger.verse.link", "localhost"],
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "/auth": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
      "/oauth": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
