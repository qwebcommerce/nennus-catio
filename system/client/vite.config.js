import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-192.png", "pwa-512.png", "favicon.png", "favicon-48.png", "apple-touch-icon.png"],
      manifest: {
        name: "Nennus Catio",
        short_name: "Nennus",
        description: "Nennus Catio — pet villas, products & POS",
        theme_color: "#1e3e2f",
        background_color: "#1e3e2f",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        lang: "ar",
        dir: "rtl",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        /** لا تعامل طلبات الـ API كصفحة SPA (وإلا يُرجَع index.html وتظهر صفحة الدخول) */
        navigateFallbackDenylist: [/^\/api\b/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.cloudfront\.net\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "product-images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-assets",
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 80 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-leaflet") || id.includes("leaflet")) return "map-vendor";
            if (id.includes("recharts")) return "charts-vendor";
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router")) return "react-vendor";
            if (id.includes("@supabase")) return "supabase-vendor";
          }
        },
      },
    },
  },
});
