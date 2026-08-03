import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false
  },
  preview: {
    port: 4173,
    strictPort: false
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    cssMinify: true,
    assetsInlineLimit: 4096,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            if (id.includes("lucide")) {
              return "vendor-lucide";
            }
            return "vendor";
          }
        }
      }
    }
  }
});
