import path from "path"

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "build",
		rollupOptions: {
			output: {
				entryFileNames: `assets/[name].js`,
				chunkFileNames: `assets/[name].js`,
				assetFileNames: `assets/[name].[ext]`,
			},
		},
	},
	server: {
		hmr: {
			host: "localhost",
			protocol: "ws",
		},
		cors: {
			origin: "*",
			methods: "*",
			allowedHeaders: "*",
		},
		headers: {
			"Content-Security-Policy": "default-src 'self'; connect-src 'self' http://* https://* ws: wss:",
		},
		proxy: {
			"/aicoding": {
				target: "http://22.189.54.139",
				changeOrigin: true,
				secure: false,
			},
		},
	},
	define: {
		"process.platform": JSON.stringify(process.platform),
	},
})
