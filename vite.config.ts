import { defineConfig } from "vite";

const docxChunkPackages = [
  "/docx/",
  "/hash.js/",
  "/jszip/",
  "/lie/",
  "/nanoid/",
  "/pako/",
  "/readable-stream/",
  "/sax/",
  "/setimmediate/",
  "/xml/",
  "/xml-js/"
];

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
    minify: "oxc",
    cssCodeSplit: true,
    cssMinify: true,
    assetsInlineLimit: 4096,
    reportCompressedSize: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            const normalizedId = id.replace(/\\/g, "/");
            if (docxChunkPackages.some((packageName) => normalizedId.includes(`/node_modules${packageName}`))) {
              return "vendor-docx";
            }
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
