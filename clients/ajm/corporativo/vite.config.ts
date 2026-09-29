import { defineConfig, loadEnv, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

// AJM is a client site: no shared neoCRM aliases (@ui, @brand, @i18n, …) on purpose.
// Media (loops, posters, photos) is served from Cloudflare R2 in production via VITE_MEDIA_BASE;
// without it, /media (scripts/encode-media.sh output in public/media) is used.
const DEFAULT_MEDIA_BASE = "/media";

// vue-i18n's message compiler contains a literal U+FFFD; some hosts reject bundles carrying it,
// so it is written as its escape instead (identical at runtime).
const escapeReplacementChar: Plugin = {
  name: "escape-replacement-char",
  generateBundle(_opts, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === "chunk") chunk.code = chunk.code.replaceAll("�", "\\uFFFD");
    }
  },
};

// Preload the hero poster (the first screen) from wherever media lives.
function heroPreload(mediaBase: string): Plugin {
  return {
    name: "hero-preload",
    transformIndexHtml() {
      return [
        { tag: "link", attrs: { rel: "preload", as: "image", type: "image/avif", media: "(max-width: 700px)", href: `${mediaBase}/hero/poster-640.avif` }, injectTo: "head" },
        { tag: "link", attrs: { rel: "preload", as: "image", type: "image/avif", media: "(min-width: 701px)", href: `${mediaBase}/hero/poster.avif` }, injectTo: "head" },
      ];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const mediaBase = (process.env.VITE_MEDIA_BASE ?? env.VITE_MEDIA_BASE ?? DEFAULT_MEDIA_BASE).replace(/\/+$/, "");
  return {
    plugins: [vue(), escapeReplacementChar, heroPreload(mediaBase)],
    server: { port: 5180 },
    build: { target: "es2020", cssCodeSplit: true },
  };
});
