import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  },
});
