import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/viewer"),
  base: "/caber-booking/data/",
  build: {
    outDir: path.resolve(__dirname, "data"),
    // MUST stay false: data/ledger.json lives next to the build output.
    // Setting this true would silently delete the user's booking ledger on every build.
    // prebuild:viewer (rimraf data/assets) handles cleanup of just the bundle dir.
    emptyOutDir: false,
    assetsDir: "assets",
    rollupOptions: {
      input: path.resolve(__dirname, "src/viewer/index.html"),
    },
  },
});
