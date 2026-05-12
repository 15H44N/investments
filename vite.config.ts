import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { consoleForwardPlugin } from './vite-console-forward-plugin'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  server: {
    port: 3001,
  },
  plugins: [
    react(),
    consoleForwardPlugin({
      enabled: command === 'serve' || command === 'build',
    }),
  ],
  base: "/investments/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}))
