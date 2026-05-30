import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { fileURLToPath, URL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function versionStampPlugin(): Plugin {
  return {
    name: "version-stamp",
    apply: "build",
    buildStart() {
      const version =
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.VERCEL_DEPLOYMENT_ID ||
        String(Date.now());
      const target = resolve(process.cwd(), "public/version.json");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2),
      );
    },
  };
}

export default defineConfig({
  plugins: [
    versionStampPlugin(),
    TanStackRouterVite({ autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    outDir: "dist",
    // Relative asset paths so the app works at any server sub-path (e.g. /crminternet/)
    // and doesn't break when files are previewed locally.
    assetsDir: "assets",
  },
  base: "./",
});
