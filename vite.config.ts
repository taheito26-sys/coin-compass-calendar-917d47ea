import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.GITHUB_SHA ||
        process.env.COMMIT_SHA ||
        new Date().toISOString()
    ),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api/coingecko': {
        target: 'https://api.coingecko.com/api/v3',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/coingecko/, ''),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["logo.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png", "robots.txt"],
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
            },
          },
          {
            urlPattern: /^\/api\/coingecko\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "coingecko-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
            },
          },
        ],
      },
      manifest: {
        id: "/",
        name: "Crypto Tracker Pro",
        short_name: "CryptoTracker",
        description: "Professional crypto portfolio tracker with real-time prices and multi-exchange sync.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait-primary",
        scope: "/",
        start_url: "/",
        categories: ["finance"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "@clerk/react"],
    force: true,
  },
}));
