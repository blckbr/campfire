import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.CAMPFIRE_VITE_PORT || 1420);

export default defineConfig(({ mode }) => {
  const webMode = mode === "web";

  return {
    // Keep the packaged Electron renderer relative; Web mode overrides this below.
    base: "./",
    ...(webMode ? { base: "/" } : {}),
    plugins: [react()],
    server: {
      host: webMode ? "0.0.0.0" : "127.0.0.1",
      port,
      strictPort: !webMode,
    },
    build: { target: "es2022" },
  };
});
