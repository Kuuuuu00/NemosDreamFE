import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = "https://nemosdream.cloud";

// The backend only allows `Origin: http://localhost:5173` (live finding: any
// other origin — e.g. the WSL IP we browse from — gets a 403 preflight). The
// proxy makes requests same-origin for the browser and strips the Origin
// header so the server never sees the dev host.
// Dev only. TODO(backend): production needs the deploy domain on the CORS
// allow-list (REPORT #5) — `.env.production` calls the API directly.
const apiProxy = {
  target: API_TARGET,
  changeOrigin: true,
  secure: true,
  configure: (proxy: { on: (event: "proxyReq", cb: (req: { removeHeader: (name: string) => void }) => void) => void }) => {
    proxy.on("proxyReq", (proxyReq) => {
      proxyReq.removeHeader("origin");
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // WSL2 환경에서 Windows 브라우저가 접속할 수 있도록 모든 인터페이스에 바인딩
    host: true,
    proxy: {
      "/api": apiProxy,
      "/health": apiProxy,
      // Player photos: /static/players/{id}.webp
      "/static": apiProxy,
    },
  },
});
