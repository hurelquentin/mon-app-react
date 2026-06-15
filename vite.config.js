import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // En développement local, redirige /api/* vers le serveur Express (port 3001)
    // Lancez "npm run server" dans un second terminal pour activer ce proxy
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
});
