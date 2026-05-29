// Lovable hosting uses the standard Lovable TanStack config.
// Vercel needs a Nitro/Vercel server output instead of the Cloudflare build target.
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig as defineViteConfig, type ConfigEnv, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const lovableConfig = defineLovableConfig();

/**
 * Génère public/version.json à chaque build.
 * Utilise le SHA du commit Vercel s'il est dispo, sinon timestamp.
 * Le client (VersionWatcher) poll ce fichier et recharge si la valeur change.
 */
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

export default async function config(env: ConfigEnv) {
  if (process.env.VERCEL === "1") {
    return defineViteConfig({
      server: { host: "::", port: 8080 },
      resolve: {
        alias: {
          "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
        dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query", "@tanstack/query-core"],
      },
      plugins: [versionStampPlugin(), tailwindcss(), tsConfigPaths({ projects: ["./tsconfig.json"] }), tanstackStart(), nitro({ preset: "vercel" }), viteReact()],
    });
  }

  return lovableConfig(env);
}
