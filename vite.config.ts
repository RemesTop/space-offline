import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: ["space-io.jeb4.dev"],
  },
  resolve: {
    alias: {
      "@client": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./src/shared"),
    },
  },
});
