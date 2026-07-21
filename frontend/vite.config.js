import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api to the FastAPI backend so there are no CORS issues.
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      // Explicit IPv4 loopback: Node's proxy resolves "localhost" to IPv6
      // (::1) first on some systems, which fails since uvicorn binds IPv4-only.
      "/api": "http://127.0.0.1:8000",
    },
  },
});
