import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.CAMPFIRE_VITE_PORT || 1420);
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1", port, strictPort: true },
  build: { target: "es2022" },
});
