import { defineConfig, loadEnv } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import vue from "@vitejs/plugin-vue";
import copy from "rollup-plugin-copy";
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

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    console.log('VITE_API_SERVER:', env.VITE_API_SERVER);

    return {
        build: {
            sourcemap: false,
            minify: true,
            target: "esnext",
        },
        plugins: [
            topLevelAwait(),
            vue(),
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
        server: {
            proxy: {
                '/api': {
                    target: env.VITE_API_SERVER,
                    changeOrigin: true, // Changes the origin of the host header to the target URL
                    rewrite: (path) => path.replace(/^\/api/, ''), // Remove /api prefix when forwarding
                },
            },
        },
    };
});