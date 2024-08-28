import { defineConfig } from "vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import vue from "@vitejs/plugin-vue";
import copy from "rollup-plugin-copy";
import { viteStaticCopy } from 'vite-plugin-static-copy'


import { visualizer } from "rollup-plugin-visualizer";
import analyze from "rollup-plugin-analyzer";

import topLevelAwait from "vite-plugin-top-level-await";

const wasmContentTypePlugin = {
    name: "wasm-content-type-plugin",
    configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
            if (req.url.endsWith(".wasm")) {
                res.setHeader("Content-Type", "application/wasm");
            }
            next();
        });
    },
};

// https://vitejs.dev/config/
export default defineConfig({
    build: {
        sourcemap: false,
        minify: true,
        target: "esnext",
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    plugins: [
        topLevelAwait(),
        vue(),
        viteStaticCopy({
            targets: [
              {
                src: "node_modules/onnxruntime-web/**/*.wasm",
                dest: '/node_modules/.vite/deps'
              }
            ]
        }),
        copy({
            targets: [
                {
                    src: "node_modules/@aztec/**/*.wasm",
                    dest: "node_modules/.vite/deps",
                },
                {
                    src: "node_modules/@noir-lang/**/*.wasm",
                    dest: "node_modules/.vite/deps",
                },
                // {
                //     src: "node_modules/onnxruntime-web/dist/*.wasm",
                //     dest: "node_modules/.vite/deps",
                // },
            ],
            copySync: true,
            hook: "buildStart",
        }),
        wasmContentTypePlugin,
        nodePolyfills({
            include: ["buffer", "path", "fs", "os", "crypto", "stream", "vm"],
            globals: {
                Buffer: true, // can also be 'build', 'dev', or false
                global: true,
                process: true,
            },
            protocolImports: false,
        }),
        // visualizer(),
        // analyze(),
    ],
});
