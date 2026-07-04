import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // During local `npm run dev`, forward /api to the gateway.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
