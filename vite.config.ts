import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => {
  return {
    server: {
      port: 3005,
      host: "0.0.0.0",
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        includeAssets: ["icon.svg", "apple-touch-icon.png", "masked-icon.svg"],
        manifest: {
          name: "Hub - Your Central Workspace",
          short_name: "Hub",
          description: "All-in-one app connecting work and personal life",
          theme_color: "#ffffff",
          background_color: "#f1f5f9",
          display: "standalone",
          orientation: "any",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
            {
              src: "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "maskable",
            },
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          // 1. Web Share Target API
          share_target: {
            action: "/memos", // 直接memosページを開く
            method: "GET",
            enctype: "application/x-www-form-urlencoded",
            params: {
              title: "title",
              text: "text",
              url: "url",
            },
          },
          // 2. App Shortcuts
          shortcuts: [
            {
              name: "New Memo",
              short_name: "Memo",
              description: "Create a new memo",
              url: "/memos?action=new",
              icons: [{ src: "icon.svg", sizes: "192x192" }],
            },
            {
              name: "Add Task",
              short_name: "Task",
              description: "Add a new task",
              url: "/tasks?action=new",
              icons: [{ src: "icon.svg", sizes: "192x192" }],
            },
            {
              name: "Add Client",
              short_name: "Client",
              description: "Add a new client",
              url: "/community?action=new",
              icons: [{ src: "icon.svg", sizes: "192x192" }],
            },
          ],
        },
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          rollupOptions: {
            treeshake: false,
          },
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
