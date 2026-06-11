import path from "path";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    legacy({
      // 只输出 legacy chunks，确保 file:// 也能直接打开（用于原型交付）
      targets: ["defaults", "not IE 11"],
      renderModernChunks: false,
    }),
    react({
      babel: {
        plugins: ["./scripts/babel-plugin-jsx-source-location.cjs"],
      },
    }),
    tailwindcss(),
    {
      name: "strip-crossorigin-for-file",
      enforce: "post",
      transformIndexHtml(html: string) {
        // file:// 下，SystemJS 会给动态加载的 script 强制设置 crossorigin=anonymous，导致资源加载失败。
        // 处理策略：
        // 1) 移除 HTML 内所有 crossorigin
        // 2) 重写 vite-legacy-entry 的内联脚本：在 import 前 patch System.createScript 去掉 crossorigin
        let out = html.replace(/\s+crossorigin\b(=""|="anonymous")?/g, "");
        out = out.replace(
          /<script\s+id="vite-legacy-entry"([^>]*)data-src="([^"]+)"([^>]*)>[^<]*<\/script>/,
          (_m, a, src, b) =>
            `<script id="vite-legacy-entry"${a}data-src="${src}"${b}>(function(){try{if(location.protocol==='file:'&&window.System&&System.createScript){var orig=System.createScript.bind(System);System.createScript=function(u){var s=orig(u);try{s.crossOrigin=null;s.removeAttribute('crossorigin');}catch(e){}return s;};}}catch(e){}System.import(document.getElementById('vite-legacy-entry').getAttribute('data-src'));})();</script>`
        );
        return out;
      },
    },
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
